import { describe, expect, it } from "vitest";

import { createLoginUrl, getSafeReturnUrl } from "./safe-return-url";

describe("safe return URL allowlist", () => {
  it.each([
    ["?returnTo=%2Fapp", "/app"],
    ["?returnTo=%2Fapp%2Fhistory%3Fpage%3D2%23latest", "/app/history?page=2#latest"],
    ["?returnTo=%2Fapp%2Fadmin%2Fimport", "/app/admin/import"],
    ["?returnTo=%2Fapp%2Fleaderboards%2Fcert-1", "/app/leaderboards/cert-1"],
  ])("restores an allowlisted app URL", (search, expected) => {
    expect(getSafeReturnUrl(search)).toBe(expected);
  });

  it.each([
    "?returnTo=https%3A%2F%2Fevil.example%2Fapp",
    "?returnTo=%2F%2Fevil.example%2Fapp",
    "?returnTo=%2Fapp%2F..%2Fadmin",
    "?returnTo=%2Fapp%252Fhistory",
    "?returnTo=%2Funknown",
  ])("falls back for an external or unknown URL", (search) => {
    expect(getSafeReturnUrl(search)).toBe("/app");
  });

  it("creates login URLs only from allowlisted destinations", () => {
    expect(createLoginUrl("https://evil.example/app")).toBe(
      "/login?returnTo=%2Fapp",
    );
  });
});
