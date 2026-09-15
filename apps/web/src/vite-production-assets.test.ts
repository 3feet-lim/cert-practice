import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { build } from "vite";
import { describe, expect, it } from "vitest";

const viteConfigPath = resolve(process.cwd(), "vite.config.ts");

describe("production SPA asset paths", () => {
  it("emits root-absolute assets that resolve identically from direct app deep links", async () => {
    await build({
      configFile: viteConfigPath,
      logLevel: "silent",
    });
    const html = await readFile(resolve(process.cwd(), "dist", "index.html"), "utf8");
    const assetReferences = [
      ...html.matchAll(/(?:src|href)="((?:\.\/)?\/?assets\/[^"?]+)"/g),
    ].flatMap((match) => (match[1] ? [match[1]] : []));
    const directAppDeepLink = new URL("https://certquiz.example.test/app/admin/users");

    expect(assetReferences).not.toHaveLength(0);
    expect(html).not.toContain("./assets/");
    for (const assetReference of assetReferences) {
      expect(assetReference).toMatch(/^\/assets\//);
      expect(new URL(assetReference, directAppDeepLink).pathname).toBe(
        new URL(assetReference, "https://certquiz.example.test/").pathname,
      );
    }
  });
});
