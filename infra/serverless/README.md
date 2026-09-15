# Serverless deployment

`serverless.yml` owns the Hono Lambda, its published versions, HTTP API route, and Lambda log group with 30-day retention. Terraform owns DSQL/Cognito resources, SSM values, and the permanent Lambda execution role.

## Current deployment boundary

Serverless Framework v4 requires either an interactive `serverless login` or a `SERVERLESS_ACCESS_KEY`/license key before `package` or `deploy`. No Dashboard `app` is configured; authentication is only for the v4 CLI license check.

The dev Terraform root defines the permanent API Lambda execution role directly. Packaging is available with a package-only placeholder role ARN, but deployment requires applying Terraform first and passing its `api_lambda_execution_role_arn` output.

The Terraform-owned execution role:

- trusts only Lambda;
- allows `dsql:DbConnect` only on the dev cluster (`dsql:DbConnectAdmin` remains limited to migrations or disposable spikes);
- allows `logs:CreateLogStream` and `logs:PutLogEvents` only under `/aws/lambda/certquiz-dev-api`;
- omits `logs:CreateLogGroup`, because Serverless creates the log group.

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

After applying the dev Terraform root, resolve its role output and the published DSQL endpoint, then deploy:

```bash
export CERT_QUIZ_LAMBDA_ROLE_ARN="$(terraform \
  -chdir=infra/terraform/environments/dev \
  output -raw api_lambda_execution_role_arn)"
export CERT_QUIZ_DSQL_ENDPOINT="$(aws ssm get-parameter \
  --region ap-northeast-2 \
  --name /certquiz/dev/dsql-endpoint \
  --query Parameter.Value \
  --output text)"

pnpm --dir infra/serverless run deploy:dev \
  --param="lambdaRoleArn=$CERT_QUIZ_LAMBDA_ROLE_ARN" \
  --param="databaseEndpoint=$CERT_QUIZ_DSQL_ENDPOINT"
```

## Production composition and routes

The stack composes the production Hono app at Lambda cold start, retaining its DSQL pool across warm invocations. Cold-start initialization only opens and probes the IAM/TLS pool before creating the UnitOfWork; it does not load source migration assets, run DDL, or verify migration checksums. The main-push DEV workflow runs `@cert-quiz/db`'s `migrate:deploy` command as the IAM-authenticated DSQL `admin` user before Serverless deploy, where it applies and verifies migrations exactly once. Migration execution and verification therefore remain deployment/test operations, not HTTP request-startup work. It reads the Terraform-owned execution role, DSQL endpoint, Cognito issuer/client ID, and SPA origin from stage-scoped SSM paths; it does not duplicate those values in Serverless parameters. The API Gateway JWT authorizer protects `/v1/{proxy+}` while `GET /v1/health` and unauthenticated `OPTIONS` preflight remain public. Hono then verifies the Cognito ID token again and applies approval, role, ownership, security-header, and telemetry policies.

`practiceRetention` is an EventBridge `rate(1 hour)` handler. It calls only `LifecycleServices.cleanupPracticeResults()` in bounded batches. It cannot finalize expired exams: exam Attempt creation stays exclusively in the authenticated owner-request lazy-finalization flow.

`run-serverless.mjs` still requires the qualified DSQL live-spike report before packaging or deployment. This repository task does not run a cloud apply.

Serverless Framework v4 builds TypeScript handlers with its built-in esbuild integration, so this service points at `handler.ts` and does not add a build plugin. See the [official function build documentation](https://www.serverless.com/framework/docs/providers/aws/guide/building).

Content was rephrased for compliance with licensing restrictions.

## Local validation

Run the Serverless HTTP emulator in one terminal, then probe its public health endpoint from another:

```bash
pnpm api:local
pnpm api:local:health
# Equivalent manual probe:
curl --fail-with-body http://127.0.0.1:3000/v1/health
```

`api:local` injects only harmless local stand-ins for Terraform/SSM values and sets `CERTQUIZ_LOCAL_EMULATION=true`. It exercises the Serverless/API Gateway adapter and the public health route without AWS calls or resource changes. Protected routes intentionally remain outside this local mode because their production composition needs real authentication and persistence dependencies. Override the probe target with `CERTQUIZ_LOCAL_API_ORIGIN` when required.

## Deployed health smoke

After a stack is already deployed, run:

```bash
pnpm infra:smoke
```

The command reads `HttpApiUrl` from CloudFormation stack `certquiz-api-<stage>` and probes `/v1/health`; the defaults are stage `dev` and region `ap-northeast-2`. It does not require manually copying an API Gateway URL. `CERTQUIZ_DEPLOYED_API_ORIGIN` remains an explicit URL override. Set `CERTQUIZ_STAGE` and `CERTQUIZ_REGION` (or `AWS_REGION`) to select another stack, and set `CERTQUIZ_DEPLOYED_WEB_ORIGIN` to additionally validate trusted and rejected CORS preflight behavior.
