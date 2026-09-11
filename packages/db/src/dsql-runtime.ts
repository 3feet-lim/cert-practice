import { DsqlPoolLifecycle, type DsqlPoolConfig } from "./dsql-pool.js";
import { DsqlUnitOfWork, type DsqlUnitOfWorkOptions } from "./dsql-unit-of-work.js";
import { DsqlMigrationRunner } from "./migrate.js";
import {
  assertApplicationSchema,
  loadApplicationMigrations,
  type SchemaVersionRange,
} from "./migrations.js";

export type DsqlRuntimeOptions = {
  pool: DsqlPoolConfig;
  unitOfWork?: DsqlUnitOfWorkOptions;
};

export type DsqlRuntime = {
  unitOfWork: DsqlUnitOfWork;
  schema: SchemaVersionRange;
  /** For process shutdown only; Lambda invocations intentionally reuse the pool. */
  close(): Promise<void>;
};

/**
 * Production composition helper: creates the module-scoped IAM/TLS pool,
 * runs/replays migrations, verifies checksums, then exposes only UnitOfWork.
 * Lambda composition can retain this promise across freeze/thaw.
 */
export async function initializeDsqlRuntime(
  options: DsqlRuntimeOptions,
): Promise<DsqlRuntime> {
  const lifecycle = new DsqlPoolLifecycle(options.pool);
  const pool = await lifecycle.pool();
  const migrations = await loadApplicationMigrations();
  const runner = new DsqlMigrationRunner(pool);
  await runner.migrate(migrations);
  const schema = await assertApplicationSchema(runner, migrations);
  return {
    unitOfWork: new DsqlUnitOfWork(pool, options.unitOfWork),
    schema,
    close: () => lifecycle.close(),
  };
}
