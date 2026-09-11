import {
  activePracticeSessionsDtoSchema,
  approvalStatusDtoSchema,
  approveUserResponseSchema,
  catalogDtoSchema,
  commitImportResponseSchema,
  currentUserDtoSchema,
  dryRunImportResponseSchema,
  errorEnvelopeSchema,
  examResultDtoSchema,
  examStateResponseSchema,
  getExamResponseSchema,
  healthSuccessEnvelopeSchema,
  historyPageDtoSchema,
  historyTrendsDtoSchema,
  leaderboardDtoSchema,
  pendingUsersDtoSchema,
  practiceResultDtoSchema,
  practiceSessionDtoSchema,
  practiceStateResponseSchema,
  startExamResponseSchema,
  startPracticeResponseSchema,
  submissionPreviewDtoSchema,
  submitPracticeQuestionResponseSchema,
  successEnvelopeSchema,
  updateScoreVisibilityResponseSchema,
  type UserProfile,
} from "@cert-quiz/contracts";
import { InMemoryUnitOfWork } from "@cert-quiz/db";
import { describe, expect, it } from "vitest";

import { createHttpCertQuizApi } from "../../web/src/api/http-adapter.js";
import { createCertQuizFixtures } from "../../web/src/mocks/fixtures.js";
import { createApp, type CognitoTokenVerifier } from "./app.js";
import type { VerifiedCognitoClaims } from "./authentication.js";

const TRANSPORT_CODES = new Set([
  "authentication-invalid",
  "google-identity-missing",
  "approval-required",
  "admin-required",
  "ownership-denied",
  "not-found",
  "practice-result-expired",
  "validation-failed",
  "validation-required",
  "validation-expired",
  "invalid-choice-count",
  "invalid-scoring-config",
  "stale-version",
  "answer-locked",
  "content-changed",
  "token-used",
  "exam-expired",
  "exam-finalized",
  "pool-insufficient",
  "rate-limited",
  "dependency-unavailable",
  "transaction-conflict",
  "internal-error",
]);

class AdminVerifier implements CognitoTokenVerifier {
  async verify(token: string): Promise<VerifiedCognitoClaims> {
    if (token !== "compatibility-token") throw new Error("invalid fixture token");
    return {
      identities: JSON.stringify([{ providerName: "Google", userId: "compat-admin" }]),
      email: "compat-admin@example.test",
      name: "Compatibility Admin",
    };
  }
}

function composedProvider() {
  const fixtures = createCertQuizFixtures();
  const database = new InMemoryUnitOfWork();
  const profile: UserProfile = {
    id: fixtures.auth.admin.user.id,
    googleSub: "compat-admin",
    displayName: "Compatibility Admin",
    email: "compat-admin@example.test",
    role: "admin",
    approvalStatus: "approved",
    scorePublic: false,
    firstLoginAt: new Date("2026-01-01T00:00:00.000Z"),
    approvedAt: new Date("2026-01-01T00:00:00.000Z"),
    version: 0n,
  };
  database.seedUser(profile);
  return {
    app: createApp({
      tokenVerifier: new AdminVerifier(),
      unitOfWork: database,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      createUserId: () => fixtures.auth.admin.user.id,
    }),
    fixtures,
  };
}

/**
 * Consumer fixtures and provider responses must agree on every CertQuizApi
 * operation. The provider is composed through the same Hono application used
 * by Lambda, while unavailable lifecycle dependencies deliberately exercise
 * the safe transport-error branch rather than a mocked HTTP response.
 */
describe("frontend consumer/backend provider compatibility gate", () => {
  it("keeps the complete fixture corpus within each consumer response contract", () => {
    const fixtures = createCertQuizFixtures();
    const matrix = [
      ["health", { data: fixtures.health }, healthSuccessEnvelopeSchema],
      ["approval", fixtures.auth.approved.approval, approvalStatusDtoSchema],
      ["current user", fixtures.auth.approved.user, currentUserDtoSchema],
      ["catalog", fixtures.catalog.valid, catalogDtoSchema],
      ["active practice", fixtures.practice.activeSessions, activePracticeSessionsDtoSchema],
      ["start practice", { kind: "created", practiceSessionId: fixtures.ids.practiceSessionId, stateVersion: 0 }, startPracticeResponseSchema],
      ["practice resume", fixtures.practice.active, practiceSessionDtoSchema],
      ["practice patch", { practiceSessionId: fixtures.ids.practiceSessionId, stateVersion: 13, currentIndex: 1 }, practiceStateResponseSchema],
      ["practice submit", { practiceSessionId: fixtures.ids.practiceSessionId, stateVersion: 13, question: fixtures.practice.submitted.questions[0] }, submitPracticeQuestionResponseSchema],
      ["exam start", fixtures.exam.start, startExamResponseSchema],
      ["exam get", fixtures.exam.active, getExamResponseSchema],
      ["exam patch", { examSessionId: fixtures.ids.activeExamSessionId, stateVersion: 22, currentIndex: 1, serverNow: fixtures.exam.active.serverNow, remainingSeconds: 1 }, examStateResponseSchema],
      ["exam preview", { examSessionId: fixtures.ids.activeExamSessionId, unansweredQuestionCount: 1, flaggedQuestionCount: 0, stateVersion: 21 }, submissionPreviewDtoSchema],
      ["exam submit", fixtures.exam.immutableResult, examResultDtoSchema],
      ["practice result", fixtures.practice.immutableResult, practiceResultDtoSchema],
      ["attempt", fixtures.exam.immutableResult, examResultDtoSchema],
      ["history", fixtures.history.populated, historyPageDtoSchema],
      ["history trends", fixtures.history.trends, historyTrendsDtoSchema],
      ["score visibility", { scorePublic: false, stateVersion: 1 }, updateScoreVisibilityResponseSchema],
      ["leaderboard", fixtures.leaderboard.tied, leaderboardDtoSchema],
      ["pending users", fixtures.admin.pendingUsers, pendingUsersDtoSchema],
      ["approve user", { userId: fixtures.admin.pendingUsers.users[0]!.id, approvalStatus: "approved" }, approveUserResponseSchema],
      ["import dry run", fixtures.import.dryRunValid, dryRunImportResponseSchema],
      ["import commit", fixtures.import.commitResponse, commitImportResponseSchema],
    ] as const;

    for (const [operation, payload, schema] of matrix) {
      expect(schema.safeParse(payload), operation).toMatchObject({ success: true });
    }

    const activeQuestion = fixtures.exam.active.questions[0]!;
    expect(activeQuestion).not.toHaveProperty("correctChoiceIds");
    expect(activeQuestion).not.toHaveProperty("isCorrect");
    expect(activeQuestion).not.toHaveProperty("earnedScore");
    expect(activeQuestion).not.toHaveProperty("explanation");
  });

  it("routes every consumer operation through composed Hono and preserves strict success/error envelopes", async () => {
    const { app, fixtures } = composedProvider();
    const providerResponses: Response[] = [];
    const providerRequests: string[] = [];
    const api = createHttpCertQuizApi({
      baseUrl: "http://localhost",
      getBearerToken: () => "compatibility-token",
      fetch: async (input, init) => {
        providerRequests.push(String(input));
        const response = await app.request(input, init);
        providerResponses.push(response.clone());
        return response;
      },
    });
    const submittedQuestion = fixtures.practice.submitted.questions[0]!;

    const results = await Promise.all([
      api.getHealth(),
      api.getApprovalStatus(),
      api.getCurrentUser(),
      api.getCatalog(),
      api.listActivePracticeSessions(),
      api.startPractice({ certificationId: fixtures.ids.certificationId }),
      api.resumePractice({ practiceSessionId: fixtures.ids.practiceSessionId }),
      api.replacePractice({ practiceSessionId: fixtures.ids.practiceSessionId, confirmationNonce: "replace" }),
      api.patchPracticeState({ practiceSessionId: fixtures.ids.practiceSessionId, expectedVersion: 0, currentIndex: 0 }),
      api.submitPracticeQuestion({ practiceSessionId: fixtures.ids.practiceSessionId, questionId: submittedQuestion.id, expectedVersion: 0, selectedChoiceIds: submittedQuestion.selectedChoiceIds }),
      api.startExam({ certificationId: fixtures.ids.certificationId, idempotencyKey: "compat-start" }),
      api.getExam({ examSessionId: fixtures.ids.activeExamSessionId }),
      api.patchExamState({ examSessionId: fixtures.ids.activeExamSessionId, expectedVersion: 0, currentIndex: 0 }),
      api.getExamSubmissionPreview({ examSessionId: fixtures.ids.activeExamSessionId }),
      api.submitExam({ examSessionId: fixtures.ids.activeExamSessionId }),
      api.getPracticeResult({ resultId: fixtures.ids.practiceResultId }),
      api.getAttempt({ attemptId: fixtures.ids.attemptId }),
      api.getHistory({}),
      api.getHistoryTrends(),
      api.updateScoreVisibility({ scorePublic: true, expectedVersion: 0 }),
      api.getLeaderboard({ certificationId: fixtures.ids.certificationId }),
      api.getPendingUsers(),
      api.approveUser({ userId: fixtures.admin.pendingUsers.users[0]!.id }),
      api.dryRunImport(fixtures.import.dryRunRequest),
      api.commitImport(fixtures.import.commitRequest),
    ]);

    expect(providerResponses).toHaveLength(25);
    expect(new Set(providerRequests)).toEqual(
      new Set([
        "http://localhost/v1/health",
        "http://localhost/v1/me/approval",
        "http://localhost/v1/me",
        "http://localhost/v1/catalog",
        "http://localhost/v1/practice/active",
        `http://localhost/v1/certifications/${fixtures.ids.certificationId}/practice/start`,
        `http://localhost/v1/practice/${fixtures.ids.practiceSessionId}/resume`,
        `http://localhost/v1/practice/${fixtures.ids.practiceSessionId}/replace`,
        `http://localhost/v1/practice/${fixtures.ids.practiceSessionId}/state`,
        `http://localhost/v1/practice/${fixtures.ids.practiceSessionId}/questions/${submittedQuestion.id}/submit`,
        `http://localhost/v1/certifications/${fixtures.ids.certificationId}/exams`,
        `http://localhost/v1/exams/${fixtures.ids.activeExamSessionId}`,
        `http://localhost/v1/exams/${fixtures.ids.activeExamSessionId}/state`,
        `http://localhost/v1/exams/${fixtures.ids.activeExamSessionId}/submission-preview`,
        `http://localhost/v1/exams/${fixtures.ids.activeExamSessionId}/submit`,
        `http://localhost/v1/practice-results/${fixtures.ids.practiceResultId}`,
        `http://localhost/v1/attempts/${fixtures.ids.attemptId}`,
        "http://localhost/v1/history",
        "http://localhost/v1/history/trends",
        "http://localhost/v1/me/score-visibility",
        `http://localhost/v1/leaderboards/${fixtures.ids.certificationId}`,
        "http://localhost/v1/admin/pending-users",
        `http://localhost/v1/admin/users/${fixtures.admin.pendingUsers.users[0]!.id}/approve`,
        "http://localhost/v1/admin/imports/dry-run",
        "http://localhost/v1/admin/imports/commit",
      ]),
    );

    for (const response of providerResponses) {
      const body = await response.json();
      if (response.ok) {
        expect("data" in (body as object)).toBe(true);
        continue;
      }
      const parsed = errorEnvelopeSchema.safeParse(body);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(TRANSPORT_CODES.has(parsed.data.error.code)).toBe(true);
        expect(typeof parsed.data.error.retryable).toBe("boolean");
      }
    }
    for (const result of results) {
      if (!result.ok) expect(TRANSPORT_CODES.has(result.error.code)).toBe(true);
    }
  });
});
