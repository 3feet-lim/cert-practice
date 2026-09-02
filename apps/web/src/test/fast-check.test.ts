import fc from "fast-check";
import { describe, expect, it } from "vitest";

describe("fast-check test harness", () => {
  it("runs deterministic properties for the configured 200 cases", () => {
    fc.assert(
      fc.property(fc.array(fc.integer()), (values) => {
        expect([...values].reverse().reverse()).toEqual(values);
      }),
      { numRuns: 200, seed: 20250308 },
    );
  });
});
