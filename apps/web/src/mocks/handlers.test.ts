import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  createMockScenarioHandlers,
  MOCK_API_BASE_URL,
  MOCK_SCENARIOS,
  type MockScenario,
} from "./scenario-handlers";
import { MOCK_IDS, type MockStateSnapshot } from "./state-machine";

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function installScenario(
  scenario: MockScenario,
  delayMs?: number,
): { snapshot: () => MockStateSnapshot } {
  const { handlers, state } = createMockScenarioHandlers({ scenario, delayMs });
  server.use(...handlers);
  return { snapshot: () => state.snapshot() };
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function errorCode(body: Record<string, unknown>): string | undefined {
  return (body.error as { code?: string } | undefined)?.code;
}

describe("MSW UI-development scenarios (not backend guarantee evidence)", () => {
  it("exports every requested UI scenario without representing backend persistence/auth/atomicity/concurrency/security", () => {
    expect(MOCK_SCENARIOS).toEqual([
      "default",
      "loading-delay",
      "empty",
      "retryable-error",
      "non-retryable-error",
      "stale-version",
      "save-rollback",
      "owner-denial",
      "role-denial",
      "import-validation-errors",
      "token-expired",
      "token-reused",
      "duplicate-submission",
      "idempotent-result",
    ]);
  });

  // **Validates: Requirements 16.1-16.7**
  it("provides loading delay, empty, retryable, and non-retryable UI responses only", async () => {
    installScenario("loading-delay", 20);
    const startedAt = performance.now();
    const delayed = await globalThis.fetch(`${MOCK_API_BASE_URL}/catalog`);
    expect(performance.now() - startedAt).toBeGreaterThanOrEqual(10);
    expect(delayed.ok).toBe(true);

    server.resetHandlers();
    installScenario("empty");
    const empty = await responseBody(
      await globalThis.fetch(`${MOCK_API_BASE_URL}/catalog`),
    );
    expect(empty.data).toEqual({ providers: [], dataErrors: [] });

    server.resetHandlers();
    installScenario("retryable-error");
    const retryable = await responseBody(
      await globalThis.fetch(`${MOCK_API_BASE_URL}/catalog`),
    );
    expect(retryable.error).toMatchObject({
      code: "dependency-unavailable",
      retryable: true,
    });

    server.resetHandlers();
    installScenario("non-retryable-error");
    const nonRetryable = await responseBody(
      await globalThis.fetch(`${MOCK_API_BASE_URL}/catalog`),
    );
    expect(nonRetryable.error).toMatchObject({
      code: "validation-failed",
      retryable: false,
    });
  });

  // **Validates: Requirements 6.7-6.12, 7.10-7.12, 10.10-10.12**
  it("returns stale/save errors and leaves the UI mock state unchanged without proving transaction rollback", async () => {
    const stale = installScenario("stale-version");
    const staleBefore = stale.snapshot();
    const staleBody = await responseBody(
      await globalThis.fetch(
        `${MOCK_API_BASE_URL}/practice/${MOCK_IDS.practice}/state`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            expectedVersion: 0,
            flag: { questionId: MOCK_IDS.questionOne, flagged: true },
          }),
        },
      ),
    );
    expect(errorCode(staleBody)).toBe("stale-version");
    expect(stale.snapshot()).toEqual(staleBefore);

    server.resetHandlers();
    const rollback = installScenario("save-rollback");
    const rollbackBefore = rollback.snapshot();
    const rollbackBody = await responseBody(
      await globalThis.fetch(`${MOCK_API_BASE_URL}/exams/${MOCK_IDS.exam}/state`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: 0, currentIndex: 1 }),
      }),
    );
    expect(errorCode(rollbackBody)).toBe("transaction-conflict");
    expect(rollback.snapshot()).toEqual(rollbackBefore);
  });

  // **Validates: Requirements 1.7-1.12, 2.4**
  it("provides owner and role denial UI projections without proving real authorization", async () => {
    installScenario("owner-denial");
    const ownerDenied = await responseBody(
      await globalThis.fetch(`${MOCK_API_BASE_URL}/exams/${MOCK_IDS.exam}`),
    );
    expect(errorCode(ownerDenied)).toBe("ownership-denied");
    expect(JSON.stringify(ownerDenied)).not.toContain("mock.learner@example.com");

    server.resetHandlers();
    installScenario("role-denial");
    const roleDenied = await responseBody(
      await globalThis.fetch(`${MOCK_API_BASE_URL}/admin/pending-users`),
    );
    expect(errorCode(roleDenied)).toBe("admin-required");
  });

  // **Validates: Requirements 15.17-15.27**
  it("provides aggregate import validation, expired-token, and reused-token UI errors without proving atomic replacement", async () => {
    installScenario("import-validation-errors");
    const validation = await responseBody(
      await globalThis.fetch(`${MOCK_API_BASE_URL}/admin/imports/dry-run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: "{}" }),
      }),
    );
    expect(validation.data).toMatchObject({
      valid: false,
      summary: { errorCount: 2 },
    });
    expect((validation.data as { errors: unknown[] }).errors).toHaveLength(2);

    for (const [scenario, expectedCode] of [
      ["token-expired", "validation-expired"],
      ["token-reused", "token-used"],
    ] as const) {
      server.resetHandlers();
      installScenario(scenario);
      const body = await responseBody(
        await globalThis.fetch(`${MOCK_API_BASE_URL}/admin/imports/commit`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            validationId: MOCK_IDS.validation,
            commitToken: "x".repeat(64),
            content: "{}",
          }),
        }),
      );
      expect(errorCode(body)).toBe(expectedCode);
    }
  });

  // **Validates: Requirements 8.6, 8.12, 11.6-11.10, 16.8, 16.9**
  it.each(["duplicate-submission", "idempotent-result"] as const)(
    "%s converges on one UI result without proving backend concurrency or idempotency",
    async (scenario) => {
      const mock = installScenario(scenario, 5);
      const request = () =>
        globalThis
          .fetch(`${MOCK_API_BASE_URL}/exams/${MOCK_IDS.exam}/submit`, {
            method: "POST",
          })
          .then(responseBody);

      const [first, second] = await Promise.all([request(), request()]);
      expect(first.data).toEqual(second.data);
      expect(first.data).toMatchObject({
        kind: "exam-result",
        attemptId: MOCK_IDS.attempt,
      });
      expect(mock.snapshot().exam.attemptCount).toBe(1);
    },
  );

  // **Validates: Requirements 10.3, 10.13**
  it("returns serverNow/expiresAt and server-saved preview counts from the UI mock", async () => {
    installScenario("default");

    const exam = await responseBody(
      await globalThis.fetch(`${MOCK_API_BASE_URL}/exams/${MOCK_IDS.exam}`),
    );
    expect(exam.data).toMatchObject({
      serverNow: "2026-03-23T12:10:00.000Z",
      expiresAt: "2026-03-23T15:00:00.000Z",
      remainingSeconds: 10_200,
    });

    const preview = await responseBody(
      await globalThis.fetch(
        `${MOCK_API_BASE_URL}/exams/${MOCK_IDS.exam}/submission-preview`,
        { method: "POST" },
      ),
    );
    expect(preview.data).toEqual({
      examSessionId: MOCK_IDS.exam,
      unansweredQuestionCount: 2,
      flaggedQuestionCount: 1,
      stateVersion: 0,
    });
  });
});
