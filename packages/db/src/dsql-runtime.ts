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

export type ApplicationDatabaseRoleProvisioning = Readonly<{
  /** PostgreSQL role name the Lambda IAM execution role authenticates as. */
  roleName: string;
  /** IAM role ARN mapped to `roleName` via Aurora DSQL's `AWS IAM GRANT`. */
  iamRoleArn: string;
}>;

/**
 * Deployment/test-only schema operation. Dynamic imports keep migration source
 * loading, migration execution, and checksum verification out of Lambda's
 * production request-startup module graph.
 *
 * When `roleProvisioning` is supplied, the target PostgreSQL role, its IAM
 * mapping, and its table grants are provisioned after migrations apply
 * (self-healing the one-off `app` role setup this previously required by
 * hand). Provisioning runs after, not before, migrations: `GRANT ... ON ALL
 * TABLES IN SCHEMA public` only covers tables that already exist at grant
 * time, so running it last ensures any table a migration just created in
 * this same deploy is granted immediately rather than left ungranted until
 * the next deploy. Role creation and the IAM mapping have no such ordering
 * dependency on the schema, but are kept in the same post-migration step for
 * a single, simple provisioning call.
 */
export async function migrateAndVerifyApplicationSchema(
  poolConfiguration: DsqlPoolConfig,
  roleProvisioning?: ApplicationDatabaseRoleProvisioning,
): Promise<SchemaVersionRange> {
  const lifecycle = new DsqlPoolLifecycle(poolConfiguration);
  try {
    const pool = await lifecycle.pool();
    const [
      { DsqlMigrationRunner, provisionApplicationDatabaseRole },
      { assertApplicationSchema, loadApplicationMigrations },
    ] = await Promise.all([import("./migrate.js"), import("./migrations.js")]);
    const migrations = await loadApplicationMigrations();
    const runner = new DsqlMigrationRunner(pool);
    await runner.migrate(migrations);
    const schema = await assertApplicationSchema(runner, migrations);
    if (roleProvisioning) {
      await provisionApplicationDatabaseRole(pool, {
        roleName: roleProvisioning.roleName,
        iamRoleArn: roleProvisioning.iamRoleArn,
      });
    }
    return schema;
  } finally {
    await lifecycle.close();
  }
}
