import { DsqlPoolLifecycle } from "./dsql-pool.js";
import { DsqlMigrationRunner } from "./migrate.js";
import { assertApplicationSchema, loadApplicationMigrations } from "./migrations.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`Missing required ${name}.`);
  return value;
}

const lifecycle = new DsqlPoolLifecycle({
  endpoint: required("DSQL_ENDPOINT"),
  region: required("AWS_REGION"),
  database: process.env.DSQL_DATABASE || undefined,
  user: process.env.DSQL_USER || undefined,
  ...(process.env.PGSSLROOTCERT ? { caPath: process.env.PGSSLROOTCERT } : {}),
});

try {
  const pool = await lifecycle.pool();
  const migrations = await loadApplicationMigrations();
  const runner = new DsqlMigrationRunner(pool);
  await runner.migrate(migrations);
  const schema = await assertApplicationSchema(runner, migrations);
  process.stdout.write(
    `Applied and verified application schema versions ${schema.minimum}-${schema.maximum}.\n`,
  );
} finally {
  await lifecycle.close();
}
