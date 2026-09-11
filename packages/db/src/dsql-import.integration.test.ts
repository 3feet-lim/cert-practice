import { randomUUID } from "node:crypto";

import {
  CryptoRandomSource,
  ImportService,
  type ImportCommitCommand,
  type UuidFactory,
} from "@cert-quiz/domain";
import type { QueryResultRow } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDisposableDsqlSchema } from "./dsql-disposable-schema.js";
import { DsqlPoolLifecycle, type DsqlPool } from "./dsql-pool.js";
import { DsqlUnitOfWork, type SqlClient, type SqlPool } from "./dsql-unit-of-work.js";
import { DsqlMigrationRunner } from "./migrate.js";
import { loadApplicationMigrations } from "./migrations.js";

const enabled = process.env.RUN_DSQL_IMPORT_INTEGRATION === "true";
const describeLive = enabled ? describe : describe.skip;
const initialNow = new Date("2026-03-20T00:00:00.000Z");
const ADMIN_A = "00000000-0000-4000-8000-0000000000a1";
const ADMIN_B = "00000000-0000-4000-8000-0000000000b1";

/**
 * Opt-in integration coverage for the full ImportService -> DsqlUnitOfWork path.
 * Each test owns a disposable schema and never contacts DSQL unless explicitly enabled.
 */
describeLive("production DSQL import integration suite", () => {
  let harness: LiveHarness;
  let clock: { now: Date };
  let service: ImportService;

  beforeEach(async () => {
    harness = await createLiveHarness();
    clock = { now: new Date(initialNow) };
    service = new ImportService({
      ids: randomUuidFactory,
      random: new CryptoRandomSource(),
      now: () => new Date(clock.now),
    });
  }, 60_000);

  afterEach(async () => {
    await harness?.cleanup();
  }, 60_000);

  it("commits a canonical-number equivalent document with the validation created for its alternate JSON spelling", async () => {
    const original = document({ totalQuestionsLiteral: "2" });
    const equivalent = document({ totalQuestionsLiteral: "2.0" });
    const prepared = await prepare(original, ADMIN_A);
    const alternate = await service.materializeCommit(equivalent, ADMIN_A);

    expect(alternate.contentHash).toBe(prepared.command.contentHash);
    await commit({ ...prepared.command, ...alternate });

    expect(await activeHead()).toBe(alternate.materialization.revision.id);
    expect(await validationStatus(prepared.command.validationId)).toBe("consumed");
  }, 60_000);

  it("rejects an otherwise valid document whose Domain array order changed after validation", async () => {
    const prepared = await prepare(document(), ADMIN_A);
    const reordered = await service.materializeCommit(document({ reverseDomains: true }), ADMIN_A);
    const command = { ...prepared.command, ...reordered };

    expect(reordered.contentHash).not.toBe(prepared.command.contentHash);
    await expect(commit(command)).rejects.toThrow("Import validation is not consumable");

    expect(await validationStatus(prepared.command.validationId)).toBe("validated");
    await expectRevisionAbsent(reordered.materialization.revision.id);
  }, 60_000);

  it("rejects the commit exactly at the fifteen-minute expiry boundary", async () => {
    const prepared = await prepare(document(), ADMIN_A);
    clock.now = new Date(prepared.expiresAt);
    const expired = await service.materializeCommit(document(), ADMIN_A);
    const command = { ...prepared.command, ...expired, now: new Date(clock.now) };

    await expect(commit(command)).rejects.toThrow("Import validation is not consumable");

    expect(await validationStatus(prepared.command.validationId)).toBe("validated");
    await expectRevisionAbsent(expired.materialization.revision.id);
  }, 60_000);

  it("rejects a matching document materialized by a different admin", async () => {
    const prepared = await prepare(document(), ADMIN_A);
    const otherActor = await service.materializeCommit(document(), ADMIN_B);
    const command = {
      ...prepared.command,
      ...otherActor,
      actorUserId: ADMIN_B,
    };

    await expect(commit(command)).rejects.toThrow("Import validation is not consumable");

    expect(await validationStatus(prepared.command.validationId)).toBe("validated");
    await expectRevisionAbsent(otherActor.materialization.revision.id);
  }, 60_000);

  it("consumes one validation exactly once and leaves a replay without a second revision", async () => {
    const prepared = await prepare(document(), ADMIN_A);

    await expect(commit(prepared.command)).resolves.toBeUndefined();
    await expect(commit(prepared.command)).rejects.toThrow("Import validation is not consumable");

    expect(await validationStatus(prepared.command.validationId)).toBe("consumed");
    expect(
      await count("catalog_revisions", "id = $1", [prepared.command.materialization.revision.id]),
    ).toBe(1);
    expect(await activeHead()).toBe(prepared.command.materialization.revision.id);
  }, 60_000);

  it.each([
    "INSERT INTO catalog_revisions",
    "UPDATE catalog_heads SET active_revision_id",
    "UPDATE import_validations SET status = 'consumed'",
  ])("rolls back the revision, head, and validation when %s fails", async (stage) => {
    await commit((await prepare(document({ name: "Baseline" }), ADMIN_A)).command);
    const baselineHead = await activeHead();
    const prepared = await prepare(document({ name: `Fault after ${stage}` }), ADMIN_A);
    harness.hooks.failAfter(stage);

    await expect(commit(prepared.command)).rejects.toThrow("Injected post-write fault");

    expect(await activeHead()).toBe(baselineHead);
    expect(await validationStatus(prepared.command.validationId)).toBe("validated");
    await expectRevisionAbsent(prepared.command.materialization.revision.id);
  }, 60_000);

  async function prepare(content: string, actorUserId: string): Promise<PreparedImport> {
    const dryRun = await service.dryRun(content, actorUserId);
    if (!dryRun.materialization?.validation || !dryRun.response.commitToken)
      throw new Error("Live import fixture must pass dry-run validation.");
    await harness.unitOfWork.transaction((repos) =>
      repos.catalog.saveValidation(dryRun.materialization!.validation!),
    );
    const materialized = await service.materializeCommit(content, actorUserId);
    return {
      command: {
        validationId: dryRun.materialization.validation.id,
        actorUserId,
        tokenDigest: dryRun.materialization.validation.tokenDigest,
        contentHash: materialized.contentHash,
        materialization: materialized.materialization,
        now: new Date(clock.now),
      },
      expiresAt: dryRun.materialization.validation.expiresAt,
    };
  }

  async function commit(command: ImportCommitCommand): Promise<void> {
    await harness.unitOfWork.transaction((repos) => repos.catalog.commitValidatedImport(command));
  }

  async function activeHead(): Promise<string | null> {
    const result = await harness.database.query<{ active_revision_id: string }>(
      "SELECT active_revision_id FROM catalog_heads WHERE certification_key = 'CERT-IMPORT'",
    );
    return result.rows[0]?.active_revision_id ?? null;
  }

  async function validationStatus(validationId: string): Promise<string | null> {
    const result = await harness.database.query<{ status: string }>(
      "SELECT status FROM import_validations WHERE id = $1",
      [validationId],
    );
    return result.rows[0]?.status ?? null;
  }

  async function count(
    table: string,
    predicate: string,
    values: readonly unknown[] = [],
  ): Promise<number> {
    const result = await harness.database.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM ${table} WHERE ${predicate}`,
      values,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async function expectRevisionAbsent(revisionId: string): Promise<void> {
    await expect(
      Promise.all([
        count("catalog_revisions", "id = $1", [revisionId]),
        count("providers", "revision_id = $1", [revisionId]),
        count("certifications", "revision_id = $1", [revisionId]),
        count("domains", "revision_id = $1", [revisionId]),
        count("questions", "revision_id = $1", [revisionId]),
        count("choices", "revision_id = $1", [revisionId]),
      ]),
    ).resolves.toEqual([0, 0, 0, 0, 0, 0]);
  }
});

type PreparedImport = {
  command: ImportCommitCommand;
  expiresAt: Date;
};

type DocumentOptions = {
  name?: string;
  reverseDomains?: boolean;
  totalQuestionsLiteral?: "2" | "2.0";
};

function document({
  name = "Certification",
  reverseDomains = false,
  totalQuestionsLiteral = "2",
}: DocumentOptions = {}): string {
  const domains = reverseDomains
    ? '[{"id":"right","name":"Right","weightPercent":"50"},{"id":"left","name":"Left","weightPercent":"50"}]'
    : '[{"id":"left","name":"Left","weightPercent":"50"},{"id":"right","name":"Right","weightPercent":"50"}]';
  return `{"provider":{"id":"provider","name":"Provider"},"certification":{"id":"cert","code":"CERT-IMPORT","name":${JSON.stringify(name)},"totalQuestions":${totalQuestionsLiteral},"timeLimitMinutes":10,"passThreshold":"75","scoringMode":"all_or_nothing","domains":${domains},"questions":[{"id":"left-question","domainId":"left","stemEn":"Left stem","explanationEn":"Left explanation","requiredChoiceCount":1,"correctChoiceIds":["a"],"choices":[{"id":"a","textEn":"A"},{"id":"b","textEn":"B"}]},{"id":"right-question","domainId":"right","stemEn":"Right stem","explanationEn":"Right explanation","requiredChoiceCount":1,"correctChoiceIds":["c"],"choices":[{"id":"c","textEn":"C"},{"id":"d","textEn":"D"}]}]}}`;
}

type QueryHooks = {
  after(text: string): Promise<void>;
  failAfter(fragment: string): void;
};

class TestQueryHooks implements QueryHooks {
  #failureFragment: string | undefined;

  failAfter(fragment: string): void {
    this.#failureFragment = fragment;
  }

  async after(text: string): Promise<void> {
    if (this.#failureFragment && text.includes(this.#failureFragment)) {
      const fragment = this.#failureFragment;
      this.#failureFragment = undefined;
      throw new Error(`Injected post-write fault after ${fragment}`);
    }
  }
}

type LiveHarness = {
  unitOfWork: DsqlUnitOfWork;
  database: SchemaScopedDatabase;
  hooks: TestQueryHooks;
  cleanup(): Promise<void>;
};

async function createLiveHarness(): Promise<LiveHarness> {
  const endpoint = requiredEnvironment("DSQL_ENDPOINT");
  const region = process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION;
  if (!region)
    throw new Error(
      "RUN_DSQL_IMPORT_INTEGRATION=true requires AWS_REGION or AWS_DEFAULT_REGION.",
    );

  const schema = `import_integration_${randomUUID().replaceAll("-", "")}`;
  const lifecycle = new DsqlPoolLifecycle({
    endpoint,
    region,
    database: process.env.DSQL_DATABASE,
    user: process.env.DSQL_USER,
    caPath: process.env.PGSSLROOTCERT,
  });
  const pool = await lifecycle.pool();
  let disposableSchema: Awaited<ReturnType<typeof createDisposableDsqlSchema>> | undefined;
  try {
    disposableSchema = await createDisposableDsqlSchema(pool, schema);
    const hooks = new TestQueryHooks();
    const scopedPool = new SchemaScopedPool(pool, disposableSchema.name, hooks);
    const database = new SchemaScopedDatabase(scopedPool);
    await new DsqlMigrationRunner(database).migrate(await loadApplicationMigrations());
    return {
      unitOfWork: new DsqlUnitOfWork(scopedPool, { maxOccRetries: 2, retryDelayMs: 10 }),
      database,
      hooks,
      cleanup: async () => {
        try {
          await disposableSchema?.cleanup();
        } finally {
          await lifecycle.close();
        }
      },
    };
  } catch (error) {
    try {
      await disposableSchema?.cleanup();
    } finally {
      await lifecycle.close();
    }
    throw error;
  }
}

class SchemaScopedPool implements SqlPool {
  constructor(
    private readonly pool: DsqlPool,
    private readonly schema: string,
    private readonly hooks: QueryHooks,
  ) {}

  async connect(): Promise<SqlClient> {
    const client = await this.pool.connect();
    try {
      await client.query(`SET search_path TO ${quoteIdentifier(this.schema)}`);
      return {
        query: async (text: string, values?: readonly unknown[]) => {
          const result = await client.query(text, values);
          await this.hooks.after(text);
          return result;
        },
        release: () => client.release(),
      } as SqlClient;
    } catch (error) {
      client.release();
      throw error;
    }
  }
}

class SchemaScopedDatabase {
  constructor(private readonly pool: SchemaScopedPool) {}

  async query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Row[]; rowCount: number | null }> {
    const client = await this.pool.connect();
    try {
      return await client.query<Row>(text, values);
    } finally {
      client.release();
    }
  }
}

const randomUuidFactory: UuidFactory = { next: () => randomUUID() };

function quoteIdentifier(identifier: string): string {
  if (!/^[a-z_][a-z0-9_]*$/u.test(identifier))
    throw new Error("Invalid disposable DSQL schema identifier.");
  return `\"${identifier}\"`;
}

function requiredEnvironment(key: string): string {
  const value = process.env[key];
  if (!value)
    throw new Error(
      `RUN_DSQL_IMPORT_INTEGRATION=true requires ${key}; provide a reachable Aurora DSQL endpoint.`,
    );
  return value;
}
