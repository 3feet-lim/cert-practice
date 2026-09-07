# Serverless deployment

`serverless.yml` owns the Hono Lambda, its published versions, and the HTTP API route. Terraform owns DSQL/Cognito resources, SSM values, the permanent Lambda execution role, and the Lambda log group/retention policy. `disableLogs: true` prevents Serverless from creating a conflicting default log group.

## Current deployment boundary

Serverless Framework v4 requires either an interactive `serverless login` or a `SERVERLESS_ACCESS_KEY`/license key before `package` or `deploy`. No Dashboard `app` is configured; authentication is only for the v4 CLI license check.

The current Terraform root publishes `/certquiz/dev/dsql-endpoint`, but it does not yet create the permanent application execution role, `/certquiz/dev/lambda-role-arn`, or `/aws/lambda/certquiz-dev-api`. Packaging is available now with a package-only placeholder role ARN. Deployment remains intentionally blocked until Terraform owns and applies all three application resources.

The future execution role must:

- trust Lambda;
- allow `dsql:DbConnect` only on the matching stage cluster (`dsql:DbConnectAdmin` remains limited to migrations or disposable spikes);
- allow `logs:CreateLogStream` and `logs:PutLogEvents` only on the pre-created application log group;
- omit `logs:CreateLogGroup`, so Terraform remains the only log-group owner.

## Report-backed package

`run-serverless.mjs` is the supported package/deploy entry point. Before invoking Serverless, it verifies the canonical SHA-256 link between `live-report.json` and `database-adapter.json`, recomputes the required-gate decision, checks stage/region/endpoint consistency, and requires passing overall and cleanup gates. A PostgreSQL decision fails closed because PostgreSQL infrastructure and runtime wiring do not exist yet.

Direct `serverless package` and `serverless deploy` calls bypass this gate and are unsupported.

From the repository root, package the qualified dev DSQL endpoint. The all-zero role ARN is accepted only by `package`; `deploy` rejects package-only placeholders.

```bash
export CERT_QUIZ_DSQL_ENDPOINT="$(aws ssm get-parameter \
  --region ap-northeast-2 \
  --name /certquiz/dev/dsql-endpoint \
  --query Parameter.Value \
  --output text)"

pnpm install --frozen-lockfile
pnpm build
pnpm --dir infra/serverless run package:dev \
  --param="lambdaRoleArn=arn:aws:iam::000000000000:role/certquiz-dev-package-only-placeholder" \
  --param="databaseEndpoint=$CERT_QUIZ_DSQL_ENDPOINT"
```

After Terraform creates the permanent role and log group and publishes the role ARN, deploy with real values:

```bash
export CERT_QUIZ_LAMBDA_ROLE_ARN="$(aws ssm get-parameter \
  --region ap-northeast-2 \
  --name /certquiz/dev/lambda-role-arn \
  --query Parameter.Value \
  --output text)"
export CERT_QUIZ_DSQL_ENDPOINT="$(aws ssm get-parameter \
  --region ap-northeast-2 \
  --name /certquiz/dev/dsql-endpoint \
  --query Parameter.Value \
  --output text)"

pnpm --dir infra/serverless run deploy:dev \
  --param="lambdaRoleArn=$CERT_QUIZ_LAMBDA_ROLE_ARN" \
  --param="databaseEndpoint=$CERT_QUIZ_DSQL_ENDPOINT"
```

The current stack exposes only `GET /v1/health`, matching the implemented API. Cognito-protected routes and the EventBridge retention event must be added only when their handlers and Terraform-owned infrastructure exist.

Serverless Framework v4 builds TypeScript handlers with its built-in esbuild integration, so this service points at `handler.ts` and does not add a build plugin. See the [official function build documentation](https://www.serverless.com/framework/docs/providers/aws/guide/building).

Content was rephrased for compliance with licensing restrictions.
