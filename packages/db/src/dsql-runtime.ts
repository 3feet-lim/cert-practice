import { DsqlPoolLifecycle, type DsqlPoolConfig } from "./dsql-pool.js";
import { DsqlUnitOfWork, type DsqlUnitOfWorkOptions } from "./dsql-unit-of-work.js";
import type { SchemaVersionRange } from "./migrations.js";

export type DsqlRuntimeOptions = {
  pool: DsqlPoolConfig;
  unitOfWork?: DsqlUnitOfWorkOptions;
};

export type DsqlRuntime = {
  unitOfWork: DsqlUnitOfWork;
  /** For process shutdown only; Lambda invocations intentionally reuse the pool. */
  close(): Promise<void>;
};

type PoolLifecycle = Pick<DsqlPoolLifecycle, "pool" | "close">;

export type DsqlRuntimeDependencies = Readonly<{
  createPoolLifecycle?(config: DsqlPoolConfig): PoolLifecycle;
}>;

/**
 * Opens the IAM/TLS pool, validates that it can accept a query, and exposes the
 * UnitOfWork used by Lambda request handling. Schema deployment deliberately
 * remains outside this path so a CommonJS Lambda bundle never loads migration
 * source files or runs DDL on a cold start.
 */
export async function initializeDsqlRuntime(
  options: DsqlRuntimeOptions,
  dependencies: DsqlRuntimeDependencies = {},
): Promise<DsqlRuntime> {
  const lifecycle = (dependencies.createPoolLifecycle ??
    ((config: DsqlPoolConfig) => new DsqlPoolLifecycle(config)))(options.pool);
  try {
    const pool = await lifecycle.pool();
    await pool.query("SELECT 1");
    return {
      unitOfWork: new DsqlUnitOfWork(pool, options.unitOfWork),
      close: () => lifecycle.close(),
    };
  } catch (error) {
    await lifecycle.close();
    throw error;
  }
}

/**
 * Deployment/test-only schema operation. Dynamic imports keep migration source
 * loading, migration execution, and checksum verification out of Lambda's
 * production request-startup module graph.
 */
export async function migrateAndVerifyApplicationSchema(
  poolConfiguration: DsqlPoolConfig,
): Promise<SchemaVersionRange> {
  const lifecycle = new DsqlPoolLifecycle(poolConfiguration);
  try {
    const pool = await lifecycle.pool();
    const [{ DsqlMigrationRunner }, { assertApplicationSchema, loadApplicationMigrations }] =
      await Promise.all([import("./migrate.js"), import("./migrations.js")]);
    const migrations = await loadApplicationMigrations();
    const runner = new DsqlMigrationRunner(pool);
    await runner.migrate(migrations);
    return assertApplicationSchema(runner, migrations);
  } finally {
    await lifecycle.close();
  }
}
