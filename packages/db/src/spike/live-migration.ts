import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import type { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";

import { errorMessage, roundMs } from "./live-connection.js";
import type { LiveProbeObservation } from "./live-types.js";
import { loadMigrationManifest } from "./migrations.js";

const migrationSourcePath = resolve(
  process.cwd(),
  "src/spike/sql/0001-compatibility-schema.sql",
);

const spikeTablesInDropOrder = [
  "spike_practice_snapshot",
  "spike_active_practice_slot",
  "spike_attempt",
  "spike_exam_session",
  "spike_practice_session",
  "spike_completed_practice_result",
  "spike_catalog_item",
  "spike_catalog_head",
  "spike_catalog_revision",
  "spike_user_profile",
  "spike_schema_migration_step",
  "spike_schema_migration",
] as const;

export async function cleanSpikeDatabase(pool: AuroraDSQLPool): Promise<void> {
  for (const table of spikeTablesInDropOrder) {
    await pool.query(`DROP TABLE IF EXISTS ${table}`);
  }
}

export async function runMigrationProbe(
  pool: AuroraDSQLPool,
): Promise<LiveProbeObservation> {
  const startedAt = performance.now();
  try {
    await cleanSpikeDatabase(pool);
    await pool.query(`
      CREATE TABLE spike_schema_migration (
        version text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL
      )
    `);
    await pool.query(`
      CREATE TABLE spike_schema_migration_step (
        version text NOT NULL,
        checksum text NOT NULL,
        statement_index integer NOT NULL,
        applied_at timestamptz NOT NULL,
        PRIMARY KEY (version, statement_index)
      )
    `);

    const [manifest] = await loadMigrationManifest();
    if (!manifest) throw new Error("Candidate migration manifest is empty.");
    const sql = await readFile(migrationSourcePath, "utf8");
    const statements = splitSqlStatements(sql);
    const faultAfterStatement = statements.findIndex((statement) =>
      /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+ASYNC\b/iu.test(statement),
    );
    if (faultAfterStatement < 0) throw new Error("No async index fault point found.");

    let injectedCheckpointGapObserved = false;
    try {
      await applyMigration(pool, manifest.version, manifest.sha256, sql, {
        faultAfterStatement,
      });
    } catch (error) {
      injectedCheckpointGapObserved = errorMessage(error).includes(
        "injected failure after statement before checkpoint",
      );
    }
    const checkpointMissing = await pool.query<{ count: string }>(
      `SELECT count(*)::text AS count
       FROM spike_schema_migration_step
       WHERE version = $1 AND statement_index = $2`,
      [manifest.version, faultAfterStatement],
    );
    const gapWasReal = checkpointMissing.rows[0]?.count === "0";

    const firstApply = await applyMigration(
      pool,
      manifest.version,
      manifest.sha256,
      sql,
    );
    const replay = await applyMigration(pool, manifest.version, manifest.sha256, sql);

    let checksumMismatchBlocked = false;
    try {
      await applyMigration(pool, manifest.version, "0".repeat(64), sql);
    } catch (error) {
      checksumMismatchBlocked = errorMessage(error).includes("checksum mismatch");
    }

    const checkpointedFailureRecovered =
      injectedCheckpointGapObserved && gapWasReal && firstApply === "applied";
    const passed =
      firstApply === "applied" &&
      replay === "replayed" &&
      checksumMismatchBlocked &&
      checkpointedFailureRecovered;

    return {
      id: "migration-replay",
      status: passed ? "pass" : "fail",
      durationMs: roundMs(performance.now() - startedAt),
      detail: passed
        ? "Versioned single-DDL steps recovered an actual post-DDL/pre-checkpoint failure, replayed deterministically, and rejected checksum drift."
        : "One or more migration checkpoint recovery checks failed.",
      evidence: {
        firstApply,
        replay,
        checksumMismatchBlocked,
        injectedCheckpointGapObserved,
        gapWasReal,
        checkpointedFailureRecovered,
        faultAfterStatement,
        multipleDdlPerTransactionSupported: false,
        recoveryStrategy: "catalog-aware-idempotent-ddl-with-statement-checkpoints",
      },
    };
  } catch (error) {
    return {
      id: "migration-replay",
      status: "fail",
      durationMs: roundMs(performance.now() - startedAt),
      detail: errorMessage(error),
      evidence: { multipleDdlPerTransactionSupported: false },
    };
  }
}

async function applyMigration(
  pool: AuroraDSQLPool,
  version: string,
  checksum: string,
  sql: string,
  options?: { faultAfterStatement?: number },
): Promise<"applied" | "replayed"> {
  const existing = await pool.query<{ checksum: string }>(
    "SELECT checksum FROM spike_schema_migration WHERE version = $1",
    [version],
  );
  const existingChecksum = existing.rows[0]?.checksum;
  if (existingChecksum !== undefined) {
    if (existingChecksum !== checksum) {
      throw new Error(`Migration ${version} checksum mismatch.`);
    }
    return "replayed";
  }

  const steps = await pool.query<{ statement_index: number; checksum: string }>(
    `SELECT statement_index, checksum
     FROM spike_schema_migration_step
     WHERE version = $1
     ORDER BY statement_index`,
    [version],
  );
  if (steps.rows.some((step) => step.checksum !== checksum)) {
    throw new Error(`Migration ${version} checksum mismatch in an incomplete run.`);
  }
  const completedSteps = new Set(steps.rows.map((step) => step.statement_index));
  const statements = splitSqlStatements(sql);
  for (let index = 0; index < statements.length; index += 1) {
    if (completedSteps.has(index)) continue;
    const statement = statements[index];
    if (!statement) continue;
    await executeDdlStep(pool, statement, index);
    if (options?.faultAfterStatement === index) {
      throw new Error(`injected failure after statement before checkpoint: ${index}`);
    }
    await pool.query(
      `INSERT INTO spike_schema_migration_step
         (version, checksum, statement_index, applied_at)
       VALUES ($1, $2, $3, $4)`,
      [version, checksum, index, new Date().toISOString()],
    );
  }
  await pool.query(
    `INSERT INTO spike_schema_migration (version, checksum, applied_at)
     VALUES ($1, $2, $3)`,
    [version, checksum, new Date().toISOString()],
  );
  return "applied";
}

async function executeDdlStep(
  pool: AuroraDSQLPool,
  statement: string,
  statementIndex: number,
): Promise<void> {
  const indexName = statement.match(
    /^CREATE\s+(?:UNIQUE\s+)?INDEX\s+ASYNC\s+([a-z][a-z0-9_]*)\b/iu,
  )?.[1];
  if (indexName) {
    const existing = await pool.query<{ indisvalid: boolean }>(
      `SELECT pg_index.indisvalid
       FROM pg_class
       JOIN pg_index ON pg_index.indexrelid = pg_class.oid
       WHERE pg_class.relname = $1`,
      [indexName],
    );
    if (existing.rows[0]?.indisvalid === true) return;
    if (existing.rows.length > 0) await pool.query(`DROP INDEX ${indexName}`);
  }

  const result = await pool.query<{ job_id?: string }>(statement);
  if (indexName) {
    const jobId = result.rows[0]?.job_id;
    if (!jobId) {
      throw new Error(`Async index statement ${statementIndex} returned no job_id.`);
    }
    await pool.query("CALL sys.wait_for_job($1)", [jobId]);
  }
}

export function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
