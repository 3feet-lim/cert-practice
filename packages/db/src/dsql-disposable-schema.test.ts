import { describe, expect, it } from "vitest";

import {
  createDisposableDsqlSchema,
  type DsqlSchemaPool,
} from "./dsql-disposable-schema.js";

function occAbort(): Error & { code: string } {
  return Object.assign(new Error("transaction aborted"), { code: "OC000" });
}

describe("disposable DSQL schema lifecycle", () => {
  it("retries OC000 during creation and cleanup, then makes cleanup idempotent", async () => {
    const calls: string[] = [];
    let createAttempts = 0;
    let dropAttempts = 0;
    const pool: DsqlSchemaPool = {
      query: async (text) => {
        calls.push(text);
        if (text.startsWith("CREATE")) {
          createAttempts += 1;
          if (createAttempts === 1) throw occAbort();
        }
        if (text.startsWith("DROP")) {
          dropAttempts += 1;
          if (dropAttempts === 1) throw occAbort();
        }
        return { rows: [], rowCount: 0 };
      },
    };
    const sleeps: number[] = [];

    const schema = await createDisposableDsqlSchema(pool, "test_schema", {
      retry: {
        maxAttempts: 2,
        retryDelayMs: 0,
        sleep: async (milliseconds) => {
          sleeps.push(milliseconds);
        },
      },
    });
    await schema.cleanup();
    await schema.cleanup();

    expect(schema.name).toBe("test_schema");
    expect(calls).toEqual([
      'CREATE SCHEMA "test_schema"',
      'CREATE SCHEMA "test_schema"',
      'DROP SCHEMA IF EXISTS "test_schema" CASCADE',
      'DROP SCHEMA IF EXISTS "test_schema" CASCADE',
    ]);
    expect(sleeps).toEqual([0, 0]);
  });

  it("attempts bounded cleanup when creation fails after an ambiguous schema operation", async () => {
    const original = new Error("create failed");
    const calls: string[] = [];
    let dropAttempts = 0;
    const pool: DsqlSchemaPool = {
      query: async (text) => {
        calls.push(text);
        if (text.startsWith("CREATE")) throw original;
        dropAttempts += 1;
        if (dropAttempts === 1) throw occAbort();
        return { rows: [], rowCount: 0 };
      },
    };

    await expect(
      createDisposableDsqlSchema(pool, "failed_schema", {
        retry: { maxAttempts: 2, retryDelayMs: 0, sleep: async () => undefined },
      }),
    ).rejects.toBe(original);
    expect(calls).toEqual([
      'CREATE SCHEMA "failed_schema"',
      'DROP SCHEMA IF EXISTS "failed_schema" CASCADE',
      'DROP SCHEMA IF EXISTS "failed_schema" CASCADE',
    ]);
  });
});
