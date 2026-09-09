import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export type ApplicationMigration = {
  version: number;
  filename: string;
  path: string;
  sha256: string;
};

export type AppliedMigration = {
  version: number;
  sha256: string;
};

export type MigrationStateReader = {
  listAppliedMigrations(): Promise<readonly AppliedMigration[]>;
};

export type SchemaVersionRange = {
  minimum: number;
  maximum: number;
};

const migrationFilename = /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/;

/** Production migrations are package assets, never Task 9 spike artifacts. */
export const applicationMigrationDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "migrations",
);

export function migrationChecksum(sql: string): string {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

export async function loadApplicationMigrations(
  directory = applicationMigrationDirectory,
): Promise<readonly ApplicationMigration[]> {
  const filenames = (await readdir(directory)).filter((filename) =>
    migrationFilename.test(filename),
  );
  const migrations = await Promise.all(
    filenames.map(async (filename) => {
      const match = migrationFilename.exec(filename);
      if (!match) throw new Error(`Invalid migration filename: ${filename}`);
      const path = join(directory, filename);
      const sql = await readFile(path, "utf8");
      return {
        version: Number(match[1]),
        filename,
        path,
        sha256: migrationChecksum(sql),
      };
    }),
  );
  return validateApplicationMigrationManifest(migrations);
}

export function validateApplicationMigrationManifest(
  entries: readonly ApplicationMigration[],
): readonly ApplicationMigration[] {
  const ordered = [...entries].sort((left, right) => left.version - right.version);
  if (ordered.length === 0) throw new Error("Application migration manifest is empty.");
  for (const [index, migration] of ordered.entries()) {
    if (!Number.isSafeInteger(migration.version) || migration.version < 1) {
      throw new Error(`Invalid migration version: ${migration.version}`);
    }
    if (!migrationFilename.test(migration.filename)) {
      throw new Error(`Invalid migration filename: ${migration.filename}`);
    }
    if (!/^[a-f0-9]{64}$/.test(migration.sha256)) {
      throw new Error(`Invalid SHA-256 for migration ${migration.filename}`);
    }
    if (index > 0 && migration.version === ordered[index - 1]!.version) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
  }
  return Object.freeze(ordered);
}

export function schemaVersionRange(
  migrations: readonly ApplicationMigration[],
): SchemaVersionRange {
  const manifest = validateApplicationMigrationManifest(migrations);
  return { minimum: manifest[0]!.version, maximum: manifest.at(-1)!.version };
}

/**
 * Fails closed before request handling when the selected database does not
 * exactly match source-controlled migration bytes. A DB-specific adapter only
 * needs to implement the small reader interface; it does not leak into domain.
 */
export async function assertApplicationSchema(
  reader: MigrationStateReader,
  migrations: readonly ApplicationMigration[],
): Promise<SchemaVersionRange> {
  const manifest = validateApplicationMigrationManifest(migrations);
  const applied = await reader.listAppliedMigrations();
  const appliedByVersion = new Map<number, string>();
  for (const migration of applied) {
    if (appliedByVersion.has(migration.version)) {
      throw new Error(`Database contains duplicate migration ${migration.version}.`);
    }
    appliedByVersion.set(migration.version, migration.sha256);
  }
  for (const migration of manifest) {
    const checksum = appliedByVersion.get(migration.version);
    if (checksum === undefined) {
      throw new Error(`Database is missing migration ${migration.filename}.`);
    }
    if (checksum !== migration.sha256) {
      throw new Error(`Checksum mismatch for migration ${migration.filename}.`);
    }
  }
  const knownVersions = new Set(manifest.map((migration) => migration.version));
  for (const version of appliedByVersion.keys()) {
    if (!knownVersions.has(version)) {
      throw new Error(`Database contains unknown migration ${version}.`);
    }
  }
  return schemaVersionRange(manifest);
}
