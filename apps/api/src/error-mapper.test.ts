import { errorEnvelopeSchema, requestIdSchema } from "@cert-quiz/contracts";
import { domainFailure } from "@cert-quiz/domain";
import { describe, expect, it } from "vitest";

import { mapError } from "./error-mapper.js";

describe("safe HTTP error mapper", () => {
  it("maps domain failures through the shared envelope without unsafe fields", () => {
    const requestId = requestIdSchema.parse("api:test-request");
    const mapped = mapError(
      domainFailure("stale-version", [
        { path: ["expectedVersion"], reason: "Version is stale.", actual: 2 },
      ]),
      requestId,
    );

    expect(mapped.status).toBe(409);
    expect(errorEnvelopeSchema.parse(mapped.body)).toEqual({
      error: {
        code: "stale-version",
        message: "The resource changed. Refresh and retry.",
        requestId,
        retryable: false,
        details: [
          { path: ["expectedVersion"], reason: "Version is stale.", actual: 2 },
        ],
      },
    });
  });

  it("redacts unexpected errors into a retryable safe envelope", () => {
    const mapped = mapError(new Error("database password=secret"), "api:unexpected");

    expect(mapped.status).toBe(500);
    expect(mapped.body.error).not.toHaveProperty("stack");
    expect(JSON.stringify(mapped.body)).not.toContain("secret");
  });
});
