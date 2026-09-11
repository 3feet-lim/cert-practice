import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../..", import.meta.url));
const source = async (relativePath) => readFile(`${root}/${relativePath}`, "utf8");

test("Task 23.6 release automation orders expand migration, unpublished smoke, alias switch, web deployment, catalog commit, and post-deploy smoke", async () => {
  const [script, packageJson, dbPackage] = await Promise.all([
    source("scripts/release-automation.mjs"),
    source("package.json"),
    source("packages/db/package.json"),
  ]);

  assert.match(
    packageJson,
    /"release:apply": "node scripts\/release-automation\.mjs release"/,
  );
  assert.match(
    packageJson,
    /"release:rollback": "node scripts\/release-automation\.mjs rollback"/,
  );
  assert.match(
    dbPackage,
    /"migrate:deploy": "pnpm run build && node dist\/migrate-cli\.js"/,
  );
  assert.match(
    script,
    /runMigrations\(endpoint, region\);[\s\S]*?deployLambda\([\s\S]*?invokeUnpublishedVersion\([\s\S]*?ensureLiveAlias\([\s\S]*?bindApiGatewayToAlias\([\s\S]*?deployWebAssets\([\s\S]*?catalogCommit\([\s\S]*?runDeployedSmoke\(/,
  );
  assert.match(script, /--qualifier",\n      version/);
  assert.match(script, /--name",\n      "live"/);
  assert.match(script, /releases\/\$\{id\}\/web/);
  assert.match(script, /cloudfront",\n    "create-invalidation"/);
  assert.match(script, /\/v1\/admin\/imports\/dry-run/);
  assert.match(script, /\/v1\/admin\/imports\/commit/);
  assert.match(script, /previousAliasVersion/);
});

test("Task 23.6 rollback restores recorded API and web state, requires a validated catalog, and never edits immutable attempts or snapshots", async () => {
  const script = await source("scripts/release-automation.mjs");

  assert.match(script, /Rollback requires explicit --confirm-rollback/);
  assert.match(script, /readManifest\(bucket, region, options\.releaseId\)/);
  assert.match(
    script,
    /ensureLiveAlias\([\s\S]*?manifest\.lambda\.previousAliasVersion/,
  );
  assert.match(
    script,
    /restoreWebAssets\(bucket, region, manifest\.web\.previousVersions\)/,
  );
  assert.match(
    script,
    /Catalog rollback is a new validated revision; immutable Attempts and snapshots are never edited/,
  );
  assert.doesNotMatch(
    script,
    /DELETE\s+FROM\s+(attempts|attempt_items|practice_session_questions)/i,
  );
  assert.doesNotMatch(
    script,
    /UPDATE\s+(attempts|attempt_items|practice_session_questions)/i,
  );
});

test("Task 23.6 CLI fails closed before AWS calls when destructive rollback confirmation or required release inputs are absent", () => {
  const missingStage = spawnSync(
    "node",
    ["scripts/release-automation.mjs", "release", "--catalog-file", "catalog.json"],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(missingStage.status, 0);
  assert.match(
    `${missingStage.stdout}${missingStage.stderr}`,
    /--stage must be dev or prod/,
  );

  const missingConfirmation = spawnSync(
    "node",
    [
      "scripts/release-automation.mjs",
      "rollback",
      "--stage",
      "dev",
      "--release-id",
      "release-123",
      "--catalog-file",
      "catalog.json",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(missingConfirmation.status, 0);
  assert.match(
    `${missingConfirmation.stdout}${missingConfirmation.stderr}`,
    /--confirm-rollback/,
  );
});

test("Task 23.6 is restricted to protected, serialized manual deployments", async () => {
  const workflow = await source(".github/workflows/release.yml");

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /environment: release-\$\{\{ inputs\.stage \}\}/);
  assert.match(
    workflow,
    /concurrency:[\s\S]*?certquiz-\$\{\{ inputs\.stage \}\}-release[\s\S]*?cancel-in-progress: false/,
  );
  assert.match(workflow, /configure-aws-credentials@v4/);
  assert.match(workflow, /pnpm ci:db-adapter/);
  assert.match(workflow, /pnpm release:apply/);
  assert.match(workflow, /pnpm release:rollback/);
  assert.match(workflow, /CERTQUIZ_RELEASE_ADMIN_TOKEN/);
});
