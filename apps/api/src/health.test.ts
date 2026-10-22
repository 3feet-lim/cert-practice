import { healthSuccessEnvelopeSchema } from "@cert-forge/contracts";
import { describe, expect, it } from "vitest";

import { app } from "./app.js";

describe("GET /v1/health", () => {
  it("returns the strict shared health success envelope", async () => {
    const response = await app.request("http://localhost/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body: unknown = await response.json();
    expect(healthSuccessEnvelopeSchema.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      data: {
        status: "ok",
        service: "cert-forge-api",
        contractVersion: "v1",
      },
      meta: { requestId: response.headers.get("x-request-id") },
    });
  });
});
