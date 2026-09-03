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
      expect(Object.values(group).some(({ state }) => state === "success")).toBe(
        true,
      );
      expect(Object.values(group).some(({ state }) => state === "empty")).toBe(
        true,
      );
      expect(Object.values(group).some(({ state }) => state === "error")).toBe(
        true,
      );
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
    expectParses(
      contracts.currentUserDtoSchema,
      preview.actors.approved.data.user,
    );
    expectParses(contracts.currentUserDtoSchema, preview.actors.admin.data.user);

    expectParses(contracts.catalogDtoSchema, preview.catalog.success.data);
    expectParses(contracts.catalogDtoSchema, preview.catalog.empty.data);
    expectParses(contracts.catalogDtoSchema, preview.catalog.error.data);

    expectParses(
      contracts.activePracticeSessionsDtoSchema,
      preview.practice.success.data.activeSessions,
    );
    expectParses(
      contracts.practiceSessionDtoSchema,
      preview.practice.success.data.session,
    );
    expectParses(
      contracts.practiceSessionDtoSchema,
      preview.practice.submittedFeedback.data,
    );
    expectParses(
      contracts.activePracticeSessionsDtoSchema,
      preview.practice.empty.data,
    );

    expectParses(
      contracts.examActiveSessionDtoSchema,
      preview.exam.success.data.session,
    );
    expectParses(
      contracts.submissionPreviewDtoSchema,
      preview.exam.success.data.submissionPreview,
    );
    expectParses(contracts.examActiveSessionDtoSchema, preview.exam.expired.data);
    expectParses(contracts.getExamResponseSchema, preview.exam.finalized.data);

    expectParses(
      contracts.practiceResultDtoSchema,
      preview.results.success.data.practice,
    );
    expectParses(
      contracts.examResultDtoSchema,
      preview.results.success.data.exam,
    );
    expectParses(contracts.historyPageDtoSchema, preview.history.success.data.page);
    expectParses(
      contracts.historyTrendsDtoSchema,
      preview.history.success.data.trends,
    );
    expectParses(contracts.historyPageDtoSchema, preview.history.empty.data.page);
    expectParses(
      contracts.historyTrendsDtoSchema,
      preview.history.empty.data.trends,
    );
    expectParses(
      contracts.leaderboardDtoSchema,
      preview.leaderboard.success.data,
    );
    expectParses(contracts.leaderboardDtoSchema, preview.leaderboard.empty.data);
    expectParses(
      contracts.pendingUsersDtoSchema,
      preview.admin.users.success.data,
    );
    expectParses(
      contracts.pendingUsersDtoSchema,
      preview.admin.users.empty.data,
    );
    expectParses(
      contracts.dryRunImportResponseSchema,
      preview.admin.import.success.data,
    );
    expectParses(
      contracts.dryRunImportResponseSchema,
      preview.admin.import.error.data,
    );

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

    expect(JSON.stringify(first)).toBe(JSON.stringify(replay));
    expect(first.fixed.serverNow).toBe("2026-03-23T12:00:00.000Z");
    expect(first.catalog.success.data.providers[0]?.certifications[0]).toMatchObject({
      code: DOP_C02_METADATA.code,
      totalQuestions: 75,
      timeLimitMinutes: 180,
      passThreshold: "75",
      scoringMode: "all_or_nothing",
    });

    const questions = first.practice.success.data.session.questions;
    expect(questions).toHaveLength(75);
    expect(questions.map(({ displayNumber }) => displayNumber)).toEqual(
      Array.from({ length: 75 }, (_, index) => index + 1),
    );
    expect(questions.map(({ id }) => id)).toEqual(first.fixed.ids.questionIds);
    expect(first.results.success.data.exam.score).toEqual({
      rawScore: "60",
      accuracyRate: "80",
    });
    expect(first.results.success.data.exam.reference1000Score).toBe(800);
  });

  it("keeps active exam answers private and exposes fixed preview counts", () => {
    const exam = CERT_QUIZ_STATIC_PREVIEW_FIXTURES.exam.success.data;

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

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(Object.isFrozen(preview)).toBe(true);
    expect(Object.isFrozen(preview.practice.success.data.session.questions)).toBe(
      true,
    );
    expect(preview.admin.import.error.preservedInput).toContain(
      '"id":"broken-dop-c02"',
    );

    fetchSpy.mockRestore();
  });
});
