import { describe, expect, it, vi } from "vitest";

import { initializeDsqlRuntime } from "./dsql-runtime.js";

const fakePool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
const poolLifecycle = { pool: vi.fn().mockResolvedValue(fakePool), close: vi.fn() };
const migrateMock = vi.fn().mockResolvedValue(undefined);
const provisionApplicationDatabaseRoleMock = vi.fn().mockResolvedValue(undefined);
const assertApplicationSchemaMock = vi.fn().mockResolvedValue({ minimum: 1, maximum: 4 });
const loadApplicationMigrationsMock = vi.fn().mockResolvedValue([]);

vi.mock("./dsql-pool.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./dsql-pool.js")>();
  return {
    ...actual,
    DsqlPoolLifecycle: vi.fn().mockImplementation(function DsqlPoolLifecycle() {
      return poolLifecycle;
    }),
  };
});

vi.mock("./migrate.js", () => ({
  DsqlMigrationRunner: vi.fn().mockImplementation(function DsqlMigrationRunner() {
    return { migrate: migrateMock };
  }),
  provisionApplicationDatabaseRole: provisionApplicationDatabaseRoleMock,
}));

vi.mock("./migrations.js", () => ({
  assertApplicationSchema: assertApplicationSchemaMock,
  loadApplicationMigrations: loadApplicationMigrationsMock,
}));

describe("request-safe DSQL runtime", () => {
  it("opens and probes the pool without loading or executing migrations", async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [{ ready: 1 }], rowCount: 1 }),
      connect: vi.fn(),
    };
    const lifecycle = {
      pool: vi.fn().mockResolvedValue(pool),
      close: vi.fn().mockResolvedValue(undefined),
    };

    const runtime = await initializeDsqlRuntime(
      { pool: { endpoint: "cluster.dsql.ap-northeast-2.on.aws", region: "ap-northeast-2" } },
      { createPoolLifecycle: () => lifecycle },
    );

    expect(pool.query).toHaveBeenCalledExactlyOnceWith("SELECT 1");
    expect(lifecycle.close).not.toHaveBeenCalled();
    await runtime.close();
    expect(lifecycle.close).toHaveBeenCalledExactlyOnceWith();
  });

  it("closes a failed pool lifecycle before rejecting startup", async () => {
    const queryFailure = new Error("connection rejected");
    const lifecycle = {
      pool: vi.fn().mockResolvedValue({
        query: vi.fn().mockRejectedValue(queryFailure),
        connect: vi.fn(),
      }),
      close: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      initializeDsqlRuntime(
        { pool: { endpoint: "cluster.dsql.ap-northeast-2.on.aws", region: "ap-northeast-2" } },
        { createPoolLifecycle: () => lifecycle },
      ),
    ).rejects.toThrow(queryFailure);
    expect(lifecycle.close).toHaveBeenCalledExactlyOnceWith();
  });
});

describe("deployment-only application schema migration", () => {
  it("skips database role provisioning when no role/ARN is supplied", async () => {
    const { migrateAndVerifyApplicationSchema } = await import("./dsql-runtime.js");
    provisionApplicationDatabaseRoleMock.mockClear();

    const schema = await migrateAndVerifyApplicationSchema({
      endpoint: "cluster.dsql.ap-northeast-2.on.aws",
      region: "ap-northeast-2",
    });

    expect(schema).toEqual({ minimum: 1, maximum: 4 });
    expect(provisionApplicationDatabaseRoleMock).not.toHaveBeenCalled();
    expect(poolLifecycle.close).toHaveBeenCalled();
  });

  it("provisions the database role after migrations when a role/ARN is supplied", async () => {
    const { migrateAndVerifyApplicationSchema } = await import("./dsql-runtime.js");
    provisionApplicationDatabaseRoleMock.mockClear();
    migrateMock.mockClear();

    await migrateAndVerifyApplicationSchema(
      { endpoint: "cluster.dsql.ap-northeast-2.on.aws", region: "ap-northeast-2" },
      { roleName: "app", iamRoleArn: "arn:aws:iam::370489250264:role/lambda-execution" },
    );

    expect(provisionApplicationDatabaseRoleMock).toHaveBeenCalledExactlyOnceWith(fakePool, {
      roleName: "app",
      iamRoleArn: "arn:aws:iam::370489250264:role/lambda-execution",
    });
    expect(migrateMock.mock.invocationCallOrder[0]).toBeLessThan(
      provisionApplicationDatabaseRoleMock.mock.invocationCallOrder[0]!,
    );
  });
});
