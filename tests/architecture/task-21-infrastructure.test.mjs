import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const source = async (relativePath) => readFile(`${root}/${relativePath}`, "utf8");
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const runtimeResourceAddresses = [
  "aws_dynamodb_table.rate_limit",
  "aws_cognito_user_pool.this",
  "aws_cognito_user_pool_domain.hosted_ui",
  "aws_cognito_identity_provider.google[0]",
  "aws_cognito_user_pool_client.web",
  "aws_s3_bucket.web",
  "aws_s3_bucket_public_access_block.web",
  "aws_s3_bucket_ownership_controls.web",
  "aws_s3_bucket_server_side_encryption_configuration.web",
  "aws_s3_bucket_versioning.web",
  "aws_s3_bucket_lifecycle_configuration.web",
  "aws_cloudfront_origin_access_control.web",
  "aws_cloudfront_response_headers_policy.web_security",
  "aws_cloudfront_distribution.web",
  "aws_s3_bucket_policy.web",
  "aws_route53_record.web[0]",
  ...[
    "cognito-user-pool-id",
    "cognito-client-id",
    "cognito-issuer",
    "cognito-hosted-ui-base-url",
    "lambda-role-arn",
    "web-bucket-name",
    "cloudfront-distribution-id",
    "cloudfront-domain-name",
    "web-origin",
    "markdown-image-origins",
    "rate-limit-table-name",
    "rate-limit-policies",
    "api-origin",
    "backup-recovery-policy",
  ].map((name) => `aws_ssm_parameter.contract[\"${name}\"]`),
];

test("Task 21 keeps Terraform stateful resources separate from Serverless routes and jobs", async () => {
  const [
    serverless,
    devRoot,
    prodRoot,
    dsqlModule,
    devCognito,
    devWebDelivery,
    devRateLimit,
    devSsm,
    devMoved,
    prodCognito,
    prodWebDelivery,
    prodRateLimit,
    prodSsm,
    prodMoved,
  ] = await Promise.all([
    source("infra/serverless/serverless.yml"),
    source("infra/terraform/environments/dev/main.tf"),
    source("infra/terraform/environments/prod/main.tf"),
    source("infra/terraform/modules/dsql/main.tf"),
    source("infra/terraform/environments/dev/cognito.tf"),
    source("infra/terraform/environments/dev/web_delivery.tf"),
    source("infra/terraform/environments/dev/rate_limit.tf"),
    source("infra/terraform/environments/dev/ssm.tf"),
    source("infra/terraform/environments/dev/moved.tf"),
    source("infra/terraform/environments/prod/cognito.tf"),
    source("infra/terraform/environments/prod/web_delivery.tf"),
    source("infra/terraform/environments/prod/rate_limit.tf"),
    source("infra/terraform/environments/prod/ssm.tf"),
    source("infra/terraform/environments/prod/moved.tf"),
  ]);

  for (const terraformRoot of [devRoot, prodRoot]) {
    assert.match(terraformRoot, /module "dsql"/);
    assert.doesNotMatch(terraformRoot, /module "application_runtime"/);
    assert.doesNotMatch(terraformRoot, /aws_lambda_function|aws_cloudwatch_log_group/);
  }
  assert.match(dsqlModule, /resource "aws_dsql_cluster"/);
  assert.match(dsqlModule, /resource "aws_ssm_parameter" "dsql_endpoint"/);

  for (const [runtime, moved] of [
    [[devCognito, devWebDelivery, devRateLimit, devSsm].join("\n"), devMoved],
    [[prodCognito, prodWebDelivery, prodRateLimit, prodSsm].join("\n"), prodMoved],
  ]) {
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
      assert.match(runtime, new RegExp(`resource "${resource}"`));
    }
    for (const address of runtimeResourceAddresses) {
      assert.match(
        moved,
        new RegExp(
          `from\\s*=\\s*module\\.application_runtime\\.${escapeRegExp(address)}[\\s\\S]*?to\\s*=\\s*${escapeRegExp(address)}`,
        ),
      );
    }
    assert.match(runtime, /enable_google_identity_provider/);
    assert.match(runtime, /google_oauth_client_secret/);
    assert.match(runtime, /sse_algorithm = "AES256"/);
    assert.match(runtime, /status = "Enabled"/);
    assert.match(runtime, /backup-recovery-policy/);
    assert.match(runtime, /dsql-provider-managed-pitr/);
  }
  await assert.rejects(access(`${root}/infra/terraform/modules/application-runtime`));

  assert.match(
    serverless,
    /build:\s+esbuild:\s+format: cjs/,
    "Serverless must emit a CommonJS handler so pg dynamic requires remain executable",
  );
  assert.match(
    serverless,
    /iam:\s+# Terraform owns[\s\S]*role: \$\{env:CERTQUIZ_LAMBDA_ROLE_ARN, ssm:\/certquiz\/\$\{sls:stage\}\/lambda-role-arn\}/,
  );
  assert.match(
    serverless,
    /COGNITO_ISSUER: \$\{env:CERTQUIZ_COGNITO_ISSUER, ssm:\/certquiz\/\$\{sls:stage\}\/cognito-issuer\}/,
  );
  assert.match(
    serverless,
    /WEB_ORIGIN: \$\{env:CERTQUIZ_WEB_ORIGIN, ssm:\/certquiz\/\$\{sls:stage\}\/web-origin\}/,
  );
  assert.match(
    serverless,
    /MARKDOWN_IMAGE_ORIGINS: \$\{env:CERTQUIZ_MARKDOWN_IMAGE_ORIGINS, ssm:\/certquiz\/\$\{sls:stage\}\/markdown-image-origins\}/,
  );
  assert.match(
    serverless,
    /RATE_LIMIT_TABLE: \$\{env:CERTQUIZ_RATE_LIMIT_TABLE, ssm:\/certquiz\/\$\{sls:stage\}\/rate-limit-table-name\}/,
  );
  assert.match(
    serverless,
    /RATE_LIMIT_POLICIES: \$\{env:CERTQUIZ_RATE_LIMIT_POLICIES, ssm:\/certquiz\/\$\{sls:stage\}\/rate-limit-policies\}/,
  );
  assert.match(serverless, /type: jwt/);
  assert.match(
    serverless,
    /httpApi:[\s\S]*?cors:[\s\S]*?allowedOrigins:[\s\S]*?\$\{env:CERTQUIZ_WEB_ORIGIN, ssm:\/certquiz\/\$\{sls:stage\}\/web-origin\}[\s\S]*?allowedHeaders:[\s\S]*?authorization[\s\S]*?content-type[\s\S]*?x-request-id[\s\S]*?allowedMethods:[\s\S]*?GET[\s\S]*?POST[\s\S]*?PATCH[\s\S]*?OPTIONS/,
    "Gateway CORS must use the Terraform-published exact SPA origin and browser request headers.",
  );
  assert.doesNotMatch(
    serverless,
    /allowedOrigins:[\s\S]*?- \*|allowedOrigins:[\s\S]*?- ['"]\*['"]/,
    "Gateway CORS must never allow wildcard origins.",
  );
  assert.match(serverless, /path: \/v1\/\{proxy\+\}/);
  assert.match(serverless, /method: "\*"/);
  assert.match(serverless, /method: OPTIONS/);
  assert.match(serverless, /eventBridge:[\s\S]*schedule: rate\(1 hour\)/);
  assert.match(serverless, /handler: handler\.practiceRetentionHandler/);
  assert.doesNotMatch(
    serverless,
    /aws_cognito_user_pool|aws_dsql_cluster|aws_s3_bucket/,
  );
});

test("Task 21 SSM contract keeps API origin optional and Markdown image origins fail closed", async () => {
  const [devSsm, prodSsm, devVariables, prodVariables] = await Promise.all([
    source("infra/terraform/environments/dev/ssm.tf"),
    source("infra/terraform/environments/prod/ssm.tf"),
    source("infra/terraform/environments/dev/variables.tf"),
    source("infra/terraform/environments/prod/variables.tf"),
  ]);

  for (const [ssm, variables] of [
    [devSsm, devVariables],
    [prodSsm, prodVariables],
  ]) {
    assert.match(
      ssm,
      /markdown_image_origins = length\(var\.markdown_image_origins\) == 0 \? \["https:\/\/images\.invalid"\] : var\.markdown_image_origins/,
    );
    assert.match(
      ssm,
      /"markdown-image-origins"\s+= join\(",", local\.markdown_image_origins\)/,
    );
    assert.match(
      ssm,
      /runtime_parameter_values = merge\([\s\S]*?var\.api_origin == null \? \{\} : \{\s*"api-origin" = var\.api_origin/,
    );
    assert.doesNotMatch(ssm, /"api-origin"\s+= var\.api_origin == null \? ""/);
    assert.match(
      variables,
      /empty list publishes the fail-closed https:\/\/images\.invalid sentinel/,
    );
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
    /cleanupExpiredPracticeResults:[\s\S]*?lifecycle\.cleanupPracticeResults\(\s*validateBatchSize\(batchSize\)\s*,?\s*\)/,
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
    assert.match(role, /rate_limit_table_arn|aws_dynamodb_table\.rate_limit\.arn/);
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

  assert.match(
    serverless,
    /TELEMETRY_NAMESPACE: \$\{self:custom\.telemetryNamespace\}/,
  );
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

test("DEV GitHub Actions deployment trusts repository-wide OIDC subjects with account-and-region-scoped deployment access", async () => {
  const [role, outputs, documentation, workflow] = await Promise.all([
    source("infra/terraform/environments/dev/github-actions-dev-deploy-role.tf"),
    source("infra/terraform/environments/dev/outputs.tf"),
    source("infra/terraform/README.md"),
    source(".github/workflows/deploy-dev.yml"),
  ]);

  assert.match(role, /resource "aws_iam_openid_connect_provider" "github_actions"/);
  assert.match(role, /https:\/\/token\.actions\.githubusercontent\.com/);
  assert.match(role, /client_id_list\s+= \["sts\.amazonaws\.com"\]/);
  assert.match(role, /sts:AssumeRoleWithWebIdentity/);
  assert.match(
    role,
    /test\s+= "StringEquals"\s+variable\s+= "token\.actions\.githubusercontent\.com:aud"\s+values\s+= \["sts\.amazonaws\.com"\]/,
  );
  assert.match(
    role,
    /test\s+= "StringLike"\s+variable\s+= "token\.actions\.githubusercontent\.com:sub"\s+values\s+= \["repo:3feet-lim@139703302\/cert-practice@1354159331:\*"\]/,
  );
  assert.doesNotMatch(role, /repo:3feet-lim\/cert-practice/);
  assert.doesNotMatch(
    role,
    /repo:3feet-lim@139703302\/cert-practice@1354159331:ref:refs\/heads\/main/,
  );
  assert.match(role, /aws_caller_identity\.current\.account_id/);
  assert.match(role, /aws:RequestedRegion/);
  assert.match(role, /ServerlessDeploymentBucketName/);
  assert.match(role, /cloudformation:DescribeStacks/);
  assert.match(role, /lambda:UpdateFunctionCode/);
  assert.match(role, /apigateway:POST/);
  assert.match(role, /iam:PassRole/);
  assert.match(role, /iam:PassedToService/);
  assert.match(role, /aws_iam_role\.api_lambda_execution\.arn/);
  assert.match(
    role,
    /arn:\$\{data\.aws_partition\.current\.partition\}:ssm:\$\{var\.aws_region\}:\$\{data\.aws_caller_identity\.current\.account_id\}:parameter\/\*/,
  );
  assert.doesNotMatch(role, /parameter\/\$\{var\.service_name\}\/dev\/\*/);
  assert.doesNotMatch(
    role,
    /AdministratorAccess|aws_iam_role\.api_lambda_execution\s*\{/,
  );
  assert.match(
    role,
    /github_actions_dev_framework_bucket_arn\s+= "arn:\$\{data\.aws_partition\.current\.partition\}:s3:::serverless-framework-deployments-\$\{var\.aws_region\}-\*"/,
  );
  assert.match(role, /sid\s+= "ManageServerlessFrameworkDeploymentBucket"/);
  assert.match(role, /actions\s+= \["s3:\*"\]/);
  assert.match(
    role,
    /local\.github_actions_dev_framework_bucket_arn,\s*"\$\{local\.github_actions_dev_framework_bucket_arn\}\/\*"/,
  );
  assert.doesNotMatch(
    role,
    /resources\s+= \["arn:\$\{data\.aws_partition\.current\.partition\}:s3:::\*"\]/,
  );

  assert.match(outputs, /output "github_actions_dev_deploy_role_arn"/);
  assert.match(outputs, /CERTQUIZ_RELEASE_ROLE_ARN/);
  assert.match(documentation, /repo:3feet-lim@139703302\/cert-practice@1354159331:\*/);
  assert.match(documentation, /branch, tag, and GitHub environment independent/);
  assert.match(
    documentation,
    /immutable GitHub owner and repository identifiers `139703302` and `1354159331`/,
  );
  assert.match(documentation, /`arn:<partition>:ssm:<region>:<account>:parameter\/\*`/);
  assert.match(
    documentation,
    /Serverless Framework reads its framework-managed `\/serverless-framework\/deployment\/s3-bucket` parameter/,
  );
  assert.match(documentation, /never another account or region/);
  assert.match(
    documentation,
    /main`: it builds both DEV API and SPA assets, deploys and smokes the DEV API, then publishes the SPA only after that smoke succeeds/,
  );
  assert.match(documentation, /github_actions_dev_deploy_role_arn/);
  assert.match(documentation, /Environment\*\* `release-dev`/);
  assert.match(documentation, /SERVERLESS_ACCESS_KEY/);
  assert.match(workflow, /branches: \[main\]/);
  assert.match(workflow, /environment: release-dev/);
  assert.match(workflow, /CERTQUIZ_RELEASE_ROLE_ARN/);
  assert.match(workflow, /Apply and verify DEV DSQL migrations/);
  assert.match(workflow, /DSQL_ENDPOINT="\$\(aws ssm get-parameter --name \/certquiz\/dev\/dsql-endpoint/);
  assert.match(workflow, /DSQL_USER=admin/);
  assert.match(workflow, /pnpm --filter @cert-quiz\/db run migrate:deploy/);
  assert.ok(
    workflow.indexOf("Apply and verify DEV DSQL migrations") <
      workflow.indexOf("Deploy DEV Serverless API"),
    "DEV migrations must finish before Serverless API deployment",
  );
  assert.match(role, /sid\s+= "ConnectToDevDsqlAsMigrationAdmin"/);
  assert.match(role, /actions\s+= \["dsql:DbConnectAdmin"\]/);
  assert.match(role, /resources = \[module\.dsql\.cluster_arn\]/);
  assert.match(workflow, /Resolve DEV SPA runtime configuration/);
  assert.match(
    workflow,
    /cloudformation describe-stacks --stack-name certquiz-api-dev/,
  );
  assert.match(workflow, /OutputKey=='HttpApiUrl'/);
  assert.match(workflow, /\/certquiz\/dev\/cognito-hosted-ui-base-url/);
  assert.match(workflow, /\/certquiz\/dev\/cognito-client-id/);
  assert.match(workflow, /VITE_CERTQUIZ_RUNTIME_MODE: http/);
  assert.match(
    workflow,
    /VITE_CERTQUIZ_API_BASE_URL: \$\{\{ steps\.web-runtime\.outputs\.api_base_url \}\}/,
  );
  assert.match(workflow, /VITE_CERTQUIZ_COGNITO_HOSTED_UI_BASE_URL/);
  assert.match(workflow, /VITE_CERTQUIZ_COGNITO_CLIENT_ID/);
  assert.match(workflow, /Build DEV SPA with public runtime configuration/);
  assert.match(workflow, /pnpm --filter @cert-quiz\/web build/);
  assert.match(workflow, /aws s3 sync apps\/web\/dist/);
  assert.match(workflow, /--delete --exclude "index\.html"/);
  assert.match(workflow, /max-age=31536000,immutable/);
  assert.match(workflow, /aws s3 cp apps\/web\/dist\/index\.html/);
  assert.match(workflow, /no-cache, no-store, must-revalidate/);
  assert.match(workflow, /cloudfront create-invalidation/);
  assert.match(workflow, /cloudfront wait invalidation-completed/);
  assert.ok(
    workflow.indexOf("Smoke deployed DEV infrastructure") <
      workflow.indexOf("Resolve DEV SPA delivery targets"),
    "SPA targets must not be read until deployed API smoke succeeds",
  );

  assert.match(role, /sid\s+= "ListDevWebAssetBucket"/);
  assert.match(role, /actions\s+= \["s3:ListBucket"\]/);
  assert.match(role, /resources\s+= \[aws_s3_bucket\.web\.arn\]/);
  assert.match(
    role,
    /sid = "SyncDevWebAssets"[\s\S]*?"s3:GetObject"[\s\S]*?"s3:PutObject"/,
  );
  assert.match(role, /resources = \["\$\{aws_s3_bucket\.web\.arn\}\/\*"\]/);
  assert.match(
    role,
    /sid = "InvalidateDevWebDistribution"[\s\S]*?"cloudfront:CreateInvalidation"[\s\S]*?"cloudfront:GetInvalidation"/,
  );
  assert.match(role, /resources = \[aws_cloudfront_distribution\.web\.arn\]/);
  assert.doesNotMatch(
    role,
    /cloudfront:(UpdateDistribution|CreateDistribution|DeleteDistribution)/,
  );
  assert.match(
    documentation,
    /main`: it builds both DEV API and SPA assets, deploys and smokes the DEV API, then publishes the SPA only after that smoke succeeds/,
  );
  assert.match(
    documentation,
    /CloudFront distribution configuration is Terraform-owned/,
  );
  assert.match(
    documentation,
    /only invalidates the existing distribution after upload/,
  );
});
