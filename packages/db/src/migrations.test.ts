import { describe, expect, it } from "vitest";

import {
  assertApplicationSchema,
  loadApplicationMigrations,
  schemaVersionRange,
} from "./migrations.js";
import { normalizeDsqlMigrationStatement } from "./migrate.js";

describe("production migration manifest", () => {
  it("is deterministic, versioned, and separate from the disposable spike", async () => {
    const first = await loadApplicationMigrations();
    const second = await loadApplicationMigrations();
    expect(first).toEqual(second);
    expect(first.map((migration) => migration.filename)).toEqual([
      "0001_identity_catalog_import.sql",
      "0002_practice.sql",
      "0003_exams.sql",
      "0004_snapshot_scope_and_result_payload.sql",
    ]);
    expect(first.every((migration) => !migration.path.includes("/spike/"))).toBe(true);
    expect(schemaVersionRange(first)).toEqual({ minimum: 1, maximum: 4 });
  });

  it("translates synchronous index DDL and removes unsupported DSQL key ordering", () => {
    expect(normalizeDsqlMigrationStatement("CREATE INDEX example ON records (id)")).toBe(
      "CREATE INDEX ASYNC example ON records (id)",
    );
    expect(
      normalizeDsqlMigrationStatement(
        "CREATE UNIQUE INDEX ASYNC ready ON records (user_id, submitted_at DESC, id ASC)",
      ),
    ).toBe("CREATE UNIQUE INDEX ASYNC ready ON records (user_id, submitted_at, id)");
    expect(normalizeDsqlMigrationStatement("CREATE TABLE records (id uuid PRIMARY KEY)")).toBe(
      "CREATE TABLE records (id uuid PRIMARY KEY)",
    );
  });

  it("fails closed for missing, altered, and unknown database migration state", async () => {
    const manifest = await loadApplicationMigrations();
    await expect(
      assertApplicationSchema(
        {
          listAppliedMigrations: async () =>
            manifest.map(({ version, sha256 }) => ({ version, sha256 })),
        },
        manifest,
      ),
    ).resolves.toEqual({ minimum: 1, maximum: 4 });
    await expect(
      assertApplicationSchema({ listAppliedMigrations: async () => [] }, manifest),
    ).rejects.toThrow("missing migration");
    await expect(
      assertApplicationSchema(
        {
          listAppliedMigrations: async () => [
            { version: 1, sha256: "0".repeat(64) },
            ...manifest.slice(1).map(({ version, sha256 }) => ({ version, sha256 })),
          ],
        },
        manifest,
      ),
    ).rejects.toThrow("Checksum mismatch");
    await expect(
      assertApplicationSchema(
        {
          listAppliedMigrations: async () => [
            ...manifest.map(({ version, sha256 }) => ({ version, sha256 })),
            { version: 99, sha256: "a".repeat(64) },
          ],
        },
        manifest,
      ),
    ).rejects.toThrow("unknown migration");
  });
});
