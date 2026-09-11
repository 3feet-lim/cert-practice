import { randomUUID } from "node:crypto";

import { isOCCError } from "@aws/aurora-dsql-node-postgres-connector";
import type { QueryResultRow } from "pg";

import {
  loadApplicationMigrations,
  type ApplicationMigration,
  type AppliedMigration,
  type MigrationStateReader,
} from "./migrations.js";

type MigrationQueryable = {
  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }>;
};

export type MigrationRunnerOptions = {
  now?: () => Date;
};

export type DsqlOccRetryOptions = Readonly<{
  maxAttempts?: number;
  retryDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

const DSQL_OCC_RETRY_ATTEMPTS = 8;
const DSQL_OCC_RETRY_DELAY_MS = 25;

/** Recognizes both connector-wrapped conflicts and raw PostgreSQL OC000 errors. */
export function isDsqlOccAbort(error: unknown): boolean {
  if (isOCCError(error)) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "OC000"
  );
}

/** Retries Aurora DSQL optimistic-concurrency aborts with bounded backoff. */
export async function retryDsqlOcc<T>(
  operation: () => Promise<T>,
  options: DsqlOccRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? DSQL_OCC_RETRY_ATTEMPTS;
  const retryDelayMs = options.retryDelayMs ?? DSQL_OCC_RETRY_DELAY_MS;
  const sleep = options.sleep ?? delay;
  if (!Number.isSafeInteger(maxAttempts) || maxAttempts < 1)
    throw new RangeError("DSQL OCC retry attempts must be a positive safe integer.");
  if (!Number.isSafeInteger(retryDelayMs) || retryDelayMs < 0)
    throw new RangeError("DSQL OCC retry delay must be a non-negative safe integer.");

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isDsqlOccAbort(error) || attempt === maxAttempts - 1) throw error;
      await sleep(retryDelayMs * 2 ** attempt);
    }
  }
  throw lastError;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

/** Converts source-controlled PostgreSQL index DDL to Aurora DSQL syntax. */
export function normalizeDsqlMigrationStatement(statement: string): string {
  const asynchronous = statement.replace(
    /^CREATE\s+(UNIQUE\s+)?INDEX\s+(?!ASYNC\b)/iu,
    (_match, unique: string | undefined) => `CREATE ${unique ?? ""}INDEX ASYNC `,
  );
  if (!/^CREATE\s+(UNIQUE\s+)?INDEX\s+ASYNC\b/iu.test(asynchronous)) return asynchronous;

  // Aurora DSQL rejects ASC/DESC index-key modifiers. The source migrations retain
  // their PostgreSQL form; DSQL scans the compatible default-order index as needed.
  return asynchronous.replace(/\s+(?:ASC|DESC)(?=\s*(?:,|\)))/giu, "");
}

/**
 * Applies source-controlled migrations with durable statement checkpoints.
 * DSQL DDL can complete outside a multi-statement transaction, so a restart
 * continues only the missing statements and never accepts checksum drift.
 */
export class DsqlMigrationRunner implements MigrationStateReader {
  private readonly database: MigrationQueryable;
  private readonly options: MigrationRunnerOptions;

  constructor(database: MigrationQueryable, options: MigrationRunnerOptions = {}) {
    const query = database.query.bind(database);
    this.database = {
      query: <Row extends QueryResultRow = QueryResultRow>(
        text: string,
        values?: readonly unknown[],
      ) => retryDsqlOcc(() => query<Row>(normalizeDsqlMigrationStatement(text), values)),
    };
    this.options = options;
  }

  async migrate(migrations?: readonly ApplicationMigration[]): Promise<void> {
    await this.ensureLedger();
    const owner = randomUUID();
    if (!(await this.acquireLease(owner)))
      throw new Error("Another application migration runner is active.");
    try {
      for (const migration of migrations ?? (await loadApplicationMigrations()))
        await this.apply(migration);
    } finally {
      await this.database.query(
        "DELETE FROM application_schema_migration_lease WHERE lease_key = 'application' AND owner_id = $1",
        [owner],
      );
    }
  }

  async listAppliedMigrations(): Promise<readonly AppliedMigration[]> {
    await this.ensureLedger();
    const result = await this.database.query<{ version: number; sha256: string }>(
      "SELECT version, sha256 FROM application_schema_migrations ORDER BY version ASC",
    );
    return result.rows.map((row) => ({ version: Number(row.version), sha256: row.sha256 }));
  }

  private async ensureLedger(): Promise<void> {
    await this.database.query(`CREATE TABLE IF NOT EXISTS application_schema_migrations (
      version integer PRIMARY KEY,
      sha256 char(64) NOT NULL,
      applied_at timestamptz NOT NULL
    )`);
    await this.database.query(`CREATE TABLE IF NOT EXISTS application_schema_migration_lease (
      lease_key text PRIMARY KEY,
      owner_id uuid NOT NULL,
      expires_at timestamptz NOT NULL
    )`);
    await this.database.query(`CREATE TABLE IF NOT EXISTS application_schema_migration_steps (
      version integer NOT NULL,
      sha256 char(64) NOT NULL,
      statement_index integer NOT NULL,
      applied_at timestamptz NOT NULL,
      PRIMARY KEY (version, statement_index)
    )`);
  }

  private async acquireLease(owner: string): Promise<boolean> {
    const now = this.now();
    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    const lease = await this.database.query<{ owner_id: string }>(
      `INSERT INTO application_schema_migration_lease (lease_key, owner_id, expires_at)
       VALUES ('application', $1, $2)
       ON CONFLICT (lease_key) DO UPDATE
         SET owner_id = EXCLUDED.owner_id, expires_at = EXCLUDED.expires_at
         WHERE application_schema_migration_lease.expires_at <= $3
       RETURNING owner_id`,
      [owner, expiresAt, now],
    );
    return lease.rows[0]?.owner_id === owner;
  }

  private async apply(migration: ApplicationMigration): Promise<void> {
    const applied = await this.database.query<{ sha256: string }>(
      "SELECT sha256 FROM application_schema_migrations WHERE version = $1",
      [migration.version],
    );
    if (applied.rows[0]) {
      if (applied.rows[0].sha256 !== migration.sha256)
        throw new Error(`Migration ${migration.filename} checksum mismatch.`);
      return;
    }

    const completed = await this.database.query<{
      statement_index: number;
      sha256: string;
    }>(
      `SELECT statement_index, sha256 FROM application_schema_migration_steps
       WHERE version = $1 ORDER BY statement_index ASC`,
      [migration.version],
    );
    if (completed.rows.some((row) => row.sha256 !== migration.sha256))
      throw new Error(`Migration ${migration.filename} checksum mismatch.`);
    const finished = new Set(completed.rows.map((row) => Number(row.statement_index)));
    const source = await readMigration(migration.path);
    const statements = splitSqlStatements(source);
    for (const [index, statement] of statements.entries()) {
      if (finished.has(index)) continue;
      await this.database.query(statement);
      await this.database.query(
        `INSERT INTO application_schema_migration_steps
           (version, sha256, statement_index, applied_at)
         VALUES ($1, $2, $3, $4)`,
        [migration.version, migration.sha256, index, this.now()],
      );
    }
    await this.database.query(
      `INSERT INTO application_schema_migrations (version, sha256, applied_at)
       VALUES ($1, $2, $3)`,
      [migration.version, migration.sha256, this.now()],
    );
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

async function readMigration(path: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  return readFile(path, "utf8");
}

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(/;\s*(?:\n|$)/u)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}
