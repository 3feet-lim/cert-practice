import { describe, expect, it, vi } from "vitest";

import { initializeDsqlRuntime } from "./dsql-runtime.js";

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
