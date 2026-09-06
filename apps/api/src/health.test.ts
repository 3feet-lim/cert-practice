import { healthSuccessEnvelopeSchema } from "@cert-quiz/contracts";
import { describe, expect, it } from "vitest";

import { app } from "./app.js";

describe("GET /v1/health", () => {
  it("returns the strict shared health success envelope", async () => {
    const response = await app.request("http://localhost/v1/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");

    const body: unknown = await response.json();
    expect(healthSuccessEnvelopeSchema.safeParse(body).success).toBe(true);
    expect(body).toEqual({
      data: {
        status: "ok",
        service: "cert-quiz-api",
        contractVersion: "v1",
      },
      meta: { requestId: "api:health" },
    });
  });
});
