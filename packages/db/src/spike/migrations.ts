import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { MigrationEntry } from "./types.js";

const migrationPath = "packages/db/src/spike/sql/0001-compatibility-schema.sql";
const migrationSourcePath = resolve(
  process.cwd(),
  "src/spike/sql/0001-compatibility-schema.sql",
);

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function validateMigrationManifest(entries: readonly MigrationEntry[]): void {
  const versions = new Set<string>();
  const checksums = new Set<string>();

  for (const entry of entries) {
    if (!/^\d{4}$/.test(entry.version)) {
      throw new Error(`Migration version must use four digits: ${entry.version}`);
    }
    if (versions.has(entry.version)) {
      throw new Error(`Duplicate migration version: ${entry.version}`);
    }
    if (checksums.has(entry.sha256)) {
      throw new Error(`Duplicate migration checksum: ${entry.sha256}`);
    }
    versions.add(entry.version);
    checksums.add(entry.sha256);
  }
}

/** Reads a source-controlled candidate DDL file; it never opens a database connection. */
export async function loadMigrationManifest(): Promise<MigrationEntry[]> {
  const sql = await readFile(migrationSourcePath, "utf8");
  const entries: MigrationEntry[] = [
    {
      version: "0001",
      path: migrationPath,
      sha256: sha256(sql),
      status: "pass",
    },
  ];

  validateMigrationManifest(entries);
  return entries;
}
