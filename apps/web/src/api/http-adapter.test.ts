import { describe, expect, it, vi } from "vitest";

import { createCertQuizFixtures } from "../mocks/fixtures";
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


function success(data: unknown, requestId = "api:request"): Response {
  return new Response(JSON.stringify({ data, meta: { requestId } }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("complete CertQuizApi HTTP surface", () => {
  it("maps every port operation to its route with strict response parsing and bearer authentication", async () => {
    const fixtures = createCertQuizFixtures();
    const createdPractice = {
      kind: "created" as const,
      practiceSessionId: fixtures.ids.replacementPracticeSessionId,
      stateVersion: fixtures.practice.replacement.stateVersion,
    };
    const submittedQuestion = fixtures.practice.submitted.questions[0];
    if (!submittedQuestion || submittedQuestion.kind !== "practice-submitted") {
      throw new Error("The fixture must provide a submitted practice question.");
    }
    const responses = [
      fixtures.auth.approved.approval,
      fixtures.auth.approved.user,
      fixtures.catalog.valid,
      fixtures.practice.activeSessions,
      createdPractice,
      fixtures.practice.active,
      createdPractice,
      fixtures.practice.replacement,
      {
        practiceSessionId: fixtures.ids.practiceSessionId,
        stateVersion: 13,
        currentIndex: 1,
      },
      {
        practiceSessionId: fixtures.ids.practiceSessionId,
        stateVersion: 13,
        question: submittedQuestion,
      },
      fixtures.exam.start,
      fixtures.exam.active,
      {
        examSessionId: fixtures.ids.activeExamSessionId,
        stateVersion: 22,
        currentIndex: 1,
        serverNow: fixtures.exam.active.serverNow,
        remainingSeconds: fixtures.exam.active.remainingSeconds,
      },
      {
        examSessionId: fixtures.ids.activeExamSessionId,
        unansweredQuestionCount: 2,
        flaggedQuestionCount: 1,
        stateVersion: 22,
      },
      fixtures.exam.immutableResult,
      fixtures.practice.immutableResult,
      fixtures.exam.immutableResult,
      fixtures.history.populated,
      fixtures.history.trends,
      { scorePublic: false, stateVersion: 4 },
      fixtures.leaderboard.tied,
      fixtures.admin.pendingUsers,
      { userId: fixtures.admin.pendingUsers.users[0]!.id, approvalStatus: "approved" as const },
      fixtures.import.dryRunValid,
      fixtures.import.commitResponse,
    ];
    const fetch = vi.fn((input: string, init?: RequestInit) => {
      void input;
      void init;
      return Promise.resolve(success(responses.shift()));
    });
    const api = createHttpCertQuizApi({
      baseUrl: "https://api.example.test/base-path",
      fetch,
      getBearerToken: async () => "cognito-token",
    });

    await expect(api.getApprovalStatus()).resolves.toMatchObject({ ok: true });
    await expect(api.getCurrentUser()).resolves.toMatchObject({ ok: true });
    await expect(api.getCatalog()).resolves.toMatchObject({ ok: true });
    await expect(api.listActivePracticeSessions()).resolves.toMatchObject({ ok: true });
    await expect(
      api.startPractice({ certificationId: fixtures.ids.certificationId }),
    ).resolves.toMatchObject({ ok: true, data: createdPractice });
    await expect(
      api.resumePractice({ practiceSessionId: fixtures.ids.practiceSessionId }),
    ).resolves.toMatchObject({ ok: true, data: fixtures.practice.active });
    await expect(
      api.replacePractice({
        practiceSessionId: fixtures.ids.practiceSessionId,
        confirmationNonce: "confirm-replacement",
      }),
    ).resolves.toMatchObject({ ok: true, data: fixtures.practice.replacement });
    await expect(
      api.patchPracticeState({
        practiceSessionId: fixtures.ids.practiceSessionId,
        expectedVersion: 12,
        currentIndex: 1,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      api.submitPracticeQuestion({
        practiceSessionId: fixtures.ids.practiceSessionId,
        questionId: submittedQuestion.id,
        expectedVersion: 12,
        selectedChoiceIds: submittedQuestion.selectedChoiceIds,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      api.startExam({
        certificationId: fixtures.ids.certificationId,
        idempotencyKey: "start-exam-001",
      }),
    ).resolves.toMatchObject({ ok: true, data: fixtures.exam.start });
    await expect(
      api.getExam({ examSessionId: fixtures.ids.activeExamSessionId }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      api.patchExamState({
        examSessionId: fixtures.ids.activeExamSessionId,
        expectedVersion: 21,
        currentIndex: 1,
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      api.getExamSubmissionPreview({ examSessionId: fixtures.ids.activeExamSessionId }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      api.submitExam({ examSessionId: fixtures.ids.activeExamSessionId }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      api.getPracticeResult({ resultId: fixtures.ids.practiceResultId }),
    ).resolves.toMatchObject({ ok: true });
    await expect(api.getAttempt({ attemptId: fixtures.ids.attemptId })).resolves.toMatchObject({
      ok: true,
    });
    await expect(api.getHistory({ cursor: "next cursor" })).resolves.toMatchObject({
      ok: true,
    });
    await expect(api.getHistoryTrends()).resolves.toMatchObject({ ok: true });
    await expect(
      api.updateScoreVisibility({ scorePublic: false, expectedVersion: 3 }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      api.getLeaderboard({ certificationId: fixtures.ids.certificationId }),
    ).resolves.toMatchObject({ ok: true });
    await expect(api.getPendingUsers()).resolves.toMatchObject({ ok: true });
    await expect(
      api.approveUser({ userId: fixtures.admin.pendingUsers.users[0]!.id }),
    ).resolves.toMatchObject({ ok: true });
    await expect(api.dryRunImport(fixtures.import.dryRunRequest)).resolves.toMatchObject({
      ok: true,
    });
    await expect(api.commitImport(fixtures.import.commitRequest)).resolves.toMatchObject({
      ok: true,
    });

    expect(fetch).toHaveBeenCalledTimes(25);
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      "https://api.example.test/v1/me/approval",
      "https://api.example.test/v1/me",
      "https://api.example.test/v1/catalog",
      "https://api.example.test/v1/practice/active",
      `https://api.example.test/v1/certifications/${fixtures.ids.certificationId}/practice/start`,
      `https://api.example.test/v1/practice/${fixtures.ids.practiceSessionId}/resume`,
      `https://api.example.test/v1/practice/${fixtures.ids.practiceSessionId}/replace`,
      `https://api.example.test/v1/practice/${fixtures.ids.replacementPracticeSessionId}/resume`,
      `https://api.example.test/v1/practice/${fixtures.ids.practiceSessionId}/state`,
      `https://api.example.test/v1/practice/${fixtures.ids.practiceSessionId}/questions/${submittedQuestion.id}/submit`,
      `https://api.example.test/v1/certifications/${fixtures.ids.certificationId}/exams`,
      `https://api.example.test/v1/exams/${fixtures.ids.activeExamSessionId}`,
      `https://api.example.test/v1/exams/${fixtures.ids.activeExamSessionId}/state`,
      `https://api.example.test/v1/exams/${fixtures.ids.activeExamSessionId}/submission-preview`,
      `https://api.example.test/v1/exams/${fixtures.ids.activeExamSessionId}/submit`,
      `https://api.example.test/v1/practice-results/${fixtures.ids.practiceResultId}`,
      `https://api.example.test/v1/attempts/${fixtures.ids.attemptId}`,
      "https://api.example.test/v1/history?cursor=next%20cursor",
      "https://api.example.test/v1/history/trends",
      "https://api.example.test/v1/me/score-visibility",
      `https://api.example.test/v1/leaderboards/${fixtures.ids.certificationId}`,
      "https://api.example.test/v1/admin/pending-users",
      `https://api.example.test/v1/admin/users/${fixtures.admin.pendingUsers.users[0]!.id}/approve`,
      "https://api.example.test/v1/admin/imports/dry-run",
      "https://api.example.test/v1/admin/imports/commit",
    ]);
    expect(fetch.mock.calls[10]?.[1]).toEqual({
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: "Bearer cognito-token",
        "idempotency-key": "start-exam-001",
      },
      body: JSON.stringify({ idempotencyKey: "start-exam-001" }),
    });
  });

  it("preserves strict stale-version metadata from an API error envelope", async () => {
    const api = createHttpCertQuizApi({
      baseUrl: "https://api.example.test",
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: "stale-version",
              message: "Refresh the latest state before saving again.",
              requestId: "api:practice:stale",
              retryable: false,
              nextAction: "Refresh the practice session.",
              details: [
                { path: ["expectedVersion"], reason: "A newer state is available." },
              ],
            },
          }),
          { status: 409, headers: { "content-type": "application/json" } },
        ),
    });

    await expect(
      api.patchPracticeState({
        practiceSessionId: "00000000-0000-4000-8000-000000000001",
        expectedVersion: 1,
        currentIndex: 0,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "stale-version",
        message: "Refresh the latest state before saving again.",
        requestId: "api:practice:stale",
        retryable: false,
        nextAction: "Refresh the practice session.",
        details: [
          { path: ["expectedVersion"], reason: "A newer state is available." },
        ],
      },
    });
  });
});
