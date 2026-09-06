import * as contracts from "@cert-quiz/contracts";
import { describe, expect, it, vi } from "vitest";

import {
  CERT_QUIZ_STATIC_PREVIEW_FIXTURES,
  DOP_C02_METADATA,
  createCertQuizStaticPreviewFixtures,
} from "./index";

function expectParses(
  schema: { parse: (value: unknown) => unknown },
  value: unknown,
): void {
  expect(() => schema.parse(value)).not.toThrow();
}

function fixtureData<Data>(fixture: { data?: Data }, fixtureName: string): Data {
  if (fixture.data === undefined) {
    throw new Error(`${fixtureName} must retain its static payload.`);
  }
  return fixture.data;
}

describe("static UI preview fixtures", () => {
  it("covers fixed actor and success, empty, and error screen variants", () => {
    const preview = CERT_QUIZ_STATIC_PREVIEW_FIXTURES;

    expect(preview.actors.unauthenticated.state).toBe("empty");
    expect(preview.actors.pending.state).toBe("success");
    expect(preview.actors.approved.state).toBe("success");
    expect(preview.actors.admin.state).toBe("success");
    expect(preview.actors.callbackError.state).toBe("error");

    for (const group of [
      preview.catalog,
      preview.practice,
      preview.exam,
      preview.results,
      preview.history,
      preview.leaderboard,
      preview.admin.users,
      preview.admin.import,
    ]) {
      expect(Object.values(group).some(({ state }) => state === "success")).toBe(true);
      expect(Object.values(group).some(({ state }) => state === "empty")).toBe(true);
      expect(Object.values(group).some(({ state }) => state === "error")).toBe(true);
    }
  });

  it("parses every transport-shaped preview value with shared schemas", () => {
    const preview = CERT_QUIZ_STATIC_PREVIEW_FIXTURES;

    if (
      preview.actors.pending.state !== "success" ||
      preview.actors.approved.state !== "success" ||
      preview.actors.admin.state !== "success"
    ) {
      throw new Error("Actor success fixtures must remain available.");
    }
    expectParses(
      contracts.approvalStatusDtoSchema,
      preview.actors.pending.data.approval,
    );
    expectParses(contracts.currentUserDtoSchema, preview.actors.approved.data.user);
    expectParses(contracts.currentUserDtoSchema, preview.actors.admin.data.user);

    const catalogSuccess = fixtureData(preview.catalog.success, "catalog success");
    const catalogEmpty = fixtureData(preview.catalog.empty, "catalog empty");
    const catalogError = fixtureData(preview.catalog.error, "catalog error");
    const practiceSuccess = fixtureData(preview.practice.success, "practice success");
    const practiceSubmitted = fixtureData(
      preview.practice.submittedFeedback,
      "practice submitted feedback",
    );
    const practiceEmpty = fixtureData(preview.practice.empty, "practice empty");
    const examSuccess = fixtureData(preview.exam.success, "exam success");
    const examExpired = fixtureData(preview.exam.expired, "exam expired");
    const examFinalized = fixtureData(preview.exam.finalized, "exam finalized");
    const resultsSuccess = fixtureData(preview.results.success, "results success");
    const historySuccess = fixtureData(preview.history.success, "history success");
    const historyEmpty = fixtureData(preview.history.empty, "history empty");
    const leaderboardSuccess = fixtureData(
      preview.leaderboard.success,
      "leaderboard success",
    );
    const leaderboardEmpty = fixtureData(
      preview.leaderboard.empty,
      "leaderboard empty",
    );
    const pendingUsers = fixtureData(preview.admin.users.success, "pending users");
    const noPendingUsers = fixtureData(preview.admin.users.empty, "no pending users");
    const importSuccess = fixtureData(preview.admin.import.success, "import success");
    const importError = fixtureData(preview.admin.import.error, "import error");

    expectParses(contracts.catalogDtoSchema, catalogSuccess);
    expectParses(contracts.catalogDtoSchema, catalogEmpty);
    expectParses(contracts.catalogDtoSchema, catalogError);
    expectParses(
      contracts.activePracticeSessionsDtoSchema,
      practiceSuccess.activeSessions,
    );
    expectParses(contracts.practiceSessionDtoSchema, practiceSuccess.session);
    expectParses(contracts.practiceSessionDtoSchema, practiceSubmitted);
    expectParses(contracts.activePracticeSessionsDtoSchema, practiceEmpty);
    expectParses(contracts.examActiveSessionDtoSchema, examSuccess.session);
    expectParses(contracts.submissionPreviewDtoSchema, examSuccess.submissionPreview);
    expectParses(contracts.examActiveSessionDtoSchema, examExpired);
    expectParses(contracts.getExamResponseSchema, examFinalized);
    expectParses(contracts.practiceResultDtoSchema, resultsSuccess.practice);
    expectParses(contracts.examResultDtoSchema, resultsSuccess.exam);
    expectParses(contracts.historyPageDtoSchema, historySuccess.page);
    expectParses(contracts.historyTrendsDtoSchema, historySuccess.trends);
    expectParses(contracts.historyPageDtoSchema, historyEmpty.page);
    expectParses(contracts.historyTrendsDtoSchema, historyEmpty.trends);
    expectParses(contracts.leaderboardDtoSchema, leaderboardSuccess);
    expectParses(contracts.leaderboardDtoSchema, leaderboardEmpty);
    expectParses(contracts.pendingUsersDtoSchema, pendingUsers);
    expectParses(contracts.pendingUsersDtoSchema, noPendingUsers);
    expectParses(contracts.dryRunImportResponseSchema, importSuccess);
    expectParses(contracts.dryRunImportResponseSchema, importError);

    const errors = [
      preview.actors.callbackError.error,
      preview.catalog.error.error,
      preview.practice.error.error,
      preview.exam.error.error,
      preview.results.error.error,
      preview.history.error.error,
      preview.leaderboard.error.error,
      preview.admin.users.error.error,
      preview.admin.import.error.error,
    ];
    for (const error of errors) {
      expectParses(contracts.transportErrorSchema, error);
    }
    expect(errors.some(({ retryable }) => retryable)).toBe(true);
    expect(errors.some(({ retryable }) => !retryable)).toBe(true);
  });

  it("replays identical IDs, timestamps, scores, and question order", () => {
    const first = createCertQuizStaticPreviewFixtures();
    const replay = createCertQuizStaticPreviewFixtures();
    const catalogSuccess = fixtureData(first.catalog.success, "catalog success");
    const practiceSuccess = fixtureData(first.practice.success, "practice success");
    const resultsSuccess = fixtureData(first.results.success, "results success");

    expect(JSON.stringify(first)).toBe(JSON.stringify(replay));
    expect(first.fixed.serverNow).toBe("2026-03-23T12:00:00.000Z");
    expect(catalogSuccess.providers[0]?.certifications[0]).toMatchObject({
      code: DOP_C02_METADATA.code,
      totalQuestions: 75,
      timeLimitMinutes: 180,
      passThreshold: "75",
      scoringMode: "all_or_nothing",
    });

    const questions = practiceSuccess.session.questions;
    expect(questions).toHaveLength(75);
    expect(questions.map(({ displayNumber }) => displayNumber)).toEqual(
      Array.from({ length: 75 }, (_, index) => index + 1),
    );
    expect(questions.map(({ id }) => id)).toEqual(first.fixed.ids.questionIds);
    expect(resultsSuccess.exam.score).toEqual({
      rawScore: "60",
      accuracyRate: "80",
    });
    expect(resultsSuccess.exam.reference1000Score).toBe(800);
  });

  it("keeps active exam answers private and exposes fixed preview counts", () => {
    const exam = fixtureData(
      CERT_QUIZ_STATIC_PREVIEW_FIXTURES.exam.success,
      "exam success",
    );

    expect(exam.submissionPreview).toMatchObject({
      unansweredQuestionCount: 30,
      flaggedQuestionCount: 3,
      stateVersion: 21,
    });
    for (const question of exam.session.questions) {
      expect(question).not.toHaveProperty("correctChoiceIds");
      expect(question).not.toHaveProperty("isCorrect");
      expect(question).not.toHaveProperty("earnedScore");
      expect(question).not.toHaveProperty("explanation");
    }
  });

  it("is deeply frozen, preserves invalid import input, and performs no I/O", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const preview = createCertQuizStaticPreviewFixtures();
    const practiceSuccess = fixtureData(preview.practice.success, "practice success");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(practiceSuccess.session.questions)).toBe(true);
    expect(preview.admin.import.error.preservedInput).toContain(
      '"id":"broken-dop-c02"',
    );

    fetchSpy.mockRestore();
  });
});
