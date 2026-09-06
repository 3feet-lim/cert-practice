import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const spikeFiles = [
  "packages/db/src/spike/adapter-selection.ts",
  "packages/db/src/spike/cli.ts",
  "packages/db/src/spike/local-model-executor.ts",
  "packages/db/src/spike/migrations.ts",
  "packages/db/src/spike/probes.ts",
  "packages/db/src/spike/report.ts",
  "packages/db/src/spike/types.ts",
];
const forbiddenLocalOnlyCode =
  /^\s*import\s+.*(?:@aws-sdk|aws-sdk|["'](?:pg|postgres|net|tls|node:net|node:tls|node:child_process)["'])|\bfetch\s*\(|\bexec(?:File)?\s*\(|terraform/m;

test("local DSQL spike cannot import cloud, driver, network, or provisioning code", async () => {
  for (const relativePath of spikeFiles) {
    const source = await readFile(`${workspaceRoot}/${relativePath}`, "utf8");
    assert.equal(
      forbiddenLocalOnlyCode.test(source),
      false,
      `${relativePath} must remain a local-only preflight module`,
    );
  }
});
