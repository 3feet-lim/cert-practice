import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { ESLint } from "eslint";

const workspaceRoot = fileURLToPath(new URL("../..", import.meta.url));
const eslint = new ESLint({ cwd: workspaceRoot });
const webFilePath = `${workspaceRoot}/apps/web/src/quality-gate.ts`;
const domainFilePath = `${workspaceRoot}/packages/domain/src/quality-gate.ts`;
const dbFilePath = `${workspaceRoot}/packages/db/src/quality-gate.ts`;
const apiFilePath = `${workspaceRoot}/apps/api/src/quality-gate.ts`;

async function restrictedMessages(source, filePath = webFilePath) {
  const [result] = await eslint.lintText(source, { filePath });

  return result.messages.filter(
    ({ ruleId }) =>
      ruleId === "no-restricted-imports" || ruleId === "no-restricted-globals",
  );
}

async function expectsRestrictedImport(name, source, filePath) {
  await test(`rejects ${name}`, async () => {
    const messages = await restrictedMessages(source, filePath);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].ruleId, "no-restricted-imports");
  });
}

test("allows shared contracts and the local frontend API port", async () => {
  const messages = await restrictedMessages(`
    import type {} from "@cert-quiz/contracts";
    import type {} from "./api/port";
  `);

  assert.deepEqual(messages, []);
});

for (const [name, source] of [
  [
    "web imports of database rows",
    'import type { UserRow } from "@cert-quiz/db/rows";',
  ],
  ["web imports of AWS SDK", 'import { S3Client } from "@aws-sdk/client-s3";'],
  ["web imports of Hono", 'import { Hono } from "hono";'],
  ["web imports of Hono implementation", 'import "../../api/src/app";'],
  [
    "web imports of domain implementation",
    'import { score } from "@cert-quiz/domain/scoring";',
  ],
]) {
  await expectsRestrictedImport(name, source, webFilePath);
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

test("allows db to depend on domain", async () => {
  const messages = await restrictedMessages(
    'import type {} from "@cert-quiz/domain";',
    dbFilePath,
  );

  assert.deepEqual(messages, []);
});

for (const [name, source] of [
  ["React in domain", 'import "react";'],
  ["Hono in domain", 'import "hono";'],
  ["AWS SDK in domain", 'import "@aws-sdk/client-s3";'],
  ["SQL driver in domain", 'import "pg";'],
]) {
  await expectsRestrictedImport(name, source, domainFilePath);
}

for (const [name, source] of [
  ["API workspace imports in db", 'import "@cert-quiz/api";'],
  ["web source imports in db", 'import "../../../apps/web/src/main";'],
]) {
  await expectsRestrictedImport(name, source, dbFilePath);
}

test("allows API imports of its declared backend boundaries", async () => {
  const messages = await restrictedMessages(
    `
      import type {} from "@cert-quiz/contracts";
      import type {} from "@cert-quiz/domain";
      import type {} from "@cert-quiz/db";
      import { Hono } from "hono";
    `,
    apiFilePath,
  );

  assert.deepEqual(messages, []);
});

await expectsRestrictedImport(
  "web workspace imports in api",
  'import "@cert-quiz/web";',
  apiFilePath,
);
