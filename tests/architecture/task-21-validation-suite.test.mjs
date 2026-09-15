import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const source = async (relativePath) => readFile(`${root}/${relativePath}`, "utf8");

test("Task 21 validation command formats, validates, and conditionally plans both Terraform roots", async () => {
  const [packageJson, command] = await Promise.all([
    source("package.json"),
    source("scripts/validate-infrastructure.mjs"),
  ]);

  assert.match(
    packageJson,
    /"infra:validate": "node scripts\/validate-infrastructure\.mjs"/,
  );
  assert.match(
    packageJson,
    /"infra:plan": "node scripts\/validate-infrastructure\.mjs --plan"/,
  );
  assert.match(command, /terraform", \["fmt", "-check", "-recursive", terraformRoot\]/);
  assert.match(
    command,
    /"terraform", \["init", "-backend=false", "-input=false", "-upgrade=false"\]/,
  );
  assert.match(command, /"terraform", \["validate", "-no-color"\]/);
  assert.match(command, /"-refresh=false"/);
  assert.match(
    command,
    /environmentRoots = \[[\s\S]*environments\/dev[\s\S]*environments\/prod/,
  );
  assert.match(command, /enable_google_identity_provider=false/);
  assert.match(command, /acm_certificate_arn=arn:aws:acm:us-east-1:123456789012/);
});

test("Task 21 package validation is report-gated and uses only explicitly supplied deployment inputs", async () => {
  const [packageJson, command] = await Promise.all([
    source("package.json"),
    source("scripts/validate-infrastructure.mjs"),
  ]);

  assert.match(
    packageJson,
    /"infra:package": "node scripts\/validate-infrastructure\.mjs --package"/,
  );
  for (const variable of [
    "CERTQUIZ_LAMBDA_ROLE_ARN",
    "CERTQUIZ_DSQL_ENDPOINT",
    "SERVERLESS_ACCESS_KEY",
  ]) {
    assert.match(command, new RegExp(`requiredEnvironment\\("${variable}"\\)`));
  }
  assert.match(command, /"run-serverless\.mjs"/);
  assert.match(command, /`--param=lambdaRoleArn=\$\{lambdaRoleArn\}`/);
  assert.match(command, /`--param=databaseEndpoint=\$\{databaseEndpoint\}`/);
});

test("Task 21 local validation uses Serverless Offline without workflow automation", async () => {
  const [packageJson, serverlessPackage, serverlessConfig, runner, localHealth] =
    await Promise.all([
      source("package.json"),
      source("infra/serverless/package.json"),
      source("infra/serverless/serverless.yml"),
      source("infra/serverless/run-local-serverless.mjs"),
      source("scripts/local-api-health.mjs"),
    ]);

  assert.match(
    packageJson,
    /"api:local": "pnpm --dir infra\/serverless run offline:dev"/,
  );
  assert.match(
    packageJson,
    /"api:local:health": "node scripts\/local-api-health\.mjs"/,
  );
  assert.match(serverlessPackage, /"serverless-offline": "14\.8\.2"/);
  assert.match(
    serverlessPackage,
    /"offline:dev": "node \.\/run-local-serverless\.mjs"/,
  );
  assert.match(serverlessConfig, /plugins:\s*\n\s*- serverless-offline/);
  assert.match(serverlessConfig, /noPrependStageInUrl: true/);
  assert.match(serverlessConfig, /ignoreJWTSignature: true/);
  assert.match(serverlessConfig, /CERTQUIZ_LOCAL_EMULATION/);
  assert.match(runner, /CERTQUIZ_LOCAL_EMULATION: "true"/);
  assert.match(runner, /"offline", "start"/);
  assert.match(localHealth, /\/v1\/health/);
});

test("Task 21 deployed smoke resolves a stack HttpApiUrl by default and keeps overrides optional", async () => {
  const [packageJson, smoke] = await Promise.all([
    source("package.json"),
    source("scripts/deployed-infrastructure-smoke.mjs"),
  ]);

  assert.match(
    packageJson,
    /"infra:smoke": "node scripts\/deployed-infrastructure-smoke\.mjs"/,
  );
  assert.match(smoke, /CERTQUIZ_DEPLOYED_API_ORIGIN/);
  assert.match(smoke, /CERTQUIZ_DEPLOYED_WEB_ORIGIN/);
  assert.match(smoke, /CERTQUIZ_STAGE \?\? "dev"/);
  assert.match(
    smoke,
    /CERTQUIZ_REGION \?\? process\.env\.AWS_REGION \?\? "ap-northeast-2"/,
  );
  assert.match(smoke, /certquiz-api-\$\{stage\}/);
  assert.match(smoke, /"cloudformation",\s*\n\s*"describe-stacks"/);
  assert.match(smoke, /OutputKey === "HttpApiUrl"/);
  assert.match(smoke, /Health endpoint returned/);
  assert.match(smoke, /strict-transport-security/);
  assert.match(smoke, /if \(!webOrigin\) return/);
  assert.match(smoke, /\/v1\/me\/approval/);
  assert.match(smoke, /Unauthenticated approval request returned/);
  assert.match(
    smoke,
    /expectHeader\(unauthenticated, "access-control-allow-origin", webOrigin\)/,
  );
});
