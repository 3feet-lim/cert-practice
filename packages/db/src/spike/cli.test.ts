import { describe, expect, it } from "vitest";

import { parseCliOptions, resolveWorkspaceOutput } from "./cli.js";

describe("local DSQL spike CLI", () => {
  it("accepts only local dry-run options", () => {
    expect(parseCliOptions(["--mode=local", "--dry-run"]).mode).toBe("local");
    expect(() => parseCliOptions(["--endpoint", "example"])).toThrow("Unsupported");
  });

  it("rejects output paths outside the workspace", () => {
    expect(resolveWorkspaceOutput("/workspace", "artifacts/report.json")).toBe(
      "/workspace/artifacts/report.json",
    );
    expect(() => resolveWorkspaceOutput("/workspace", "../report.json")).toThrow(
      "inside the workspace",
    );
  });
});
