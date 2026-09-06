import * as contracts from "@cert-quiz/contracts";
import { describe, expect, it } from "vitest";

import { createMockCertQuizApi } from "../api/mock-adapter";
import type { CertQuizApi, CertQuizApiResult } from "../api/port";
import { MOCK_IDS } from "./state-machine";
import { createCertQuizFixtures } from "./fixtures";

type Schema = { parse(value: unknown): unknown };

const fixtures = createCertQuizFixtures();

async function expectSuccess(
  result: Promise<CertQuizApiResult<unknown>>,
  responseSchema: Schema,
): Promise<unknown> {
  const resolved = await result;
  expect(resolved.ok).toBe(true);
  if (!resolved.ok) throw new Error(resolved.error.message);
  responseSchema.parse(resolved.data);
  if (resolved.meta) contracts.responseMetaSchema.parse(resolved.meta);
  return resolved.data;
}

function approvedApi(): CertQuizApi {
  return createMockCertQuizApi({ authActor: "approved" });
}

/**
 * This matrix locks the frontend mock port to shared request/response schemas.
 * It is intentionally frontend-mock evidence, not real HTTP/backend acceptance.
 */
describe("frontend mock endpoint request/response matrix", () => {
  it("constructs a corpus whose every transport-shaped fixture parses through shared Zod", () => {
    expect(() => createCertQuizFixtures()).not.toThrow();
  });

  it("parses every approved S1-S10 port request and response", async () => {
    const api = approvedApi();
    const certificationId = fixtures.ids.certificationId;

    await expectSuccess(api.getHealth(), contracts.healthDtoSchema);
    await expectSuccess(api.getApprovalStatus(), contracts.approvalStatusDtoSchema);
    const currentUser = await expectSuccess(
      api.getCurrentUser(),
      contracts.currentUserDtoSchema,
    );
    await expectSuccess(api.getCatalog(), contracts.catalogDtoSchema);
    await expectSuccess(
      api.listActivePracticeSessions(),
      contracts.activePracticeSessionsDtoSchema,
    );

    contracts.startPracticeRequestSchema.parse({});
    contracts.uuidSchema.parse(certificationId);
    await expectSuccess(
      api.startPractice({ certificationId }),
      contracts.startPracticeResponseSchema,
    );

    const practiceApi = approvedApi();
    const practice = await expectSuccess(
      practiceApi.resumePractice({ practiceSessionId: fixtures.ids.practiceSessionId }),
      contracts.practiceSessionDtoSchema,
    );
    const practiceSession = contracts.practiceSessionDtoSchema.parse(practice);
    const practiceQuestion = practiceSession.questions[0];
    if (!practiceQuestion)
      throw new Error("Fixture practice session needs a question.");
    contracts.replacePracticeRequestSchema.parse({
      confirmationNonce: "replace:contract",
    });
    await expectSuccess(
      practiceApi.replacePractice({
        practiceSessionId: fixtures.ids.practiceSessionId,
        confirmationNonce: "replace:contract",
      }),
      contracts.practiceSessionDtoSchema,
    );

    const patchPracticeApi = approvedApi();
    const patchPracticeSession = contracts.practiceSessionDtoSchema.parse(
      await expectSuccess(
        patchPracticeApi.resumePractice({
          practiceSessionId: fixtures.ids.practiceSessionId,
        }),
        contracts.practiceSessionDtoSchema,
      ),
    );
    const patchPracticeQuestion = patchPracticeSession.questions[0];
    if (!patchPracticeQuestion)
      throw new Error("Fixture practice session needs a question.");
    const patchPracticeRequest = {
      expectedVersion: patchPracticeSession.stateVersion,
      flag: { questionId: patchPracticeQuestion.id, flagged: true },
    };
    contracts.patchPracticeStateRequestSchema.parse(patchPracticeRequest);
    await expectSuccess(
      patchPracticeApi.patchPracticeState({
        practiceSessionId: patchPracticeSession.practiceSessionId,
        ...patchPracticeRequest,
      }),
      contracts.practiceStateResponseSchema,
    );

    const submitPracticeApi = approvedApi();
    const submitPracticeSession = contracts.practiceSessionDtoSchema.parse(
      await expectSuccess(
        submitPracticeApi.resumePractice({
          practiceSessionId: fixtures.ids.practiceSessionId,
        }),
        contracts.practiceSessionDtoSchema,
      ),
    );
    const submitPracticeQuestion = submitPracticeSession.questions[0];
    if (!submitPracticeQuestion)
      throw new Error("Fixture practice session needs a question.");
    const submitPracticeChoiceId = submitPracticeQuestion.choices[0]?.id;
    if (!submitPracticeChoiceId) {
      throw new Error("Fixture practice question needs a choice.");
    }
    const submitPracticeRequest = {
      expectedVersion: submitPracticeSession.stateVersion,
      selectedChoiceIds: [submitPracticeChoiceId],
    };
    contracts.submitPracticeQuestionRequestSchema.parse(submitPracticeRequest);
    await expectSuccess(
      submitPracticeApi.submitPracticeQuestion({
        practiceSessionId: submitPracticeSession.practiceSessionId,
        questionId: submitPracticeQuestion.id,
        ...submitPracticeRequest,
      }),
      contracts.submitPracticeQuestionResponseSchema,
    );

    const examApi = approvedApi();
    const startExamRequest = { idempotencyKey: "contract-start-exam" };
    contracts.startExamRequestSchema.parse(startExamRequest);
    await expectSuccess(
      examApi.startExam({ certificationId, ...startExamRequest }),
      contracts.startExamResponseSchema,
    );
    const exam = contracts.getExamResponseSchema.parse(
      await expectSuccess(
        examApi.getExam({ examSessionId: MOCK_IDS.exam }),
        contracts.getExamResponseSchema,
      ),
    );
    if (exam.kind !== "exam-active-session") {
      throw new Error("Fresh mock exam must be active.");
    }
    const examQuestion = exam.questions[0];
    if (!examQuestion) throw new Error("Mock exam needs a question.");
    const examChoiceId = examQuestion.choices[0]?.id;
    if (!examChoiceId) throw new Error("Mock exam question needs a choice.");
    const patchExamRequest = {
      expectedVersion: exam.stateVersion,
      answer: { questionId: examQuestion.id, selectedChoiceIds: [examChoiceId] },
    };
    contracts.patchExamStateRequestSchema.parse(patchExamRequest);
    await expectSuccess(
      examApi.patchExamState({
        examSessionId: exam.examSessionId,
        ...patchExamRequest,
      }),
      contracts.examStateResponseSchema,
    );
    contracts.submitExamRequestSchema.parse({});
    await expectSuccess(
      examApi.getExamSubmissionPreview({ examSessionId: exam.examSessionId }),
      contracts.submissionPreviewDtoSchema,
    );
    await expectSuccess(
      examApi.submitExam({ examSessionId: exam.examSessionId }),
      contracts.submitExamResponseSchema,
    );
    await expectSuccess(
      examApi.getAttempt({ attemptId: MOCK_IDS.attempt }),
      contracts.examResultDtoSchema,
    );

    const completedResultsApi = createMockCertQuizApi({
      authActor: "approved",
      e2eScenario: "completed-results",
    });
    await expectSuccess(
      completedResultsApi.getPracticeResult({ resultId: MOCK_IDS.practiceResult }),
      contracts.practiceResultDtoSchema,
    );
    await expectSuccess(
      completedResultsApi.getHistory({}),
      contracts.historyPageDtoSchema,
    );
    await expectSuccess(
      completedResultsApi.getHistoryTrends(),
      contracts.historyTrendsDtoSchema,
    );
    const visibilityRequest = {
      scorePublic: false,
      expectedVersion: (currentUser as { stateVersion: number }).stateVersion,
    };
    contracts.updateScoreVisibilityRequestSchema.parse(visibilityRequest);
    await expectSuccess(
      completedResultsApi.updateScoreVisibility(visibilityRequest),
      contracts.updateScoreVisibilityResponseSchema,
    );
    await expectSuccess(
      completedResultsApi.getLeaderboard({ certificationId }),
      contracts.leaderboardDtoSchema,
    );

    const adminApi = createMockCertQuizApi({ authActor: "admin" });
    const pendingUsers = contracts.pendingUsersDtoSchema.parse(
      await expectSuccess(adminApi.getPendingUsers(), contracts.pendingUsersDtoSchema),
    );
    const pendingUser = pendingUsers.users[0];
    if (!pendingUser) throw new Error("Admin fixture needs a pending user.");
    await expectSuccess(
      adminApi.approveUser({ userId: pendingUser.id }),
      contracts.approveUserResponseSchema,
    );
    const dryRunRequest = contracts.dryRunImportRequestSchema.parse({
      content: fixtures.import.validContent,
    });
    const dryRun = contracts.dryRunImportResponseSchema.parse(
      await expectSuccess(
        adminApi.dryRunImport(dryRunRequest),
        contracts.dryRunImportResponseSchema,
      ),
    );
    if (!dryRun.valid || !dryRun.validationId || !dryRun.commitToken) {
      throw new Error("Mock dry-run must issue commit credentials.");
    }
    const commitRequest = {
      validationId: dryRun.validationId,
      commitToken: dryRun.commitToken,
      content: fixtures.import.validContent,
    };
    contracts.commitImportRequestSchema.parse(commitRequest);
    await expectSuccess(
      adminApi.commitImport(commitRequest),
      contracts.commitImportResponseSchema,
    );
  });

  it("rejects forbidden pre-reveal fields in every active practice/exam fixture response", () => {
    const forbidden = ["correctChoiceIds", "isCorrect", "earnedScore", "explanation"];
    for (const question of [
      ...fixtures.practice.active.questions,
      ...fixtures.exam.active.questions,
    ]) {
      for (const field of forbidden) expect(question).not.toHaveProperty(field);
    }

    const practiceQuestion = fixtures.practice.active.questions[0];
    const examQuestion = fixtures.exam.active.questions[0];
    if (!practiceQuestion || !examQuestion)
      throw new Error("Fixtures need active questions.");
    for (const field of forbidden) {
      expect(
        contracts.practiceUnsubmittedQuestionSchema.safeParse({
          ...practiceQuestion,
          [field]: "forbidden",
        }).success,
      ).toBe(false);
      expect(
        contracts.examActiveQuestionSchema.safeParse({
          ...examQuestion,
          [field]: "forbidden",
        }).success,
      ).toBe(false);
    }
  });
});
