import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  exportUiPreview,
  staticPreviewManifest,
} from "../../scripts/export-ui-preview.mjs";

test("static preview export emits deterministic, self-contained S1-S10 documents", async () => {
  const outputRoot = await mkdtemp(path.join(os.tmpdir(), "certquiz-ui-preview-"));
  try {
    const result = await exportUiPreview(outputRoot);
    assert.equal(result.documentCount, staticPreviewManifest.length + 1);
    assert.equal(staticPreviewManifest.length, 43);

    const gallery = await readFile(path.join(outputRoot, "index.html"), "utf8");
    for (const entry of staticPreviewManifest) {
      const document = await readFile(path.join(outputRoot, entry.outputPath), "utf8");
      assert.match(gallery, new RegExp(`href="${entry.outputPath}"`));
      assert.match(document, new RegExp(`data-static-fixture="${entry.fixtureKey}"`));
      assert.match(document, /href="\.\.\/\.\.\/index\.html"/);
      assert.doesNotMatch(
        document,
        /<(?:script|iframe|form)\b|\b(?:fetch|XMLHttpRequest|WebSocket)\s*\(/i,
      );
      assert.doesNotMatch(document, /\b(?:src|href)=["'](?:https?:|\/\/|\/|data:)/i);
    }
  } finally {
    await rm(outputRoot, { recursive: true, force: true });
  }
});
