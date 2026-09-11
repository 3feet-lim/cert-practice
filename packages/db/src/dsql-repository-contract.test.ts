import { randomUUID } from "node:crypto";

import type { QueryResultRow } from "pg";
import { describe } from "vitest";

import { createDisposableDsqlSchema } from "./dsql-disposable-schema.js";
import { DsqlPoolLifecycle, type DsqlPool } from "./dsql-pool.js";
import { DsqlUnitOfWork, type SqlClient, type SqlPool } from "./dsql-unit-of-work.js";
import { DsqlMigrationRunner } from "./migrate.js";
import { loadApplicationMigrations } from "./migrations.js";
import {
  describeRepositoryContractSuite,
  type RepositoryContractHarness,
} from "./repository-contract-suite.js";

const enabled = process.env.RUN_DSQL_REPOSITORY_CONTRACTS === "true";
const describeLive = enabled ? describe : describe.skip;

/**
 * Live DSQL is intentionally opt-in. It requires a reachable DSQL endpoint,
 * region, and IAM credentials permitted to connect to that cluster; normal
 * repository/unit runs never make a network call.
 */
const DSQL_CONTRACT_TIMEOUT_MS = 120_000;

describeLive("production DSQL repository contracts", { timeout: DSQL_CONTRACT_TIMEOUT_MS }, () => {
  describeRepositoryContractSuite("production DSQL", createDsqlHarness, {
    timeout: DSQL_CONTRACT_TIMEOUT_MS,
  });
});

async function createDsqlHarness(): Promise<RepositoryContractHarness> {
  const endpoint = required("DSQL_ENDPOINT");
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region)
    throw new Error(
      "RUN_DSQL_REPOSITORY_CONTRACTS=true requires AWS_REGION or AWS_DEFAULT_REGION.",
    );

  const schema = `contract_${randomUUID().replaceAll("-", "")}`;
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
    const migrations = await loadApplicationMigrations();
    const runner = new DsqlMigrationRunner(new SchemaScopedDatabase(scopedPool));
    await runner.migrate(migrations);

    return {
      unitOfWork: new DsqlUnitOfWork(scopedPool),
      prepareActiveCertification: (userId) =>
        seedActiveCertification(new SchemaScopedDatabase(scopedPool), userId),
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

async function seedActiveCertification(
  database: SchemaScopedDatabase,
  userId: string,
): Promise<void> {
  const revisionId = "00000000-0000-4000-8000-000000009001";
  const providerId = "00000000-0000-4000-8000-000000009002";
  const certificationId = "00000000-0000-4000-8000-000000009003";
  const now = new Date("2026-01-01T00:00:00.000Z");

  await database.query(
    `INSERT INTO catalog_revisions
       (id, certification_key, content_hash, imported_by, imported_at, status)
     VALUES ($1, 'cert-a', $2, $3, $4, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [revisionId, "a".repeat(64), userId, now],
  );
  await database.query(
    `INSERT INTO providers (id, revision_id, external_key, name, logo_url)
     VALUES ($1, $2, 'provider-a', 'Provider A', NULL)
     ON CONFLICT (id) DO NOTHING`,
    [providerId, revisionId],
  );
  await database.query(
    `INSERT INTO certifications
       (id, revision_id, provider_id, external_key, code, name, total_questions,
        time_limit_minutes, threshold_numerator, threshold_denominator, scoring_mode)
     VALUES ($1, $2, $3, 'cert-a', 'CERT-A', 'Certification A', 1, 10, 75, 1,
             'all_or_nothing')
     ON CONFLICT (id) DO NOTHING`,
    [certificationId, revisionId, providerId],
  );
  await database.query(
    `INSERT INTO catalog_heads (certification_key, active_revision_id, updated_at, version)
     VALUES ('cert-a', $1, $2, 0)
     ON CONFLICT (certification_key) DO NOTHING`,
    [revisionId, now],
  );
}

function required(key: string): string {
  const value = process.env[key];
  if (!value)
    throw new Error(
      `RUN_DSQL_REPOSITORY_CONTRACTS=true requires ${key}; provide a reachable Aurora DSQL endpoint.`,
    );
  return value;
}
