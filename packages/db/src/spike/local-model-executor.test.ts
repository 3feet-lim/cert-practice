import { describe, expect, it } from "vitest";

import { runLocalConcurrencyModel } from "./local-model-executor.js";

describe("local DSQL concurrency model", () => {
  it("keeps all required invariants when each modeled write fails", () => {
    for (const faultAt of [
      "profile-insert",
      "practice-slot-insert",
      "practice-replace-snapshot",
      "exam-finalize-attempt",
      "import-head-update",
    ] as const) {
      const scenarios = runLocalConcurrencyModel(faultAt);
      expect(scenarios).toHaveLength(5);
      expect(scenarios.every((scenario) => scenario.modelStatus === "pass")).toBe(true);
      expect(scenarios.every((scenario) => scenario.targetStatus === "not_run")).toBe(
        true,
      );
    }
  });
});
