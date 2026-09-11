import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const source = async (relativePath) => readFile(`${root}/${relativePath}`, "utf8");

test("Task 21 keeps Terraform stateful resources separate from Serverless routes and jobs", async () => {
  const [serverless, devRoot, prodRoot, dsqlModule, runtimeModule] = await Promise.all([
    source("infra/serverless/serverless.yml"),
    source("infra/terraform/environments/dev/main.tf"),
    source("infra/terraform/environments/prod/main.tf"),
    source("infra/terraform/modules/dsql/main.tf"),
    source("infra/terraform/modules/application-runtime/main.tf"),
  ]);

  for (const terraformRoot of [devRoot, prodRoot]) {
    assert.match(terraformRoot, /module "dsql"/);
    assert.match(terraformRoot, /module "application_runtime"/);
    assert.doesNotMatch(terraformRoot, /aws_lambda_function|aws_cloudwatch_log_group/);
  }
  assert.match(dsqlModule, /resource "aws_dsql_cluster"/);
  assert.match(dsqlModule, /resource "aws_ssm_parameter" "dsql_endpoint"/);

  assert.match(
    serverless,
    /iam:\s+# Terraform owns[\s\S]*role: \$\{ssm:\/certquiz\/\$\{sls:stage\}\/lambda-role-arn\}/,
  );
  assert.match(
    serverless,
    /COGNITO_ISSUER: \$\{ssm:\/certquiz\/\$\{sls:stage\}\/cognito-issuer\}/,
  );
  assert.match(
    serverless,
    /WEB_ORIGIN: \$\{ssm:\/certquiz\/\$\{sls:stage\}\/web-origin\}/,
  );
  assert.match(
    serverless,
    /MARKDOWN_IMAGE_ORIGINS: \$\{ssm:\/certquiz\/\$\{sls:stage\}\/markdown-image-origins\}/,
  );
  assert.match(
    serverless,
    /RATE_LIMIT_TABLE: \$\{ssm:\/certquiz\/\$\{sls:stage\}\/rate-limit-table-name\}/,
  );
  assert.match(
    serverless,
    /RATE_LIMIT_POLICIES: \$\{ssm:\/certquiz\/\$\{sls:stage\}\/rate-limit-policies\}/,
  );
  assert.match(serverless, /type: jwt/);
  assert.match(serverless, /path: \/v1\/\{proxy\+\}/);
  assert.match(serverless, /method: "\*"/);
  assert.match(serverless, /method: OPTIONS/);
  assert.match(serverless, /eventBridge:[\s\S]*schedule: rate\(1 hour\)/);
  assert.match(serverless, /handler: handler\.practiceRetentionHandler/);
  assert.doesNotMatch(
    serverless,
    /aws_cognito_user_pool|aws_dsql_cluster|aws_s3_bucket/,
  );

  for (const resource of [
    "aws_cognito_user_pool",
    "aws_cognito_identity_provider",
    "aws_cognito_user_pool_client",
    "aws_s3_bucket",
    "aws_s3_bucket_versioning",
    "aws_s3_bucket_public_access_block",
    "aws_cloudfront_origin_access_control",
    "aws_cloudfront_distribution",
    "aws_dynamodb_table",
    "aws_route53_record",
    "aws_ssm_parameter",
  ]) {
    assert.match(
      runtimeModule,
      new RegExp(`resource "${resource.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")}`),
    );
  }
  assert.match(runtimeModule, /enable_google_identity_provider/);
  assert.match(runtimeModule, /google_oauth_client_secret/);
  assert.match(runtimeModule, /sse_algorithm = "AES256"/);
  assert.match(runtimeModule, /status = "Enabled"/);
  assert.match(runtimeModule, /backup-recovery-policy/);
  assert.match(runtimeModule, /dsql-provider-managed-pitr/);

  for (const name of [
    "cognito-user-pool-id",
    "cognito-client-id",
    "cognito-issuer",
    "lambda-role-arn",
    "web-bucket-name",
    "cloudfront-distribution-id",
    "web-origin",
    "markdown-image-origins",
    "rate-limit-table-name",
    "rate-limit-policies",
  ]) {
    assert.match(runtimeModule, new RegExp(`"${name}"`));
  }
});

test("Task 21 EventBridge cleanup architecture cannot create an exam Attempt", async () => {
  const [lambda, production] = await Promise.all([
    source("apps/api/src/lambda.ts"),
    source("apps/api/src/production.ts"),
  ]);

  const cleanupHandler = lambda.match(
    /export async function practiceRetentionHandler\(\)[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(cleanupHandler, "practice retention handler must be exported");
  assert.match(cleanupHandler, /cleanupExpiredPracticeResults\(\)/);
  assert.doesNotMatch(cleanupHandler, /finalize|submitExam|Attempt/i);

  const cleanupComposition = production.match(
    /cleanupExpiredPracticeResults:[\s\S]*?lifecycle\.cleanupPracticeResults\(validateBatchSize\(batchSize\)\)/,
  )?.[0];
  assert.ok(cleanupComposition, "cleanup composition must only call lifecycle cleanup");
  assert.doesNotMatch(cleanupComposition, /finalize|submitExam|Attempt/i);
});

test("Task 21 production root requires remote state and preserves recovery protections", async () => {
  const [backend, prodVariables, prodRole, devRole] = await Promise.all([
    source("infra/terraform/environments/prod/backend.tf"),
    source("infra/terraform/environments/prod/variables.tf"),
    source("infra/terraform/environments/prod/api-lambda-execution-role.tf"),
    source("infra/terraform/environments/dev/api-lambda-execution-role.tf"),
  ]);

  assert.match(backend, /backend "s3"/);
  assert.match(backend, /encrypt\s+= true/);
  assert.match(backend, /use_lockfile = true/);
  assert.match(prodVariables, /variable "web_domain_name"/);
  assert.match(prodVariables, /variable "route53_zone_id"/);
  assert.match(prodVariables, /variable "acm_certificate_arn"/);
  assert.match(prodVariables, /default\s+= true/);

  for (const role of [devRole, prodRole]) {
    assert.match(role, /dsql:DbConnect/);
    assert.match(role, /dynamodb:TransactWriteItems/);
    assert.match(role, /rate_limit_table_arn/);
    assert.match(role, /ReadRuntimeContract/);
    assert.match(role, /ssm:GetParameter/);
    assert.match(role, /logs:CreateLogStream/);
    assert.match(role, /logs:PutLogEvents/);
    assert.doesNotMatch(role, /DbConnectAdmin|logs:CreateLogGroup|iam:PassRole/);
  }
});


test("Task 21 provisions CloudWatch telemetry, actionable alarms, and machine-readable runbooks", async () => {
  const [serverless, runbooks, telemetry, production] = await Promise.all([
    source("infra/serverless/serverless.yml"),
    source("infra/serverless/runbooks.json"),
    source("apps/api/src/telemetry.ts"),
    source("apps/api/src/production.ts"),
  ]);

  assert.match(serverless, /TELEMETRY_NAMESPACE: \$\{self:custom\.telemetryNamespace\}/);
  assert.match(serverless, /TELEMETRY_SERVICE: \$\{self:custom\.telemetryService\}/);
  assert.match(serverless, /Type: AWS::CloudWatch::Dashboard/);
  for (const alarm of [
    "Api5xxAlarm",
    "FinalizeFailureAlarm",
    "CleanupFailureAlarm",
    "ImportRollbackAlarm",
    "ProjectionLeakGuardAlarm",
    "DbLatencyAlarm",
    "BudgetAlarm",
  ]) {
    assert.match(serverless, new RegExp(`^    ${alarm}:`, "m"));
  }
  assert.match(serverless, /MetricName: Api5xx/);
  assert.match(serverless, /MetricName: FinalizeFailures/);
  assert.match(serverless, /MetricName: CleanupFailures/);
  assert.match(serverless, /MetricName: ImportRollbacks/);
  assert.match(serverless, /MetricName: ProjectionSchemaFailures/);
  assert.match(serverless, /MetricName: DbConnectLatencyMs/);
  assert.match(serverless, /Namespace: AWS\/Billing/);
  assert.match(serverless, /RunbookUrl: \$\{self:custom\.runbooks\./);
  assert.match(runbooks, /"api-5xx"/);
  assert.match(runbooks, /"projection-leak"/);

  assert.match(telemetry, /createCloudWatchEmbeddedMetricsTelemetry/);
  for (const metric of [
    "FinalizeFailures",
    "CleanupFailures",
    "ImportRollbacks",
    "ProjectionSchemaFailures",
    "DbConnectLatencyMs",
  ])
    assert.match(telemetry, new RegExp(metric));
  assert.match(production, /event: "db\.runtime"/);
  assert.match(production, /event: "api\.cleanup"/);
});
