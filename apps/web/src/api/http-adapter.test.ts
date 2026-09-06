import { describe, expect, it, vi } from "vitest";

import { createHttpCertQuizApi } from "./http-adapter";

const healthEnvelope = {
  data: {
    status: "ok" as const,
    service: "cert-quiz-api" as const,
    contractVersion: "v1" as const,
  },
  meta: { requestId: "api:health" },
};

describe("createHttpCertQuizApi", () => {
  it("unwraps the strict shared health envelope", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(healthEnvelope), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    const api = createHttpCertQuizApi({
      baseUrl: "https://api.example.test/base-path",
      fetch,
    });

    await expect(api.getHealth()).resolves.toEqual({
      ok: true,
      data: healthEnvelope.data,
      meta: healthEnvelope.meta,
    });
    expect(fetch).toHaveBeenCalledWith("https://api.example.test/v1/health", {
      headers: { accept: "application/json" },
    });
  });

  it("rejects malformed strict health responses as a safe adapter failure", async () => {
    const api = createHttpCertQuizApi({
      baseUrl: "https://api.example.test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            ...healthEnvelope,
            data: { ...healthEnvelope.data, implementation: "hono" },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    });

    await expect(api.getHealth()).resolves.toEqual({
      ok: false,
      error: {
        code: "internal-error",
        message: "The CertQuiz health response failed shared schema validation.",
        requestId: "http:health:invalid-contract",
        retryable: false,
      },
    });
  });

  it("converts a network failure into a retryable provider result", async () => {
    const api = createHttpCertQuizApi({
      baseUrl: "https://api.example.test",
      fetch: async () => Promise.reject(new Error("offline")),
    });

    await expect(api.getHealth()).resolves.toEqual({
      ok: false,
      error: {
        code: "dependency-unavailable",
        message: "The CertQuiz health service is unavailable.",
        requestId: "http:health:network",
        retryable: true,
      },
    });
  });
});
