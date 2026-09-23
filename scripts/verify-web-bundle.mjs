#!/usr/bin/env node
// Fails a deployment build when test, mock, or static-preview code leaks into apps/web/dist.
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "apps/web/dist/assets");
const forbiddenMarkers = [
  "vitest",
  "@testing-library",
  "fast-check",
  "msw",
  "createMockCertQuizApi",
  "createMockAuthController",
  "mockActor",
  "CERT_QUIZ_STATIC_PREVIEW_FIXTURES",
  "StaticPreviewRoutes",
  "블루/그린",
];

const entries = await readdir(assetsDir).catch(() => {
  throw new Error(`${assetsDir} does not exist; build the web app first.`);
});
const failures = [];
for (const name of entries.filter((entry) => entry.endsWith(".js"))) {
  const contents = await readFile(join(assetsDir, name), "utf8");
  for (const marker of forbiddenMarkers) {
    if (contents.includes(marker)) failures.push(`${name}: ${marker}`);
  }
}
if (failures.length > 0) {
  console.error("Production web bundle contains test/mock/preview code:");
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`Web bundle check passed: no test, mock, or preview code in ${assetsDir}.`);
