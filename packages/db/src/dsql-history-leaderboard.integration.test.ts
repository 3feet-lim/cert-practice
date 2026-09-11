import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import {
  Fraction,
  LifecycleServices,
  SessionFactory,
  type PersistedQuestionSnapshot,
} from "@cert-quiz/domain";
import type { QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDisposableDsqlSchema } from "./dsql-disposable-schema.js";
import { DsqlPoolLifecycle, type DsqlPool } from "./dsql-pool.js";
import { DsqlUnitOfWork, type SqlClient, type SqlPool } from "./dsql-unit-of-work.js";
import { DsqlMigrationRunner } from "./migrate.js";
import { loadApplicationMigrations } from "./migrations.js";

const enabled = process.env.RUN_DSQL_HISTORY_LEADERBOARD_SUITE === "true";
const describeLive = enabled ? describe : describe.skip;
const now = new Date("2026-03-20T00:00:00.000Z");
const p95MsMax = 500;

/**
 * Production-table evidence for Requirements 9.8-9.11, 12.12, and 13.8-14.15.
 *
 * This suite is intentionally opt-in: it creates a random disposable schema in
 * the configured Aurora DSQL cluster, applies application migrations, then
 * removes that schema. Normal local repository tests never connect to AWS.
 */
describeLive("production DSQL history and leaderboard integration", () => {
  let harness: LiveHarness;

  beforeEach(async () => {
    harness = await createLiveHarness();
  }, 60_000);

  afterEach(async () => {
    await harness?.cleanup();
  }, 60_000);

  it("orders cursor pages, preserves exact ranking behind equal display values, and excludes private/practice data", async () => {
    const certification = await seedActiveCertification(harness, "history-live");
    const learner = await createApprovedUser(harness, "Learner");
    const competitor = await createApprovedUser(harness, "Competitor");
    const privateLearner = await createApprovedUser(harness, "Private learner");
    await setVisibility(harness, learner.id, true);
    await setVisibility(harness, competitor.id, true);

    const sharedSubmittedAt = new Date("2026-03-20T01:00:00.000Z");
    const olderSubmittedAt = new Date("2026-03-20T00:30:00.000Z");
    const learnerExactLower = Fraction.of(333_333n, 10_000n);
    const learnerExactHigher = Fraction.of(333_334n, 10_000n);
    const competitorAccuracy = Fraction.of(333_333n, 10_000n);

    expect(learnerExactLower.displayDecimal()).toBe(learnerExactHigher.displayDecimal());
    expect(learnerExactLower.compare(learnerExactHigher)).toBe(-1);

    const learnerAtSameTime = await createAttempt(harness, {
      userId: learner.id,
      certification,
      accuracyRate: learnerExactLower,
      submittedAt: sharedSubmittedAt,
    });
    const learnerBest = await createAttempt(harness, {
      userId: learner.id,
      certification,
      accuracyRate: learnerExactHigher,
      submittedAt: olderSubmittedAt,
    });
    const learnerBestAtSameTime = await createAttempt(harness, {
      userId: learner.id,
      certification,
      accuracyRate: learnerExactHigher,
      submittedAt: olderSubmittedAt,
    });
    const competitorAttempt = await createAttempt(harness, {
      userId: competitor.id,
      certification,
      accuracyRate: competitorAccuracy,
      submittedAt: sharedSubmittedAt,
    });
    await createAttempt(harness, {
      userId: privateLearner.id,
      certification,
      accuracyRate: Fraction.of(100n),
      submittedAt: sharedSubmittedAt,
    });

    const expectedHistoryIds = [learnerAtSameTime, learnerBest, learnerBestAtSameTime]
      .sort(
        (left, right) =>
          right.submittedAt.getTime() - left.submittedAt.getTime() ||
          left.id.localeCompare(right.id),
      )
      .map((attempt) => attempt.id);
    const expectedRepresentativeId = [learnerBest, learnerBestAtSameTime]
      .sort((left, right) => left.id.localeCompare(right.id))[0]!.id;

    const lifecycle = lifecycleService(harness.unitOfWork);
    const history = await lifecycle.history(learner.id);
    expect(history.attempts.map((attempt) => attempt.attemptId)).toEqual(expectedHistoryIds);

    const firstPage = await historyPage(harness, learner.id, 2);
    const cursor = firstPage.at(-1);
    expect(cursor).toBeDefined();
    const secondPage = await historyPage(harness, learner.id, 2, cursor);
    expect(firstPage.map((row) => row.id)).toEqual(expectedHistoryIds.slice(0, 2));
    expect(secondPage.map((row) => row.id)).toEqual(expectedHistoryIds.slice(2));
    expect(new Set([...firstPage, ...secondPage].map((row) => row.id))).toHaveLength(3);

    const leaderboard = await lifecycle.leaderboard(certification.id, learner.id);
    expect(leaderboard.entries.map((entry) => entry.attemptId)).toEqual([
      expectedRepresentativeId,
      competitorAttempt.id,
    ]);
    expect(leaderboard.entries.map((entry) => entry.rank)).toEqual([1, 2]);
    expect(leaderboard.entries.map((entry) => entry.isCurrentUser)).toEqual([true, false]);
    expect(leaderboard.entries.some((entry) => entry.userId === privateLearner.id)).toBe(false);

    await setVisibility(harness, competitor.id, false);
    const afterVisibilityChange = await lifecycle.leaderboard(certification.id, learner.id);
    expect(afterVisibilityChange.entries.map((entry) => entry.attemptId)).toEqual([
      expectedRepresentativeId,
    ]);

    await createCompletedPracticeResult(harness, learner.id, certification.key);
    const historyAfterPractice = await lifecycle.history(learner.id);
    const leaderboardAfterPractice = await lifecycle.leaderboard(certification.id, learner.id);
    expect(historyAfterPractice.attempts.map((attempt) => attempt.attemptId)).toEqual(
      history.attempts.map((attempt) => attempt.attemptId),
    );
    expect(leaderboardAfterPractice.entries).toEqual(afterVisibilityChange.entries);

    await seedHistoryPlanWorkload(harness, competitor.id, certification);
    await assertIndexedP95(
      harness,
      "attempts_history_cursor",
      `
        SELECT id
        FROM attempts
        WHERE user_id = $1
        ORDER BY submitted_at DESC, id ASC
        LIMIT 50
      `,
      [learner.id],
    );
    await assertIndexedP95(
      harness,
      "attempts_leaderboard_candidates",
      `
        SELECT id
        FROM attempts
        WHERE certification_key = $1
        ORDER BY user_id ASC, submitted_at ASC, id ASC
        LIMIT 100
      `,
      [certification.key],
    );
  }, 60_000);
});

type CertificationFixture = { id: string; key: string };
type HistoryCursor = { id: string; submittedAt: Date };
type LiveHarness = {
  unitOfWork: DsqlUnitOfWork;
  database: SchemaScopedDatabase;
  cleanup(): Promise<void>;
};

function lifecycleService(unitOfWork: DsqlUnitOfWork): LifecycleServices {
  return new LifecycleServices({
    unitOfWork,
    now: () => now,
    createId: randomUUID,
    sessionFactory: new SessionFactory({
      now: () => now,
      ids: { next: randomUUID },
      random: { nextInt: () => 0 },
    }),
  });
}

async function createLiveHarness(): Promise<LiveHarness> {
  const endpoint = requiredEnvironment("DSQL_ENDPOINT");
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region)
    throw new Error(
      "RUN_DSQL_HISTORY_LEADERBOARD_SUITE=true requires AWS_REGION or AWS_DEFAULT_REGION.",
    );

  const schema = `history_leaderboard_${randomUUID().replaceAll("-", "")}`;
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
    const scopedPool = new SchemaScopedPool(pool, disposableSchema.name);
    const database = new SchemaScopedDatabase(scopedPool);
    await new DsqlMigrationRunner(database).migrate(await loadApplicationMigrations());
    return {
      unitOfWork: new DsqlUnitOfWork(scopedPool),
      database,
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

async function createApprovedUser(harness: LiveHarness, displayName: string) {
  const id = randomUUID();
  await harness.unitOfWork.transaction(async (repos) => {
    await repos.users.getOrCreatePendingByGoogleSub({
      id,
      googleSub: `dsql-history-${id}`,
      displayName,
      email: `${id}@example.test`,
      now,
    });
    await repos.users.approvePending(id, now);
  });
  return { id };
}

async function setVisibility(harness: LiveHarness, userId: string, scorePublic: boolean): Promise<void> {
  await harness.unitOfWork.transaction(async (repos) => {
    const profile = await repos.users.findById(userId);
    if (!profile) throw new Error("Expected approved profile.");
    const updated = await repos.users.updateScoreVisibility({
      userId,
      scorePublic,
      expectedVersion: profile.version,
    });
    if (!updated) throw new Error("Expected score visibility update.");
  });
}

async function seedActiveCertification(
  harness: LiveHarness,
  key: string,
): Promise<CertificationFixture> {
  const revisionId = randomUUID();
  const providerId = randomUUID();
  const certificationId = randomUUID();
  await harness.database.query(
    `INSERT INTO catalog_revisions
       (id, certification_key, content_hash, imported_by, imported_at, status)
     VALUES ($1, $2, $3, $4, $5, 'active')`,
    [revisionId, key, hash(revisionId), randomUUID(), now],
  );
  await harness.database.query(
    `INSERT INTO providers (id, revision_id, external_key, name, logo_url)
     VALUES ($1, $2, $3, 'DSQL Provider', NULL)`,
    [providerId, revisionId, providerId],
  );
  await harness.database.query(
    `INSERT INTO certifications
       (id, revision_id, provider_id, external_key, code, name, total_questions,
        time_limit_minutes, threshold_numerator, threshold_denominator, scoring_mode)
     VALUES ($1, $2, $3, $4, 'DSQL-HISTORY', 'DSQL History Certification', 1, 10,
             75, 1, 'all_or_nothing')`,
    [certificationId, revisionId, providerId, key],
  );
  await harness.database.query(
    `INSERT INTO catalog_heads (certification_key, active_revision_id, updated_at, version)
     VALUES ($1, $2, $3, 0)`,
    [key, revisionId, now],
  );
  return { id: certificationId, key };
}

async function createAttempt(
  harness: LiveHarness,
  input: {
    userId: string;
    certification: CertificationFixture;
    accuracyRate: Fraction;
    submittedAt: Date;
  },
) {
  const sessionId = randomUUID();
  const attemptId = randomUUID();
  const item = question(randomUUID(), input.certification.id);
  await harness.unitOfWork.transaction(async (repos) => {
    await repos.exams.createWithSnapshots({
      id: sessionId,
      userId: input.userId,
      certificationKey: input.certification.key,
      startRequestKey: randomUUID(),
      currentIndex: 0,
      startedAt: now,
      expiresAt: new Date(now.getTime() + 10 * 60_000),
      questions: [item],
    });
    await repos.exams.finalizeOnce({
      id: attemptId,
      userId: input.userId,
      sessionId,
      rawScore: input.accuracyRate.divide(Fraction.of(100n)),
      accuracyRate: input.accuracyRate,
      passThreshold: Fraction.of(75n),
      passed: input.accuracyRate.compare(Fraction.of(75n)) >= 0,
      reference1000Score: 333,
      submittedAt: input.submittedAt,
      submissionReason: "manual",
      items: [item],
    });
  });
  return { id: attemptId, sessionId, submittedAt: input.submittedAt };
}

function question(id: string, certificationId: string): PersistedQuestionSnapshot {
  return {
    id,
    displayIndex: 0,
    content: {
      certification: {
        id: certificationId,
        code: "DSQL-HISTORY",
        name: "DSQL History Certification",
        scoringMode: "all_or_nothing",
        passThreshold: "75",
      },
      domainName: "Domain",
      stem: { en: "Question", ko: null },
      explanation: { en: "Explanation", ko: null },
      choices: [{ id: "choice-a", text: { en: "A", ko: null } }],
      correctChoiceIds: ["choice-a"],
      requiredChoiceCount: 1,
      translationStatus: "en_only",
    },
    selectedChoiceIds: ["choice-a"],
    finalChoiceIds: null,
    earnedScore: Fraction.of(1n),
    flagged: false,
    version: 0n,
  };
}

async function createCompletedPracticeResult(
  harness: LiveHarness,
  userId: string,
  certificationKey: string,
): Promise<void> {
  const sessionId = randomUUID();
  const questionId = randomUUID();
  await harness.unitOfWork.transaction(async (repos) => {
    await repos.practice.replaceAtomically({
      id: sessionId,
      userId,
      certificationKey,
      currentIndex: 0,
      createdAt: now,
      questions: [question(questionId, "practice-only-certification")],
    });
    await repos.practice.submitFirstAnswer({
      userId,
      sessionId,
      expectedVersion: 0n,
      questionId,
      selectedChoiceIds: ["choice-a"],
      earnedScore: Fraction.of(1n),
      completedResult: {
        id: randomUUID(),
        rawScore: Fraction.of(1n),
        accuracyRate: Fraction.of(100n),
        completedAt: now,
        expiresAt: new Date(now.getTime() + 168 * 60 * 60 * 1000),
        payload: { practiceOnly: true },
      },
    });
  });
}

async function historyPage(
  harness: LiveHarness,
  userId: string,
  limit: number,
  cursor?: HistoryCursor,
): Promise<HistoryCursor[]> {
  const result = await harness.database.query<{ id: string; submitted_at: Date | string }>(
    `SELECT id, submitted_at
     FROM attempts
     WHERE user_id = $1
       AND ($2::timestamptz IS NULL OR submitted_at < $2
            OR (submitted_at = $2 AND id > $3::uuid))
     ORDER BY submitted_at DESC, id ASC
     LIMIT $4`,
    [userId, cursor?.submittedAt ?? null, cursor?.id ?? null, limit],
  );
  return result.rows.map((row) => ({ id: row.id, submittedAt: new Date(row.submitted_at) }));
}

async function seedHistoryPlanWorkload(
  harness: LiveHarness,
  userId: string,
  certification: CertificationFixture,
): Promise<void> {
  const count = 300;
  const sessionIds = Array.from({ length: count }, randomUUID);
  const attemptIds = Array.from({ length: count }, randomUUID);
  const timestamps = sessionIds.map((_, index) => new Date(now.getTime() - index * 1_000));
  await harness.database.query(
    `INSERT INTO exam_sessions
       (id, user_id, certification_id_at_start, certification_key, certification_snapshot,
        start_request_key, status, current_index, started_at, expires_at, submitted_at, version)
     SELECT id, $1, $2, $3, '{}'::jsonb, id::text, 'submitted', 0, $4, $5, $4, 0
     FROM unnest($6::uuid[]) AS ids(id)`,
    [
      userId,
      certification.id,
      certification.key,
      now,
      new Date(now.getTime() + 10 * 60_000),
      sessionIds,
    ],
  );
  await harness.database.query(
    `INSERT INTO attempts
       (id, exam_session_id, user_id, certification_key, certification_snapshot,
        raw_numerator, raw_denominator, accuracy_numerator, accuracy_denominator,
        reference_1000, threshold_numerator, threshold_denominator, passed,
        domain_performance, started_at, expires_at, submitted_at, submission_reason)
     SELECT attempt_id, session_id, $1, $2, '{}'::jsonb, 1, 1, 100, 1, 1000, 75, 1,
            true, '[]'::jsonb, $3, $4, submitted_at, 'manual'
     FROM unnest($5::uuid[], $6::uuid[], $7::timestamptz[])
       AS values(attempt_id, session_id, submitted_at)`,
    [
      userId,
      certification.key,
      now,
      new Date(now.getTime() + 10 * 60_000),
      attemptIds,
      sessionIds,
      timestamps,
    ],
  );
}

class SchemaScopedPool implements SqlPool {
  constructor(
    private readonly pool: DsqlPool,
    private readonly schema: string,
  ) {}

  async connect(): Promise<SqlClient> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET search_path TO ${quoteIdentifier(this.schema)}`);
      return client;
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
      `RUN_DSQL_HISTORY_LEADERBOARD_SUITE=true requires ${key}; provide a reachable Aurora DSQL endpoint.`,
    );
  return value;
}

async function assertIndexedP95(
  harness: LiveHarness,
  expectedIndex: string,
  query: string,
  values: readonly unknown[],
): Promise<void> {
  const explain = await harness.database.query<QueryResultRow>(
    `EXPLAIN (ANALYZE, FORMAT JSON) ${query}`,
    values,
  );
  expect(JSON.stringify(explain.rows)).toContain(expectedIndex);

  const samples = await Promise.all(
    Array.from({ length: 30 }, async () => {
      const startedAt = performance.now();
      await harness.database.query(query, values);
      return performance.now() - startedAt;
    }),
  );
  samples.sort((left, right) => left - right);
  const p95Ms = samples[Math.ceil(samples.length * 0.95) - 1]!;
  expect(p95Ms).toBeLessThanOrEqual(p95MsMax);
}
