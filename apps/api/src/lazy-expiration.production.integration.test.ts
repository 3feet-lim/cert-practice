import { randomUUID } from "node:crypto";

import {
  DsqlMigrationRunner,
  DsqlPoolLifecycle,
  DsqlUnitOfWork,
  createDisposableDsqlSchema,
  loadApplicationMigrations,
  type DsqlPool,
  type SqlClient,
  type SqlPool,
} from "@cert-quiz/db";
import {
  LifecycleServices,
  SessionFactory,
  type PersistedQuestionSnapshot,
} from "@cert-quiz/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createApp,
  type CognitoTokenVerifier,
  type CreateAppDependencies,
} from "./app.js";
import type { VerifiedCognitoClaims } from "./authentication.js";

const enabled = process.env.RUN_DSQL_LAZY_EXPIRATION_SUITE === "true";
const describeLive = enabled ? describe : describe.skip;
const NOW = new Date("2026-03-20T00:00:00.000Z");
const expiresAt = new Date("2026-03-20T00:01:00.000Z");

/**
 * Production-table coverage for Requirement 11. It is deliberately opt-in:
 * each case creates a disposable schema in Aurora DSQL and removes it again.
 */
describeLive("production DSQL all-route lazy expiration integration", () => {
  let harness: LiveHarness;

  beforeEach(async () => {
    harness = await createLiveHarness();
  }, 60_000);

  afterEach(async () => {
    await harness?.cleanup();
  }, 60_000);

  it("finalizes an owned expired exam before every authenticated route family handler", async () => {
    const actor = await createApprovedAdmin(harness);
    const certification = await seedActiveCertification(harness, actor.id);
    const clock = { now: new Date(NOW) };
    const app = productionApp(harness.unitOfWork, actor.googleSub, clock);
    const unknownId = randomUUID();
    const requests: ReadonlyArray<readonly [string, RequestInit?]> = [
      ["/v1/me/approval"],
      ["/v1/me"],
      ["/v1/catalog"],
      [
        `/v1/certifications/${certification.id}/practice/start`,
        { method: "POST", body: "{}" },
      ],
      [`/v1/practice/${unknownId}/resume`, { method: "POST" }],
      [`/v1/practice-results/${unknownId}`],
      [`/v1/exams/${unknownId}`],
      [`/v1/attempts/${unknownId}`],
      ["/v1/history"],
      ["/v1/history/trends"],
      [`/v1/leaderboards/${certification.id}`],
      ["/v1/admin/pending-users"],
    ];

    for (const [path, init] of requests) {
      const exam = await createExpiredExam(harness, actor.id, certification.key);
      const response = await authorizedRequest(app, path, init);
      expect(response.status, path).toBeLessThan(500);
      await expectExpiredAttempt(harness, exam.id);
    }
  }, 60_000);

  it("keeps the ordered committed prefix, stops at a failed session, and blocks the original handler", async () => {
    const actor = await createApprovedAdmin(harness);
    const certification = await seedActiveCertification(harness, actor.id);
    const clock = { now: new Date(NOW) };
    const app = productionApp(harness.unitOfWork, actor.googleSub, clock);
    const first = await createExpiredExam(harness, actor.id, certification.key, 3);
    const failed = await createExpiredExam(harness, actor.id, certification.key, 2);
    const unprocessed = await createExpiredExam(harness, actor.id, certification.key, 1);
    harness.hooks.failOnAttemptInsert(2);

    const response = await authorizedRequest(app, "/v1/me");
    expect(response.status).toBe(503);
    const payload = (await response.json()) as {
      error: { code: string; details?: ReadonlyArray<{ identifier?: string }> };
    };
    expect(payload.error).toMatchObject({ code: "submission-failed" });
    expect(payload.error.details).toEqual([
      expect.objectContaining({ identifier: failed.id }),
    ]);
    await expectExpiredAttempt(harness, first.id);
    await expectNoAttempt(harness, failed.id);
    await expectNoAttempt(harness, unprocessed.id);
    expect(await examStatus(harness, failed.id)).toBe("active");
    expect(await examStatus(harness, unprocessed.id)).toBe("active");
  }, 60_000);

  it("linearizes concurrent manual and expiry finalization to one immutable Attempt", async () => {
    const actor = await createApprovedAdmin(harness);
    const certification = await seedActiveCertification(harness, actor.id);
    const clock = { now: new Date(NOW) };
    const lifecycle = productionLifecycle(harness.unitOfWork, clock);
    const exam = await createExpiredExam(harness, actor.id, certification.key);
    const barrier = harness.hooks.barrierBefore(
      "UPDATE exam_sessions SET status = 'submitted'",
      2,
    );

    const [manual] = await Promise.all([
      lifecycle.submitExam(actor.id, exam.id, new Date(expiresAt.getTime() - 1)),
      lifecycle.finalizeExpiredOwned(actor.id, new Date(expiresAt)),
    ]);

    expect(manual.examSessionId).toBe(exam.id);
    expect(barrier.arrivals).toBe(2);
    expect(await attemptCount(harness, exam.id)).toBe(1);
    expect(await examStatus(harness, exam.id)).toBe("submitted");
  }, 60_000);
});

type Clock = { now: Date };
type Actor = { id: string; googleSub: string };
type Certification = { id: string; key: string };
type LiveHarness = {
  unitOfWork: DsqlUnitOfWork;
  database: SchemaScopedDatabase;
  hooks: TestQueryHooks;
  cleanup(): Promise<void>;
};

class FixtureVerifier implements CognitoTokenVerifier {
  constructor(private readonly googleSub: string) {}

  async verify(token: string): Promise<VerifiedCognitoClaims> {
    if (token !== "actor") throw new Error("Invalid fixture token.");
    return {
      identities: JSON.stringify([{ providerName: "Google", userId: this.googleSub }]),
      email: "actor@example.test",
      name: "Production actor",
    };
  }
}

function productionApp(
  unitOfWork: DsqlUnitOfWork,
  googleSub: string,
  clock: Clock,
) {
  const dependencies: CreateAppDependencies = {
    tokenVerifier: new FixtureVerifier(googleSub),
    unitOfWork,
    lifecycle: productionLifecycle(unitOfWork, clock),
    now: () => new Date(clock.now),
    createUserId: randomUUID,
  };
  return createApp(dependencies);
}

function productionLifecycle(unitOfWork: DsqlUnitOfWork, clock: Clock): LifecycleServices {
  return new LifecycleServices({
    unitOfWork,
    now: () => new Date(clock.now),
    createId: randomUUID,
    sessionFactory: new SessionFactory({
      now: () => new Date(clock.now),
      ids: { next: randomUUID },
      random: { nextInt: () => 0 },
    }),
  });
}

async function authorizedRequest(
  app: ReturnType<typeof createApp>,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return app.request(path, {
    ...init,
    headers: {
      authorization: "Bearer actor",
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function createLiveHarness(): Promise<LiveHarness> {
  const endpoint = requiredEnvironment("DSQL_ENDPOINT");
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region)
    throw new Error(
      "RUN_DSQL_LAZY_EXPIRATION_SUITE=true requires AWS_REGION or AWS_DEFAULT_REGION.",
    );

  const schema = `lazy_expiration_${randomUUID().replaceAll("-", "")}`;
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
    await new DsqlMigrationRunner(database).migrate(await loadApplicationMigrations());
    return {
      unitOfWork: new DsqlUnitOfWork(scopedPool, { maxOccRetries: 8, retryDelayMs: 10 }),
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

async function createApprovedAdmin(harness: LiveHarness): Promise<Actor> {
  const id = randomUUID();
  const googleSub = `lazy-expiration-${id}`;
  await harness.unitOfWork.transaction(async (repos) => {
    await repos.users.getOrCreatePendingByGoogleSub({
      id,
      googleSub,
      displayName: "Production actor",
      email: "actor@example.test",
      now: NOW,
    });
    await repos.users.approvePending(id, NOW);
  });
  await harness.database.query("UPDATE user_profiles SET role = 'admin' WHERE id = $1", [id]);
  return { id, googleSub };
}

async function seedActiveCertification(
  harness: LiveHarness,
  importedBy: string,
): Promise<Certification> {
  const revisionId = randomUUID();
  const providerId = randomUUID();
  const certificationId = randomUUID();
  const domainId = randomUUID();
  const questionId = randomUUID();
  const choiceId = randomUUID();
  const key = `lazy-expiration-${revisionId}`;
  await harness.database.query(
    `INSERT INTO catalog_revisions
       (id, certification_key, content_hash, imported_by, imported_at, status)
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [revisionId, key, hash(revisionId), importedBy, NOW],
  );
  await harness.database.query(
    `INSERT INTO providers (id, revision_id, external_key, name, logo_url)
     VALUES ($1, $2, $3, 'DSQL Provider', NULL)`,
    [providerId, revisionId, "provider"],
  );
  await harness.database.query(
    `INSERT INTO certifications
       (id, revision_id, provider_id, external_key, code, name, total_questions,
        time_limit_minutes, threshold_numerator, threshold_denominator, scoring_mode)
     VALUES ($1, $2, $3, $4, 'DSQL-LAZY', 'DSQL Lazy Expiration', 1, 1,
             75, 1, 'all_or_nothing')`,
    [certificationId, revisionId, providerId, key],
  );
  await harness.database.query(
    `INSERT INTO domains
       (id, revision_id, certification_id, external_key, name, weight_basis_points, order_index)
     VALUES ($1, $2, $3, 'domain', 'Domain', 10000, 0)`,
    [domainId, revisionId, certificationId],
  );
  await harness.database.query(
    `INSERT INTO questions
       (id, revision_id, certification_id, domain_id, external_key, stem_en, stem_ko,
        explanation_en, explanation_ko, translation_status, required_choice_count)
     VALUES ($1, $2, $3, $4, 'question', 'Question', NULL, 'Explanation', NULL,
             'en_only', 1)`,
    [questionId, revisionId, certificationId, domainId],
  );
  await harness.database.query(
    `INSERT INTO choices
       (id, revision_id, question_id, external_key, text_en, text_ko, order_index, is_correct)
     VALUES ($1, $2, $3, 'choice', 'Choice', NULL, 0, true)`,
    [choiceId, revisionId, questionId],
  );
  await harness.database.query(
    `INSERT INTO catalog_heads (certification_key, active_revision_id, updated_at, version)
     VALUES ($1, $2, $3, 0)`,
    [key, revisionId, NOW],
  );
  return { id: certificationId, key };
}

async function createExpiredExam(
  harness: LiveHarness,
  userId: string,
  certificationKey: string,
  offsetMinutes = 1,
): Promise<{ id: string }> {
  const id = randomUUID();
  const effectiveExpiry = new Date(expiresAt.getTime() - offsetMinutes * 1_000);
  await harness.unitOfWork.transaction((repos) =>
    repos.exams.createWithSnapshots({
      id,
      userId,
      certificationKey,
      startRequestKey: randomUUID(),
      currentIndex: 0,
      startedAt: new Date(effectiveExpiry.getTime() - 60_000),
      expiresAt: effectiveExpiry,
      questions: [question(randomUUID())],
    }),
  );
  return { id };
}

function question(id: string): PersistedQuestionSnapshot {
  return {
    id,
    displayIndex: 0,
    content: {
      certification: {
        id: "snapshot-certification",
        code: "DSQL-LAZY",
        name: "DSQL Lazy Expiration",
        scoringMode: "all_or_nothing",
        passThreshold: "75",
      },
      domainName: "Domain",
      stem: { en: "Question", ko: null },
      explanation: { en: "Explanation", ko: null },
      choices: [{ id: "choice", text: { en: "Choice", ko: null } }],
      correctChoiceIds: ["choice"],
      requiredChoiceCount: 1,
      translationStatus: "en_only",
    },
    selectedChoiceIds: ["choice"],
    finalChoiceIds: null,
    earnedScore: null,
    flagged: false,
    savedAt: new Date(NOW),
    version: 0n,
  };
}

async function expectExpiredAttempt(harness: LiveHarness, sessionId: string): Promise<void> {
  const result = await harness.database.query<{ submission_reason: string }>(
    "SELECT submission_reason FROM attempts WHERE exam_session_id = $1",
    [sessionId],
  );
  expect(result.rows).toEqual([{ submission_reason: "expired" }]);
}

async function expectNoAttempt(harness: LiveHarness, sessionId: string): Promise<void> {
  expect(await attemptCount(harness, sessionId)).toBe(0);
}

async function attemptCount(harness: LiveHarness, sessionId: string): Promise<number> {
  const result = await harness.database.query<{ count: string }>(
    "SELECT count(*)::text AS count FROM attempts WHERE exam_session_id = $1",
    [sessionId],
  );
  return Number(result.rows[0]?.count ?? 0);
}

async function examStatus(harness: LiveHarness, sessionId: string): Promise<string | undefined> {
  const result = await harness.database.query<{ status: string }>(
    "SELECT status FROM exam_sessions WHERE id = $1",
    [sessionId],
  );
  return result.rows[0]?.status;
}

type QueryHook = {
  before(text: string): Promise<void>;
  after(text: string): Promise<void>;
};

class TestQueryHooks implements QueryHook {
  #barrier: QueryBarrier | undefined;
  #failOnAttemptInsert: number | undefined;
  #attemptInsertCount = 0;

  barrierBefore(fragment: string, participants: number): QueryBarrier {
    const barrier = new QueryBarrier(fragment, participants);
    this.#barrier = barrier;
    return barrier;
  }

  failOnAttemptInsert(insertNumber: number): void {
    this.#failOnAttemptInsert = insertNumber;
  }

  async before(text: string): Promise<void> {
    await this.#barrier?.wait(text);
  }

  async after(text: string): Promise<void> {
    if (!text.includes("INSERT INTO attempts")) return;
    this.#attemptInsertCount += 1;
    if (this.#attemptInsertCount !== this.#failOnAttemptInsert) return;
    this.#failOnAttemptInsert = undefined;
    throw new Error("Injected lazy-expiration attempt failure");
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

  async query<Row>(
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
      `RUN_DSQL_LAZY_EXPIRATION_SUITE=true requires ${key}; provide a reachable Aurora DSQL endpoint.`,
    );
  return value;
}
