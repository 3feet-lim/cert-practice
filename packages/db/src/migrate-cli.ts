import { migrateAndVerifyApplicationSchema } from "./dsql-runtime.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`Missing required ${name}.`);
  return value;
}

const schema = await migrateAndVerifyApplicationSchema({
  endpoint: required("DSQL_ENDPOINT"),
  region: required("AWS_REGION"),
  database: process.env.DSQL_DATABASE || undefined,
  user: process.env.DSQL_USER || undefined,
  ...(process.env.PGSSLROOTCERT ? { caPath: process.env.PGSSLROOTCERT } : {}),
});

process.stdout.write(
  `Applied and verified application schema versions ${schema.minimum}-${schema.maximum}.\n`,
);
