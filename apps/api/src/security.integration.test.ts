import { errorEnvelopeSchema } from "@cert-quiz/contracts";
import { InMemoryUnitOfWork } from "@cert-quiz/db";
import {
  ImportService,
  SequenceRandomSource,
  SequenceUuidFactory,
} from "@cert-quiz/domain";
import { describe, expect, it } from "vitest";

import { createApp, type CreateAppDependencies } from "./app.js";
import type { VerifiedCognitoClaims } from "./authentication.js";
import { createApiSecurityConfiguration } from "./security.js";
import { createRedactingJsonTelemetry } from "./telemetry.js";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const ADMIN_ID = "00000000-0000-4000-8000-000000000099";

class Verifier {
  async verify(token: string): Promise<VerifiedCognitoClaims> {
    if (token !== "admin") throw new Error("invalid fixture token");
    return {
      identities: JSON.stringify([{ providerName: "Google", userId: "admin" }]),
      email: "admin@example.test",
      name: "Admin",
    };
  }
}

function fixture(rateLimit?: CreateAppDependencies["rateLimit"]) {
  const database = new InMemoryUnitOfWork();
  database.seedUser({
    id: ADMIN_ID,
    googleSub: "admin",
    displayName: "Admin",
    email: "admin@example.test",
    role: "admin",
    approvalStatus: "approved",
    scorePublic: false,
    firstLoginAt: NOW,
    approvedAt: NOW,
    version: 0n,
  });
  return createApp(
    {
      tokenVerifier: new Verifier(),
      unitOfWork: database,
      now: () => new Date(NOW),
      createUserId: () => "00000000-0000-4000-8000-000000000100",
      rateLimit,
      clientIp: (context) => context.req.header("x-test-client-ip"),
      importService: new ImportService({
        ids: new SequenceUuidFactory([
          "00000000-0000-4000-8000-000000000201",
          "00000000-0000-4000-8000-000000000202",
        ]),
        random: new SequenceRandomSource([1]),
        now: () => new Date(NOW),
      }),
    },
    createApiSecurityConfiguration({
      stage: "prod",
      allowedOrigins: ["https://quiz.example.test"],
      markdownImageOrigins: ["https://images.example.test"],
    }),
  );
}

const adminHeaders = {
  authorization: "Bearer admin",
  "content-type": "application/json",
  origin: "https://quiz.example.test",
  "x-test-client-ip": "198.51.100.10",
};

describe("Task 21 HTTP security boundaries", () => {
  it("uses explicit exact-origin CORS and security headers while leaving health public", async () => {
    const app = fixture();
    const health = await app.request("http://localhost/v1/health", {
      headers: { origin: "https://quiz.example.test" },
    });
    expect(health.status).toBe(200);
    expect(health.headers.get("access-control-allow-origin")).toBe(
      "https://quiz.example.test",
    );
    expect(health.headers.get("strict-transport-security")).toContain("max-age=");
    expect(health.headers.get("x-content-type-options")).toBe("nosniff");
    expect(health.headers.get("referrer-policy")).toBe("no-referrer");
    expect(health.headers.get("x-frame-options")).toBe("DENY");
    expect(health.headers.get("content-security-policy")).toContain(
      "img-src 'self' https://images.example.test",
    );

    const denied = await app.request("http://localhost/v1/health", {
      headers: { origin: "https://untrusted.example.test" },
    });
    expect(denied.headers.get("access-control-allow-origin")).toBeNull();
    const preflight = await app.request("http://localhost/v1/health", {
      method: "OPTIONS",
      headers: { origin: "https://quiz.example.test" },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-methods")).toContain("POST");
  });

  it("returns deterministic Retry-After 429 responses from an injected shared limiter", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const app = fixture({
      async consume(input) {
        calls.push(input);
        return { allowed: false, retryAfterSeconds: 17 };
      },
    });
    const response = await app.request("http://localhost/v1/admin/imports/dry-run", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ content: "{}" }),
    });
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("17");
    expect(errorEnvelopeSchema.parse(await response.json()).error).toMatchObject({
      code: "rate-limited",
      retryable: true,
    });
    expect(calls).toEqual([
      { scope: "admin-import", actorId: ADMIN_ID, clientIp: "198.51.100.10" },
    ]);
  });

  it("redacts telemetry fields that could contain identity, credentials, answers, imports, or SQL", () => {
    const lines: string[] = [];
    const telemetry = createRedactingJsonTelemetry((line) => lines.push(line));
    telemetry.emit({
      event: "api.request",
      requestId: "api:security-test",
      path: "/v1/catalog",
      method: "GET",
      status: 200,
      outcome: "completed",
      // The sink accepts only typed event fields; this verifies redaction at the boundary too.
      ...({
        token: "secret",
        email: "user@example.test",
        sqlBinds: ["answer"],
      } as object),
    });
    expect(lines).toEqual([expect.stringContaining('"token":"[REDACTED]"')]);
    expect(lines[0]).not.toContain("secret");
    expect(lines[0]).not.toContain("user@example.test");
    expect(lines[0]).not.toContain("answer");
  });

  it("rejects an oversized import safely without echoing its payload", async () => {
    const app = fixture();
    const response = await app.request("http://localhost/v1/admin/imports/dry-run", {
      method: "POST",
      headers: adminHeaders,
      body: JSON.stringify({ content: "x".repeat(10 * 1_048_576 + 1) }),
    });
    expect(response.status).toBe(400);
    expect(errorEnvelopeSchema.parse(await response.json()).error.code).toBe(
      "validation-failed",
    );
  });
});
