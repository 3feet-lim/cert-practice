import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const source = async (relativePath) => readFile(`${root}/${relativePath}`, "utf8");

test("Task 23.5 separates always-on PR checks from protected DSQL and deployment-candidate gates", async () => {
  const [workflow, packageJson] = await Promise.all([
    source(".github/workflows/release-candidate.yml"),
    source("package.json"),
  ]);

  assert.match(workflow, /pr-static:/);
  assert.match(workflow, /pnpm ci:pr/);
  assert.match(workflow, /dsql-adapter:/);
  assert.match(workflow, /environment: db-adapter-validation/);
  assert.match(packageJson, /RUN_DSQL_REPOSITORY_CONTRACTS=true/);
  assert.match(packageJson, /RUN_DSQL_APPLICATION_TABLE_SUITE=true/);
  assert.match(packageJson, /RUN_DSQL_API_ACCEPTANCE_SUITE=true/);
  assert.match(packageJson, /pnpm db:spike:live/);
  assert.match(workflow, /deployment-candidate:/);
  assert.match(workflow, /environment: deployment-candidate/);
  assert.match(workflow, /pnpm ci:cognito-integration/);
  assert.match(workflow, /pnpm ci:real-e2e/);
  assert.match(workflow, /pnpm infra:plan/);
  assert.match(workflow, /pnpm infra:package/);
  assert.match(workflow, /configure-aws-credentials@v4/);
  assert.match(packageJson, /"ci:pr"/);
  assert.match(packageJson, /"ci:db-adapter"/);
  assert.match(packageJson, /"ci:cognito-integration"/);
  assert.match(packageJson, /"ci:real-e2e"/);
});

test("Task 23.5 binds generated live spike evidence to this run and current migrations", async () => {
  const [workflow, script] = await Promise.all([
    source(".github/workflows/release-candidate.yml"),
    source("scripts/verify-dsql-spike-evidence.mjs"),
  ]);

  assert.match(workflow, /CERTQUIZ_DSQL_SPIKE_NOT_BEFORE/);
  assert.match(workflow, /db-adapter-evidence/);
  assert.match(script, /DSQL live spike report predates this CI gate/);
  assert.match(script, /reportSha256/);
  assert.match(script, /packages\/db\/migrations/);
  assert.match(script, /One or more required DSQL compatibility gates did not pass/);
});
