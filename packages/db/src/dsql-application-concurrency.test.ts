import { randomUUID } from "node:crypto";

import { Fraction, type ImportCommitCommand, type PersistedQuestionSnapshot } from "@cert-quiz/domain";
import type { QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDisposableDsqlSchema } from "./dsql-disposable-schema.js";
import { DsqlPoolLifecycle, type DsqlPool } from "./dsql-pool.js";
import { DsqlUnitOfWork, type SqlClient, type SqlPool } from "./dsql-unit-of-work.js";
import { DsqlMigrationRunner } from "./migrate.js";
import { loadApplicationMigrations } from "./migrations.js";

const enabled = process.env.RUN_DSQL_APPLICATION_TABLE_SUITE === "true";
const describeLive = enabled ? describe : describe.skip;
const now = new Date("2026-03-20T00:00:00.000Z");
const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

/**
 * These tests intentionally run only when explicitly opted in. Every case creates
 * and drops a random schema, applies the application migrations, and exercises
 * DsqlUnitOfWork against the production table names rather than spike tables.
 */
describeLive("production DSQL application-table concurrency and fault suite", () => {
  let harness: LiveHarness;

  beforeEach(async () => {
    harness = await createLiveHarness();
  }, 60_000);

  afterEach(async () => {
    await harness?.cleanup();
  }, 60_000);

  it("converges a barrier-released profile race to exactly one application profile", async () => {
    const barrier = harness.hooks.barrierBefore("INSERT INTO user_profiles", 2);
    const googleSub = `live-profile-${randomUUID()}`;
    const results = await Promise.all(
      [randomUUID(), randomUUID()].map((id, index) =>
        harness.unitOfWork.transaction((repos) =>
          repos.users.getOrCreatePendingByGoogleSub({
            id,
            googleSub,
            displayName: `Concurrent ${index}`,
            email: `concurrent-${index}@example.test`,
            now,
          }),
        ),
      ),
    );

    expect(new Set(results.map((profile) => profile.id))).toHaveLength(1);
    expect(await count(harness, "user_profiles", "google_sub = $1", [googleSub])).toBe(1);
    expect(barrier.arrivals).toBe(2);
  }, 60_000);

  it("keeps one active practice slot when replacement writers collide at the application table", async () => {
    const user = await createUser(harness);
    const certification = await seedActiveCertification(harness, user.id, "practice-live");
    const first = newPractice(user.id, certification.key);
    const second = newPractice(user.id, certification.key);
    const barrier = harness.hooks.barrierBefore("INSERT INTO practice_sessions", 2);

    const results = await Promise.all(
      [first, second].map((input) =>
        harness.unitOfWork.transaction((repos) => repos.practice.replaceAtomically(input)),
      ),
    );

    expect(results).toHaveLength(2);
    expect(barrier.arrivals).toBe(2);
    expect(
      await count(
        harness,
        "practice_sessions",
        "user_id = $1 AND certification_key = $2 AND status = 'active'",
        [user.id, certification.key],
      ),
    ).toBe(1);
    expect(
      await count(
        harness,
        "practice_session_questions",
        "practice_session_id IN (SELECT id FROM practice_sessions WHERE user_id = $1 AND certification_key = $2 AND status = 'active')",
        [user.id, certification.key],
      ),
    ).toBe(1);
  }, 60_000);

  it("locks one first submission and creates one completed result under a barrier race", async () => {
    const user = await createUser(harness);
    const certification = await seedActiveCertification(harness, user.id, "submit-live");
    const practice = newPractice(user.id, certification.key);
    await harness.unitOfWork.transaction((repos) => repos.practice.replaceAtomically(practice));
    const barrier = harness.hooks.barrierBefore(
      "UPDATE practice_sessions SET version = version + 1",
      2,
    );

    const results = await Promise.all(
      ["a", "b"].map((choice, index) =>
        harness.unitOfWork.transaction((repos) =>
          repos.practice.submitFirstAnswer({
            userId: user.id,
            sessionId: practice.id,
            expectedVersion: 0n,
            questionId: practice.questions[0]!.id,
            selectedChoiceIds: [choice],
            earnedScore: Fraction.of(BigInt(index)),
            completedResult: completedResult(index),
          }),
        ),
      ),
    );

    expect(barrier.arrivals).toBe(2);
    expect(results.filter((result) => result?.firstSubmission)).toHaveLength(1);
    expect(
      await count(
        harness,
        "completed_practice_results",
        "source_practice_session_id = $1",
        [practice.id],
      ),
    ).toBe(1);
    const locked = await harness.database.query<{ final_choice_ids: string[] | string | null }>(
      "SELECT final_choice_ids FROM practice_session_questions WHERE practice_session_id = $1",
      [practice.id],
    );
    expect(choiceIds(locked.rows[0]?.final_choice_ids)).toHaveLength(1);
  }, 60_000);

  it("returns one immutable Attempt to manual and expiry finalizers released at a barrier", async () => {
    const user = await createUser(harness);
    const certification = await seedActiveCertification(harness, user.id, "finalize-live");
    const exam = newExam(user.id, certification.key);
    await harness.unitOfWork.transaction((repos) => repos.exams.createWithSnapshots(exam));
    const barrier = harness.hooks.barrierBefore(
      "UPDATE exam_sessions SET status = 'submitted'",
      2,
    );

    const attempts = await Promise.all(
      ["manual", "expired"].map((submissionReason, index) =>
        harness.unitOfWork.transaction((repos) =>
          repos.exams.finalizeOnce({
            ...finalizeCommand(user.id, exam.id, submissionReason as "manual" | "expired"),
            id: randomUUID(),
            submittedAt: later(index + 1),
          }),
        ),
      ),
    );

    expect(barrier.arrivals).toBe(2);
    expect(attempts.every((attempt) => attempt !== null)).toBe(true);
    expect(new Set(attempts.map((attempt) => attempt?.id))).toHaveLength(1);
    expect(await count(harness, "attempts", "exam_session_id = $1", [exam.id])).toBe(1);
    const session = await harness.database.query<{ status: string; attempt_id: string | null }>(
      "SELECT status, attempt_id FROM exam_sessions WHERE id = $1",
      [exam.id],
    );
    expect(session.rows[0]).toMatchObject({ status: "submitted", attempt_id: attempts[0]?.id });
  }, 60_000);

  it("switches an application catalog head only to a complete committed revision under a barrier race", async () => {
    const user = await createUser(harness);
    const certification = await seedActiveCertification(harness, user.id, "import-live");
    const commands = [
      await validatedImport(harness, user.id, certification.key, "first"),
      await validatedImport(harness, user.id, certification.key, "second"),
    ];
    const barrier = harness.hooks.barrierBefore(
      "UPDATE catalog_heads SET active_revision_id",
      2,
    );

    await Promise.all(
      commands.map((command) =>
        harness.unitOfWork.transaction((repos) => repos.catalog.commitValidatedImport(command)),
      ),
    );

    expect(barrier.arrivals).toBe(2);
    const head = await harness.database.query<{ active_revision_id: string }>(
      "SELECT active_revision_id FROM catalog_heads WHERE certification_key = $1",
      [certification.key],
    );
    const activeRevisionId = head.rows[0]?.active_revision_id;
    expect(activeRevisionId).toBeTruthy();
    expect(commands.map((command) => command.materialization.revision.id)).toContain(
      activeRevisionId,
    );
    expect(
      await count(harness, "catalog_revisions", "certification_key = $1 AND status = 'active'", [
        certification.key,
      ]),
    ).toBe(1);
    await expectCompleteRevision(harness, activeRevisionId!);
    expect(
      await count(harness, "import_validations", "status = 'consumed' AND id = ANY($1::uuid[])", [
        commands.map((command) => command.validationId),
      ]),
    ).toBe(2);
  }, 60_000);

  for (const stage of ["INSERT INTO user_profiles"]) {
    it(`rolls back profile creation when persistence fails after ${stage}`, async () => {
      const googleSub = `fault-profile-${randomUUID()}`;
      harness.hooks.failAfter(stage);

      await expect(
        harness.unitOfWork.transaction((repos) =>
          repos.users.getOrCreatePendingByGoogleSub({
            id: randomUUID(),
            googleSub,
            displayName: "Fault profile",
            email: "fault-profile@example.test",
            now,
          }),
        ),
      ).rejects.toThrow("Injected post-write fault");

      expect(await count(harness, "user_profiles", "google_sub = $1", [googleSub])).toBe(0);
    }, 60_000);
  }

  for (const stage of [
    "DELETE FROM practice_session_questions",
    "DELETE FROM practice_sessions",
    "INSERT INTO practice_sessions",
    "INSERT INTO practice_session_questions",
  ]) {
    it(`rolls back an active-practice replacement after ${stage}`, async () => {
      const user = await createUser(harness);
      const certification = await seedActiveCertification(harness, user.id, `replace-${randomUUID()}`);
      const oldPractice = newPractice(user.id, certification.key);
      await harness.unitOfWork.transaction((repos) =>
        repos.practice.replaceAtomically(oldPractice),
      );
      const replacement = newPractice(user.id, certification.key);
      harness.hooks.failAfter(stage);

      await expect(
        harness.unitOfWork.transaction((repos) =>
          repos.practice.replaceAtomically(replacement),
        ),
      ).rejects.toThrow("Injected post-write fault");

      expect(
        await count(harness, "practice_sessions", "id = $1 AND status = 'active'", [oldPractice.id]),
      ).toBe(1);
      expect(
        await count(
          harness,
          "practice_session_questions",
          "practice_session_id = $1",
          [oldPractice.id],
        ),
      ).toBe(1);
      expect(await count(harness, "practice_sessions", "id = $1", [replacement.id])).toBe(0);
    }, 60_000);
  }

  for (const stage of [
    "UPDATE practice_sessions SET version = version + 1",
    "UPDATE practice_session_questions SET selected_choice_ids",
    "INSERT INTO completed_practice_results",
    "INSERT INTO completed_practice_items",
    "UPDATE practice_sessions SET status = 'completed'",
  ]) {
    it(`rolls back first submit and completion after ${stage}`, async () => {
      const user = await createUser(harness);
      const certification = await seedActiveCertification(harness, user.id, `submit-fault-${randomUUID()}`);
      const practice = newPractice(user.id, certification.key);
      await harness.unitOfWork.transaction((repos) => repos.practice.replaceAtomically(practice));
      harness.hooks.failAfter(stage);

      await expect(
        harness.unitOfWork.transaction((repos) =>
          repos.practice.submitFirstAnswer({
            userId: user.id,
            sessionId: practice.id,
            expectedVersion: 0n,
            questionId: practice.questions[0]!.id,
            selectedChoiceIds: ["a"],
            earnedScore: Fraction.of(1n),
            completedResult: completedResult(1),
          }),
        ),
      ).rejects.toThrow("Injected post-write fault");

      const state = await harness.database.query<{
        status: string;
        version: string;
        final_choice_ids: string[] | string | null;
      }>(
        `SELECT session.status, session.version, question.final_choice_ids
         FROM practice_sessions session
         JOIN practice_session_questions question ON question.practice_session_id = session.id
         WHERE session.id = $1`,
        [practice.id],
      );
      expect(state.rows[0]).toMatchObject({ status: "active", version: "0", final_choice_ids: null });
      expect(
        await count(
          harness,
          "completed_practice_results",
          "source_practice_session_id = $1",
          [practice.id],
        ),
      ).toBe(0);
      expect(await count(harness, "completed_practice_items", "1 = 1")).toBe(0);
    }, 60_000);
  }

  for (const stage of [
    "UPDATE exam_sessions SET status = 'submitted'",
    "INSERT INTO attempts",
    "INSERT INTO attempt_items",
  ]) {
    it(`rolls back finalize after ${stage}`, async () => {
      const user = await createUser(harness);
      const certification = await seedActiveCertification(harness, user.id, `finalize-fault-${randomUUID()}`);
      const exam = newExam(user.id, certification.key);
      await harness.unitOfWork.transaction((repos) => repos.exams.createWithSnapshots(exam));
      harness.hooks.failAfter(stage);

      await expect(
        harness.unitOfWork.transaction((repos) =>
          repos.exams.finalizeOnce(finalizeCommand(user.id, exam.id, "manual")),
        ),
      ).rejects.toThrow("Injected post-write fault");

      const state = await harness.database.query<{ status: string; attempt_id: string | null }>(
        "SELECT status, attempt_id FROM exam_sessions WHERE id = $1",
        [exam.id],
      );
      expect(state.rows[0]).toEqual({ status: "active", attempt_id: null });
      expect(await count(harness, "attempts", "exam_session_id = $1", [exam.id])).toBe(0);
      expect(await count(harness, "attempt_items", "1 = 1")).toBe(0);
    }, 60_000);
  }

  for (const stage of [
    "INSERT INTO catalog_revisions",
    "INSERT INTO providers",
    "INSERT INTO certifications",
    "INSERT INTO domains",
    "INSERT INTO questions",
    "INSERT INTO choices",
    "UPDATE catalog_revisions SET status = CASE WHEN id = $2 THEN 'active'",
    "UPDATE catalog_heads SET active_revision_id",
    "UPDATE import_validations SET status = 'consumed'",
  ]) {
    it(`rolls back the import revision and token state after ${stage}`, async () => {
      const user = await createUser(harness);
      const certification = await seedActiveCertification(harness, user.id, `import-fault-${randomUUID()}`);
      const baselineHead = await activeHead(harness, certification.key);
      const command = await validatedImport(harness, user.id, certification.key, "fault");
      harness.hooks.failAfter(stage);

      await expect(
        harness.unitOfWork.transaction((repos) => repos.catalog.commitValidatedImport(command)),
      ).rejects.toThrow("Injected post-write fault");

      expect(await activeHead(harness, certification.key)).toBe(baselineHead);
      expect(
        await count(harness, "import_validations", "id = $1 AND status = 'validated'", [
          command.validationId,
        ]),
      ).toBe(1);
      await expectRevisionAbsent(harness, command.materialization.revision.id);
    }, 60_000);
  }
});

type QueryHook = {
  before(text: string): Promise<void>;
  after(text: string): Promise<void>;
};

class TestQueryHooks implements QueryHook {
  #barrier: QueryBarrier | undefined;
  #failureFragment: string | undefined;

  barrierBefore(fragment: string, participants: number): QueryBarrier {
    const barrier = new QueryBarrier(fragment, participants);
    this.#barrier = barrier;
    return barrier;
  }

  failAfter(fragment: string): void {
    this.#failureFragment = fragment;
  }

  async before(text: string): Promise<void> {
    await this.#barrier?.wait(text);
  }

  async after(text: string): Promise<void> {
    if (this.#failureFragment && text.includes(this.#failureFragment)) {
      const fragment = this.#failureFragment;
      this.#failureFragment = undefined;
      throw new Error(`Injected post-write fault after ${fragment}`);
    }
  }
}

class QueryBarrier {
  #arrivals = 0;
  #release!: () => void;
  readonly #released = new Promise<void>((resolve) => {
    this.#release = resolve;
  });

  constructor(
    private readonly fragment: string,
    private readonly participants: number,
  ) {}

  get arrivals(): number {
    return this.#arrivals;
  }

  async wait(text: string): Promise<void> {
    if (!text.includes(this.fragment) || this.#arrivals >= this.participants) return;
    this.#arrivals += 1;
    if (this.#arrivals === this.participants) this.#release();
    await this.#released;
  }
}

type LiveHarness = {
  unitOfWork: DsqlUnitOfWork;
  database: SchemaScopedDatabase;
  hooks: TestQueryHooks;
  cleanup(): Promise<void>;
};

async function createLiveHarness(): Promise<LiveHarness> {
  const endpoint = requiredEnvironment("DSQL_ENDPOINT");
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region)
    throw new Error(
      "RUN_DSQL_APPLICATION_TABLE_SUITE=true requires AWS_REGION or AWS_DEFAULT_REGION.",
    );

  const schema = `app_concurrency_${randomUUID().replaceAll("-", "")}`;
  const lifecycle = new DsqlPoolLifecycle({
    endpoint,
    region,
    database: process.env.DSQL_DATABASE,
    user: process.env.DSQL_USER,
    caPath: process.env.PGSSLROOTCERT,
  });
  const pool = await lifecycle.pool();
  let disposableSchema: Awaited<ReturnType<typeof createDisposableDsqlSchema>> | undefined;
  try {
    disposableSchema = await createDisposableDsqlSchema(pool, schema);
    const hooks = new TestQueryHooks();
    const scopedPool = new SchemaScopedPool(pool, disposableSchema.name, hooks);
    const database = new SchemaScopedDatabase(scopedPool);
    const runner = new DsqlMigrationRunner(database);
    await runner.migrate(await loadApplicationMigrations());
    return {
      unitOfWork: new DsqlUnitOfWork(scopedPool, {
        maxOccRetries: 8,
        retryDelayMs: 10,
      }),
      database,
      hooks,
      cleanup: async () => {
        try {
          await disposableSchema?.cleanup();
        } finally {
          await lifecycle.close();
        }
      },
    };
  } catch (error) {
    try {
      await disposableSchema?.cleanup();
    } finally {
      await lifecycle.close();
    }
    throw error;
  }
}

class SchemaScopedPool implements SqlPool {
  constructor(
    private readonly pool: DsqlPool,
    private readonly schema: string,
    private readonly hooks: QueryHook,
  ) {}

  async connect(): Promise<SqlClient> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET search_path TO ${quoteIdentifier(this.schema)}`);
      return {
        query: async (text: string, values?: readonly unknown[]) => {
          await this.hooks.before(text);
          const result = await client.query(text, values);
          await this.hooks.after(text);
          return result;
        },
        release: () => client.release(),
      } as SqlClient;
    } catch (error) {
      client.release();
      throw error;
    }
  }
}

class SchemaScopedDatabase {
  constructor(private readonly pool: SchemaScopedPool) {}

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }> {
    const client = await this.pool.connect();
    try {
      return await client.query<Row>(text, values);
    } finally {
      client.release();
    }
  }
}

async function createUser(harness: LiveHarness) {
  const id = randomUUID();
  return harness.unitOfWork.transaction((repos) =>
    repos.users.getOrCreatePendingByGoogleSub({
      id,
      googleSub: `live-${id}`,
      displayName: "Live test user",
      email: `${id}@example.test`,
      now,
    }),
  );
}

async function seedActiveCertification(
  harness: LiveHarness,
  userId: string,
  key: string,
): Promise<{ key: string; revisionId: string; certificationId: string }> {
  const revisionId = randomUUID();
  const providerId = randomUUID();
  const certificationId = randomUUID();
  await harness.database.query(
    `INSERT INTO catalog_revisions
       (id, certification_key, content_hash, imported_by, imported_at, status)
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [revisionId, key, hash(`base-${revisionId}`), userId, now],
  );
  await harness.database.query(
    `INSERT INTO providers (id, revision_id, external_key, name, logo_url)
     VALUES ($1, $2, $3, 'Live provider', NULL)`,
    [providerId, revisionId, providerId],
  );
  await harness.database.query(
    `INSERT INTO certifications
       (id, revision_id, provider_id, external_key, code, name, total_questions,
        time_limit_minutes, threshold_numerator, threshold_denominator, scoring_mode)
     VALUES ($1, $2, $3, $4, $4, 'Live certification', 1, 10, 75, 1, 'all_or_nothing')`,
    [certificationId, revisionId, providerId, key],
  );
  await harness.database.query(
    `INSERT INTO catalog_heads (certification_key, active_revision_id, updated_at, version)
     VALUES ($1, $2, $3, 0)`,
    [key, revisionId, now],
  );
  return { key, revisionId, certificationId };
}

function newPractice(userId: string, certificationKey: string) {
  const questionId = randomUUID();
  return {
    id: randomUUID(),
    userId,
    certificationKey,
    currentIndex: 0,
    createdAt: now,
    questions: [question(questionId)],
  };
}

function newExam(userId: string, certificationKey: string) {
  const questionId = randomUUID();
  return {
    id: randomUUID(),
    userId,
    certificationKey,
    startRequestKey: randomUUID(),
    currentIndex: 0,
    startedAt: now,
    expiresAt: later(20),
    questions: [question(questionId)],
  };
}

function question(id: string): PersistedQuestionSnapshot {
  return {
    id,
    displayIndex: 0,
    content: { certification: { id: "live-certification" }, id },
    selectedChoiceIds: [],
    finalChoiceIds: null,
    earnedScore: null,
    flagged: false,
    version: 0n,
  };
}

function completedResult(index: number) {
  return {
    id: randomUUID(),
    rawScore: Fraction.of(BigInt(index)),
    accuracyRate: Fraction.of(BigInt(index * 100)),
    completedAt: later(index + 1),
    expiresAt: later(10_080 + index),
    payload: { completion: index },
  };
}

function finalizeCommand(
  userId: string,
  sessionId: string,
  submissionReason: "manual" | "expired",
) {
  return {
    id: randomUUID(),
    userId,
    sessionId,
    rawScore: Fraction.of(1n),
    accuracyRate: Fraction.of(100n),
    passThreshold: Fraction.of(75n),
    passed: true,
    reference1000Score: 1000,
    submittedAt: later(1),
    submissionReason,
  };
}

async function validatedImport(
  harness: LiveHarness,
  actorUserId: string,
  certificationKey: string,
  label: string,
): Promise<ImportCommitCommand> {
  const revisionId = randomUUID();
  const providerId = randomUUID();
  const certificationId = randomUUID();
  const domainId = randomUUID();
  const questionId = randomUUID();
  const choiceA = randomUUID();
  const choiceB = randomUUID();
  const validationId = randomUUID();
  const contentHash = hash(`content-${label}-${revisionId}`);
  const tokenDigest = hash(`token-${label}-${validationId}`);
  const command: ImportCommitCommand = {
    validationId,
    actorUserId,
    tokenDigest,
    contentHash,
    now,
    materialization: {
      revision: {
        id: revisionId,
        certificationKey,
        contentHash,
        importedBy: actorUserId,
        importedAt: now,
        document: { label },
      },
      source: {
        revisionId,
        certificationKey,
        providers: [{ id: providerId, revisionId, name: `Provider ${label}`, logoUrl: null }],
        certifications: [
          {
            id: certificationId,
            revisionId,
            providerId,
            externalKey: certificationKey,
            code: certificationKey,
            name: `Certification ${label}`,
            totalQuestions: 1,
            timeLimitMinutes: 10,
            passThreshold: Fraction.of(75n),
            scoringMode: "all_or_nothing",
          },
        ],
        domains: [
          {
            id: domainId,
            revisionId,
            certificationId,
            name: `Domain ${label}`,
            weightBasisPoints: 10_000,
            orderIndex: 0,
          },
        ],
        questions: [{ id: questionId, revisionId, certificationId, domainId }],
      },
      generation: {
        revisionId,
        provider: { id: providerId, revisionId, name: `Provider ${label}`, logoUrl: null },
        certification: {
          id: certificationId,
          revisionId,
          providerId,
          externalKey: certificationKey,
          code: certificationKey,
          name: `Certification ${label}`,
          totalQuestions: 1,
          timeLimitMinutes: 10,
          passThreshold: Fraction.of(75n),
          scoringMode: "all_or_nothing",
        },
        domains: [
          {
            id: domainId,
            revisionId,
            certificationId,
            name: `Domain ${label}`,
            weightBasisPoints: 10_000,
            orderIndex: 0,
          },
        ],
        questions: [
          {
            id: questionId,
            revisionId,
            certificationId,
            domainId,
            domainName: `Domain ${label}`,
            stem: { en: "Question", ko: null },
            explanation: { en: "Explanation", ko: null },
            choices: [
              { id: choiceA, externalId: "a", text: { en: "A", ko: null } },
              { id: choiceB, externalId: "b", text: { en: "B", ko: null } },
            ],
            correctChoiceIndexes: [0],
            requiredChoiceCount: 1,
            translationStatus: "en_only",
          },
        ],
      },
    },
  };
  await harness.unitOfWork.transaction((repos) =>
    repos.catalog.saveValidation({
      id: validationId,
      actorUserId,
      certificationKey,
      contentHash,
      tokenDigest,
      status: "validated",
      expiresAt: later(15),
      version: 0n,
    }),
  );
  return command;
}

async function count(
  harness: LiveHarness,
  table: string,
  predicate: string,
  values: readonly unknown[] = [],
): Promise<number> {
  const result = await harness.database.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table} WHERE ${predicate}`,
    values,
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function activeHead(harness: LiveHarness, certificationKey: string): Promise<string> {
  const result = await harness.database.query<{ active_revision_id: string }>(
    "SELECT active_revision_id FROM catalog_heads WHERE certification_key = $1",
    [certificationKey],
  );
  const id = result.rows[0]?.active_revision_id;
  if (!id) throw new Error("Expected a seeded catalog head.");
  return id;
}

async function expectCompleteRevision(harness: LiveHarness, revisionId: string): Promise<void> {
  await expect(
    Promise.all([
      count(harness, "providers", "revision_id = $1", [revisionId]),
      count(harness, "certifications", "revision_id = $1", [revisionId]),
      count(harness, "domains", "revision_id = $1", [revisionId]),
      count(harness, "questions", "revision_id = $1", [revisionId]),
      count(harness, "choices", "revision_id = $1", [revisionId]),
    ]),
  ).resolves.toEqual([1, 1, 1, 1, 2]);
}

async function expectRevisionAbsent(harness: LiveHarness, revisionId: string): Promise<void> {
  await expect(
    Promise.all([
      count(harness, "catalog_revisions", "id = $1", [revisionId]),
      count(harness, "providers", "revision_id = $1", [revisionId]),
      count(harness, "certifications", "revision_id = $1", [revisionId]),
      count(harness, "domains", "revision_id = $1", [revisionId]),
      count(harness, "questions", "revision_id = $1", [revisionId]),
      count(harness, "choices", "revision_id = $1", [revisionId]),
    ]),
  ).resolves.toEqual([0, 0, 0, 0, 0, 0]);
}

function choiceIds(value: string[] | string | null | undefined): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return JSON.parse(value) as string[];
  return [];
}

function hash(value: string): string {
  return value.padEnd(64, "0").slice(0, 64);
}

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(identifier))
    throw new Error("Invalid disposable DSQL schema identifier.");
  return `\"${identifier}\"`;
}

function requiredEnvironment(key: string): string {
  const value = process.env[key];
  if (!value)
    throw new Error(
      `RUN_DSQL_APPLICATION_TABLE_SUITE=true requires ${key}; provide a reachable Aurora DSQL endpoint.`,
    );
  return value;
}
