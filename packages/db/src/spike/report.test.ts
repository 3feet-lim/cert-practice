import { describe, expect, it } from "vitest";

import { selectAdapter } from "./adapter-selection.js";
import { canonicalJson, createLocalSpikeReport, renderAdrDraft } from "./report.js";

describe("local DSQL spike report", () => {
  it("keeps all target-engine gates unmeasured and the decision unselected", async () => {
    const report = await createLocalSpikeReport({
      executedAt: "2026-09-06T00:00:00.000Z",
    });

    expect(report.run).toMatchObject({
      mode: "local",
      dryRun: true,
      networkAttempted: false,
      credentialAccessAttempted: false,
    });
    expect(report.decision.adapter).toBe("unselected");
    expect(report.gates.overall).toBe("inconclusive");
    expect(renderAdrDraft(report)).toContain("**Status:** pending");
  });

  it("canonicalizes object keys and requires complete live evidence for DSQL", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(
      selectAdapter({
        run: { mode: "live", networkAttempted: true },
        gates: {
          migrationRepeatability: "pass",
          connectorLifecycle: "pass",
          sqlCapabilities: "pass",
          queryPlans: "pass",
          p95Latency: "pass",
          atomicity: "pass",
          overall: "pass",
        },
      }),
    ).toMatchObject({ adapter: "dsql" });
  });
});
