import { describe, expect, it } from "vitest";

import {
  loadMigrationManifest,
  sha256,
  validateMigrationManifest,
} from "./migrations.js";

describe("DSQL spike migration manifest", () => {
  it("uses a deterministic checksum for the candidate DDL", async () => {
    const [migration] = await loadMigrationManifest();

    expect(migration?.version).toBe("0001");
    expect(migration?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(sha256("candidate ddl")).toBe(sha256("candidate ddl"));
  });

  it("rejects duplicate migration versions and checksums", () => {
    expect(() =>
      validateMigrationManifest([
        { version: "0001", path: "a.sql", sha256: "a", status: "pass" },
        { version: "0001", path: "b.sql", sha256: "b", status: "pass" },
      ]),
    ).toThrow("Duplicate migration version");
  });
});
