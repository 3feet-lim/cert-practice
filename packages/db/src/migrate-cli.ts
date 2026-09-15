import { migrateAndVerifyApplicationSchema } from "./dsql-runtime.js";

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`Missing required ${name}.`);
  return value;
}

const lambdaRoleArn = process.env.CERTQUIZ_LAMBDA_ROLE_ARN || undefined;
if (!lambdaRoleArn) {
  process.stdout.write(
    "CERTQUIZ_LAMBDA_ROLE_ARN is not set; skipping application database role provisioning.\n",
  );
}

const schema = await migrateAndVerifyApplicationSchema(
  {
    endpoint: required("DSQL_ENDPOINT"),
    region: required("AWS_REGION"),
    database: process.env.DSQL_DATABASE || undefined,
    user: process.env.DSQL_USER || undefined,
    ...(process.env.PGSSLROOTCERT ? { caPath: process.env.PGSSLROOTCERT } : {}),
  },
  lambdaRoleArn
    ? {
        roleName: process.env.CERTQUIZ_APP_DB_ROLE || "app",
        iamRoleArn: lambdaRoleArn,
      }
    : undefined,
);

process.stdout.write(
  `Applied and verified application schema versions ${schema.minimum}-${schema.maximum}.\n`,
);
