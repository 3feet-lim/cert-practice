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

test("Task 21 deployed smoke is explicitly parameterized and verifies public health plus exact-origin CORS", async () => {
  const [packageJson, smoke, workflow] = await Promise.all([
    source("package.json"),
    source("scripts/deployed-infrastructure-smoke.mjs"),
    source(".github/workflows/infrastructure-security.yml"),
  ]);

  assert.match(
    packageJson,
    /"infra:smoke": "node scripts\/deployed-infrastructure-smoke\.mjs"/,
  );
  assert.match(smoke, /CERTQUIZ_DEPLOYED_API_ORIGIN/);
  assert.match(smoke, /CERTQUIZ_DEPLOYED_WEB_ORIGIN/);
  assert.match(smoke, /Health endpoint returned/);
  assert.match(smoke, /access-control-allow-origin/);
  assert.match(smoke, /untrusted\.invalid/);
  assert.match(smoke, /strict-transport-security/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /run_deployed_smoke/);
  assert.match(workflow, /pnpm infra:smoke/);
});
