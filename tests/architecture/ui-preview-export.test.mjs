import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, test } from "node:test";

import {
  exportUiPreview,
  previewSections,
} from "../../scripts/export-ui-preview.mjs";

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "cert-quiz-ui-preview-"));
const firstOutput = path.join(temporaryRoot, "first");
const secondOutput = path.join(temporaryRoot, "second");

const firstResult = await exportUiPreview(firstOutput);
const secondResult = await exportUiPreview(secondOutput);
const firstHtml = await readFile(firstResult.outputPath, "utf8");
const secondHtml = await readFile(secondResult.outputPath, "utf8");

after(async () => {
  await rm(temporaryRoot, { recursive: true, force: true });
});

test("exports exactly one standalone HTML document", async () => {
  assert.equal((await stat(firstResult.outputPath)).isFile(), true);
  assert.deepEqual(await readdir(firstOutput), ["index.html"]);
  assert.equal(firstResult.documentCount, 1);
  assert.equal(firstResult.assetCount, 0);
  assert.equal(firstResult.byteSize, Buffer.byteLength(firstHtml));
  assert.match(firstHtml, /^<!doctype html>/i);
  assert.match(firstHtml, /<style>[\s\S]+<\/style>/i);
  assert.match(firstHtml, /<\/body>\s*<\/html>\s*$/i);
});

test("contains the S1-S10 gallery and admin pending-user section", () => {
  assert.match(firstHtml, /id="gallery"/);

  for (const [id, code, title] of previewSections) {
    assert.match(firstHtml, new RegExp(`id="${id}"`));
    assert.match(firstHtml, new RegExp(`>${code}<|${code} ·`));
    assert.ok(firstHtml.includes(title), `${title} must be rendered`);
  }

  for (const requiredState of [
    "SUCCESS",
    "LOADING",
    "EMPTY",
    "ERROR",
    "UNSUBMITTED",
    "SUBMITTED",
    "ACTIVE",
    "PREVIEW DIALOG",
    "EXPIRED",
    "PENDING",
    "VALIDATING",
    "VALID",
    "INVALID",
    "COMMIT DIALOG",
    "COMPLETE",
  ]) {
    assert.ok(firstHtml.includes(requiredState), `${requiredState} must be rendered`);
  }

  assert.match(firstHtml, /승인 대기 사용자/);
  assert.match(firstHtml, /pending\.one@example\.test/);
});

test("has no asset, network, module, or server runtime dependency", () => {
  assert.doesNotMatch(firstHtml, /<link\b/i);
  assert.doesNotMatch(firstHtml, /<script\b/i);
  assert.doesNotMatch(firstHtml, /<img\b|<iframe\b|<object\b|<embed\b/i);
  assert.doesNotMatch(firstHtml, /\s(?:src|srcset|action)\s*=/i);
  assert.doesNotMatch(firstHtml, /@import\b|url\s*\(/i);
  assert.doesNotMatch(firstHtml, /\bhttps?:\/\/|\/\//i);
  assert.doesNotMatch(
    firstHtml,
    /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker)\s*\(/i,
  );
  assert.doesNotMatch(firstHtml, /type\s*=\s*["']module["']/i);
  assert.doesNotMatch(firstHtml, /\b(?:MSW|backend endpoint|API endpoint)\b/i);

  const hrefs = [...firstHtml.matchAll(/\shref="([^"]+)"/gi)].map(
    ([, href]) => href,
  );
  assert.ok(hrefs.length > previewSections.length);
  assert.ok(hrefs.every((href) => /^#[a-z0-9-]+$/i.test(href)));
});

test("uses unique fragment targets and complete semantic landmarks", () => {
  const ids = [...firstHtml.matchAll(/\sid="([^"]+)"/gi)].map(([, id]) => id);
  assert.equal(new Set(ids).size, ids.length, "fragment targets must be unique");

  for (const [, href] of firstHtml.matchAll(/\shref="#([^"]+)"/gi)) {
    assert.ok(ids.includes(href), `#${href} must resolve inside index.html`);
  }

  assert.match(firstHtml, /<header\b/i);
  assert.match(firstHtml, /<nav\b[^>]*aria-label=/i);
  assert.match(firstHtml, /<main\b/i);
  assert.match(firstHtml, /<footer\b/i);
  assert.match(firstHtml, /role="dialog"[^>]*aria-modal="false"/i);
  assert.match(firstHtml, /<table>[\s\S]*?<caption>/i);
  assert.match(firstHtml, /차트 대체 데이터 표/);
});

test("regenerates byte-identically from the same source and fixture", () => {
  assert.equal(firstHtml, secondHtml);
  assert.equal(firstResult.byteSize, secondResult.byteSize);
});
