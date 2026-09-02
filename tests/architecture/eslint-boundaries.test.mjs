import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const eslint = new ESLint({ cwd: workspaceRoot });
const webFilePath = `${workspaceRoot}/apps/web/src/quality-gate.ts`;

async function restrictedMessages(source, filePath = webFilePath) {
  const [result] = await eslint.lintText(source, { filePath });

  return result.messages.filter(
    ({ ruleId }) =>
      ruleId === "no-restricted-imports" || ruleId === "no-restricted-globals",
  );
}

test("allows shared contracts and the local frontend API port", async () => {
  const messages = await restrictedMessages(`
    import type {} from "@cert-quiz/contracts";
    import type {} from "./api/port";
  `);

  assert.deepEqual(messages, []);
});

for (const [name, source] of [
  ["database rows", 'import type { UserRow } from "@cert-quiz/db/rows";'],
  ["AWS SDK", 'import { S3Client } from "@aws-sdk/client-s3";'],
  ["Hono", 'import { Hono } from "hono";'],
  ["Hono implementation", 'import "../../api/src/app";'],
  ["domain implementation", 'import { score } from "@cert-quiz/domain/scoring";'],
]) {
  test(`rejects web imports of ${name}`, async () => {
    const messages = await restrictedMessages(source);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, "no-restricted-imports");
  });
}

test("rejects direct network calls outside the frontend API layer", async () => {
  const messages = await restrictedMessages('void fetch("/v1/me");');

  assert.equal(messages.length, 1);
  assert.equal(messages[0].ruleId, "no-restricted-globals");
});

test("allows network adapters inside the frontend API layer", async () => {
  const messages = await restrictedMessages(
    'void fetch("/v1/me");',
    `${workspaceRoot}/apps/web/src/api/http-adapter.ts`,
  );

  assert.deepEqual(messages, []);
});
