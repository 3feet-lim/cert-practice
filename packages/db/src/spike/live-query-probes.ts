import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

import type { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import type { QueryResultRow } from "pg";

import { errorMessage, roundMs } from "./live-connection.js";
import type { LiveQueryObservation } from "./live-types.js";

const sampleCount = 30;
const p95MsMax = 500;
const userCount = 200;
const attemptsPerUser = 60;
const retentionRowCount = 1_200;
const expiredRetentionRowCount = 1_100;

type AttemptFixture = {
  id: string;
  userId: string;
  numerator: number;
  denominator: number;
  submittedAt: string;
};

type RetentionFixture = {
  id: string;
  expiresAt: string;
};

type QueryFixture = {
  historyUserId: string;
  certificationId: string;
  retentionCutoff: string;
  attempts: AttemptFixture[];
  retentionRows: RetentionFixture[];
};

export async function runQueryProbes(
  pool: AuroraDSQLPool,
): Promise<LiveQueryObservation[]> {
  const fixture = await seedRepresentativeData(pool);
  const commonWorkload = {
    users: userCount,
    attempts: userCount * attemptsPerUser,
    attemptsPerUser,
    retentionRows: retentionRowCount,
    expiredRetentionRows: expiredRetentionRowCount,
    samples: sampleCount,
  };

  return Promise.all([
    measureQuery(pool, {
      id: "history-query",
      expectedIndex: "spike_attempt_history_cursor",
      text: `
        SELECT id, accuracy_numerator, accuracy_denominator, submitted_at
        FROM spike_attempt
        WHERE user_id = $1
        ORDER BY submitted_at DESC, id ASC
        LIMIT 50
      `,
      values: [fixture.historyUserId],
      verify: () => verifyHistoryContract(pool, fixture),
      workload: commonWorkload,
    }),
    measureQuery(pool, {
      id: "leaderboard-query",
      expectedIndex: "spike_attempt_leaderboard_candidates",
      text: leaderboardSql,
      values: [fixture.certificationId],
      verify: () => verifyLeaderboardContract(pool, fixture),
      workload: commonWorkload,
    }),
    measureQuery(pool, {
      id: "retention-cleanup-query",
      expectedIndex: "spike_practice_result_expiry",
      text: `
        SELECT id, expires_at
        FROM spike_completed_practice_result
        WHERE expires_at <= $1
        ORDER BY expires_at ASC, id ASC
        LIMIT 100
      `,
      values: [fixture.retentionCutoff],
      verify: () => verifyRetentionContract(pool, fixture),
      workload: commonWorkload,
    }),
  ]);
}

const leaderboardSql = `
  WITH candidates AS (
    SELECT id, user_id, accuracy_numerator, accuracy_denominator, submitted_at,
           row_number() OVER (
             PARTITION BY user_id
             ORDER BY
               (accuracy_numerator::numeric / accuracy_denominator) DESC,
               submitted_at ASC,
               id ASC
           ) AS representative_order
    FROM spike_attempt
    WHERE certification_id = $1
  ), representatives AS (
    SELECT * FROM candidates WHERE representative_order = 1
  )
  SELECT id, user_id, accuracy_numerator, accuracy_denominator, submitted_at,
         rank() OVER (
           ORDER BY (accuracy_numerator::numeric / accuracy_denominator) DESC
         ) AS competition_rank
  FROM representatives
  ORDER BY
    (accuracy_numerator::numeric / accuracy_denominator) DESC,
    submitted_at ASC,
    user_id ASC
  LIMIT 100
`;

type QueryDefinition = {
  id: LiveQueryObservation["id"];
  expectedIndex: string;
  text: string;
  values: readonly unknown[];
  verify: () => Promise<void>;
  workload: LiveQueryObservation["workload"];
};

async function measureQuery(
  pool: AuroraDSQLPool,
  definition: QueryDefinition,
): Promise<LiveQueryObservation> {
  try {
    await definition.verify();
    const explain = await pool.query<QueryResultRow>(
      `EXPLAIN (ANALYZE, FORMAT JSON) ${definition.text}`,
      [...definition.values],
    );
    const plan = JSON.stringify(explain.rows);
    const indexUsed = plan.includes(definition.expectedIndex);

    const samples: number[] = [];
    for (let index = 0; index < sampleCount; index += 1) {
      const startedAt = performance.now();
      await pool.query(definition.text, [...definition.values]);
      samples.push(performance.now() - startedAt);
    }
    samples.sort((left, right) => left - right);
    const p95Ms = roundMs(
      samples[Math.ceil(samples.length * 0.95) - 1] ?? p95MsMax + 1,
    );
    const passed = indexUsed && p95Ms <= p95MsMax;

    return {
      id: definition.id,
      status: passed ? "pass" : "fail",
      expectedIndex: definition.expectedIndex,
      indexUsed,
      contractVerified: true,
      p95Ms,
      p95MsMax,
      samples: sampleCount,
      workload: definition.workload,
      plan,
    };
  } catch (error) {
    return {
      id: definition.id,
      status: "fail",
      expectedIndex: definition.expectedIndex,
      indexUsed: false,
      contractVerified: false,
      p95Ms: p95MsMax + 1,
      p95MsMax,
      samples: 0,
      workload: definition.workload,
      plan: errorMessage(error),
    };
  }
}

async function verifyHistoryContract(
  pool: AuroraDSQLPool,
  fixture: QueryFixture,
): Promise<void> {
  type HistoryRow = {
    id: string;
    accuracy_numerator: string;
    accuracy_denominator: string;
    submitted_at: Date | string;
  };
  const firstPage = await pool.query<HistoryRow>(
    `SELECT id, accuracy_numerator, accuracy_denominator, submitted_at
     FROM spike_attempt
     WHERE user_id = $1
     ORDER BY submitted_at DESC, id ASC
     LIMIT 50`,
    [fixture.historyUserId],
  );
  ensure(firstPage.rows.length === 50, "History first page must contain 50 rows.");
  const cursor = firstPage.rows.at(-1);
  ensure(cursor !== undefined, "History cursor row is missing.");
  const secondPage = await pool.query<HistoryRow>(
    `SELECT id, accuracy_numerator, accuracy_denominator, submitted_at
     FROM spike_attempt
     WHERE user_id = $1
       AND (submitted_at < $2 OR (submitted_at = $2 AND id > $3))
     ORDER BY submitted_at DESC, id ASC
     LIMIT 50`,
    [fixture.historyUserId, toIso(cursor.submitted_at), cursor.id],
  );

  const expected = fixture.attempts
    .filter((attempt) => attempt.userId === fixture.historyUserId)
    .sort(compareHistoryAttempts);
  ensure(expected.length === attemptsPerUser, "History workload is incomplete.");
  ensure(
    firstPage.rows.map((row) => row.id).join(",") ===
      expected
        .slice(0, 50)
        .map((row) => row.id)
        .join(","),
    "History first page ordering differs from the independent oracle.",
  );
  ensure(
    secondPage.rows.map((row) => row.id).join(",") ===
      expected
        .slice(50)
        .map((row) => row.id)
        .join(","),
    "History cursor page ordering differs from the independent oracle.",
  );
  const firstIds = new Set(firstPage.rows.map((row) => row.id));
  ensure(
    secondPage.rows.every((row) => !firstIds.has(row.id)),
    "History cursor pages overlap.",
  );
}

async function verifyLeaderboardContract(
  pool: AuroraDSQLPool,
  fixture: QueryFixture,
): Promise<void> {
  type LeaderboardRow = {
    id: string;
    user_id: string;
    accuracy_numerator: string;
    accuracy_denominator: string;
    submitted_at: Date | string;
    competition_rank: string;
  };
  const actual = await pool.query<LeaderboardRow>(leaderboardSql, [
    fixture.certificationId,
  ]);
  const representatives = new Map<string, AttemptFixture>();
  for (const attempt of fixture.attempts) {
    const current = representatives.get(attempt.userId);
    if (!current || compareRepresentativeAttempts(attempt, current) < 0) {
      representatives.set(attempt.userId, attempt);
    }
  }
  const ordered = [...representatives.values()].sort(compareLeaderboardAttempts);
  const expected = ordered.slice(0, 100).map((attempt, index) => ({
    ...attempt,
    rank:
      ordered.findIndex((candidate) => compareFractions(candidate, attempt) === 0) + 1,
    index,
  }));

  ensure(actual.rows.length === expected.length, "Leaderboard row count differs.");
  for (let index = 0; index < expected.length; index += 1) {
    const wanted = expected[index];
    const observed = actual.rows[index];
    ensure(wanted !== undefined && observed !== undefined, "Leaderboard row missing.");
    ensure(
      observed.id === wanted.id,
      `Leaderboard representative differs at ${index}.`,
    );
    ensure(observed.user_id === wanted.userId, `Leaderboard user differs at ${index}.`);
    ensure(
      Number(observed.accuracy_numerator) === wanted.numerator,
      "Leaderboard numerator differs.",
    );
    ensure(
      Number(observed.accuracy_denominator) === wanted.denominator,
      "Leaderboard denominator differs.",
    );
    ensure(
      Number(observed.competition_rank) === wanted.rank,
      "Competition rank differs.",
    );
  }
  ensure(
    expected.some(
      (entry, index) => index > 0 && entry.rank === expected[index - 1]?.rank,
    ),
    "Leaderboard workload did not exercise a tied exact score.",
  );
}

async function verifyRetentionContract(
  pool: AuroraDSQLPool,
  fixture: QueryFixture,
): Promise<void> {
  const actual = await pool.query<{ id: string; expires_at: Date | string }>(
    `SELECT id, expires_at
     FROM spike_completed_practice_result
     WHERE expires_at <= $1
     ORDER BY expires_at ASC, id ASC
     LIMIT 100`,
    [fixture.retentionCutoff],
  );
  const expected = fixture.retentionRows
    .filter((row) => row.expiresAt <= fixture.retentionCutoff)
    .sort(
      (left, right) =>
        left.expiresAt.localeCompare(right.expiresAt) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, 100);
  ensure(actual.rows.length === 100, "Retention batch must contain 100 rows.");
  ensure(
    actual.rows.map((row) => row.id).join(",") ===
      expected.map((row) => row.id).join(","),
    "Retention cutoff or ordering differs from the independent oracle.",
  );
  ensure(
    actual.rows.every((row) => toIso(row.expires_at) <= fixture.retentionCutoff),
    "Retention query returned a row beyond the cutoff.",
  );
}

async function seedRepresentativeData(pool: AuroraDSQLPool): Promise<QueryFixture> {
  const certificationId = randomUUID();
  const users = Array.from({ length: userCount }, (_, index) => ({
    id: randomUUID(),
    googleSub: `spike-query-${index}-${randomUUID()}`,
  }));

  await insertBatches(
    pool,
    "spike_user_profile",
    ["id", "google_sub", "created_at"],
    users.map((user) => [user.id, user.googleSub, new Date().toISOString()]),
  );

  const now = Date.now();
  const examSessions: unknown[][] = [];
  const attemptRows: unknown[][] = [];
  const attempts: AttemptFixture[] = [];
  for (let userIndex = 0; userIndex < users.length; userIndex += 1) {
    const user = users[userIndex];
    if (!user) continue;
    for (let attemptIndex = 0; attemptIndex < attemptsPerUser; attemptIndex += 1) {
      const denominator = [3, 7, 75][attemptIndex % 3] ?? 75;
      const numerator = (userIndex * 17 + attemptIndex * 11) % (denominator + 1);
      const examSessionId = randomUUID();
      const attemptId = randomUUID();
      const submittedAt = new Date(
        userIndex === 0
          ? now - 10_000
          : now - (userIndex * attemptsPerUser + attemptIndex) * 1_000,
      ).toISOString();
      examSessions.push([
        examSessionId,
        user.id,
        certificationId,
        "submitted",
        new Date(Date.parse(submittedAt) - 180 * 60_000).toISOString(),
        submittedAt,
      ]);
      attemptRows.push([
        attemptId,
        examSessionId,
        user.id,
        certificationId,
        numerator,
        denominator,
        numerator,
        denominator,
        submittedAt,
      ]);
      attempts.push({
        id: attemptId,
        userId: user.id,
        numerator,
        denominator,
        submittedAt,
      });
    }
  }
  await insertBatches(
    pool,
    "spike_exam_session",
    ["id", "user_id", "certification_id", "status", "started_at", "expires_at"],
    examSessions,
  );
  await insertBatches(
    pool,
    "spike_attempt",
    [
      "id",
      "exam_session_id",
      "user_id",
      "certification_id",
      "raw_numerator",
      "raw_denominator",
      "accuracy_numerator",
      "accuracy_denominator",
      "submitted_at",
    ],
    attemptRows,
  );

  const retentionCutoff = new Date(now).toISOString();
  const retentionRows = Array.from({ length: retentionRowCount }, (_, index) => {
    const expired = index < expiredRetentionRowCount;
    return {
      id: randomUUID(),
      expiresAt: new Date(
        expired
          ? now - (index + 1) * 60_000
          : now + (index - expiredRetentionRowCount + 1) * 60_000,
      ).toISOString(),
    };
  });
  await insertBatches(
    pool,
    "spike_completed_practice_result",
    ["id", "expires_at", "result_document"],
    retentionRows.map((row, index) => [
      row.id,
      row.expiresAt,
      JSON.stringify({ index, source: "dsql-spike" }),
    ]),
  );

  return {
    historyUserId: users[0]?.id ?? "",
    certificationId,
    retentionCutoff,
    attempts,
    retentionRows,
  };
}

function compareHistoryAttempts(left: AttemptFixture, right: AttemptFixture): number {
  return (
    right.submittedAt.localeCompare(left.submittedAt) || left.id.localeCompare(right.id)
  );
}

function compareRepresentativeAttempts(
  left: AttemptFixture,
  right: AttemptFixture,
): number {
  return (
    -compareFractions(left, right) ||
    left.submittedAt.localeCompare(right.submittedAt) ||
    left.id.localeCompare(right.id)
  );
}

function compareLeaderboardAttempts(
  left: AttemptFixture,
  right: AttemptFixture,
): number {
  return (
    -compareFractions(left, right) ||
    left.submittedAt.localeCompare(right.submittedAt) ||
    left.userId.localeCompare(right.userId)
  );
}

function compareFractions(left: AttemptFixture, right: AttemptFixture): number {
  const leftValue = BigInt(left.numerator) * BigInt(right.denominator);
  const rightValue = BigInt(right.numerator) * BigInt(left.denominator);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function ensure(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function insertBatches(
  pool: AuroraDSQLPool,
  table: string,
  columns: readonly string[],
  rows: readonly (readonly unknown[])[],
): Promise<void> {
  const batchSize = 100;
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values: unknown[] = [];
    const placeholders = batch.map((row, rowIndex) => {
      values.push(...row);
      return `(${row.map((_, columnIndex) => `$${rowIndex * columns.length + columnIndex + 1}`).join(", ")})`;
    });
    await pool.query(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`,
      values,
    );
  }
}
