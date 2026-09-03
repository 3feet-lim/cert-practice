import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  createCertQuizMockStateMachine,
  MOCK_IDS,
  MockStateError,
} from "./state-machine";

const expectMockError = (work: () => unknown, code: string): void => {
  try {
    work();
    throw new Error(`Expected mock error ${code}`);
  } catch (error) {
    expect(error).toBeInstanceOf(MockStateError);
    expect((error as MockStateError).code).toBe(code);
  }
};

describe("UI-development mock state machine (not backend guarantee evidence)", () => {
  // **Validates: Requirements 6.7-6.12, 7.10-7.12, 10.10-10.12**
  it("models version increments and stale rollback without claiming backend persistence or atomicity", () => {
    const state = createCertQuizMockStateMachine();

    const practiceResponse = state.patchPractice(MOCK_IDS.practice, MOCK_IDS.user, {
      expectedVersion: 0,
      flag: { questionId: MOCK_IDS.questionOne, flagged: true },
    });
    expect(practiceResponse.stateVersion).toBe(1);

    const beforeStalePractice = state.snapshot();
    expectMockError(
      () =>
        state.patchPractice(MOCK_IDS.practice, MOCK_IDS.user, {
          expectedVersion: 0,
          currentIndex: 1,
        }),
      "stale-version",
    );
    expect(state.snapshot()).toEqual(beforeStalePractice);

    const examResponse = state.patchExam(MOCK_IDS.exam, MOCK_IDS.user, {
      expectedVersion: 0,
      answer: {
        questionId: MOCK_IDS.questionOne,
        selectedChoiceIds: [MOCK_IDS.choiceOneA],
      },
    });
    expect(examResponse.stateVersion).toBe(1);
  });

  // **Validates: Requirements 8.1-8.12**
  it("models first-submit lock, identical replay, and one completed result without claiming concurrency guarantees", () => {
    const state = createCertQuizMockStateMachine();

    const first = state.submitPracticeQuestion(
      MOCK_IDS.practice,
      MOCK_IDS.questionOne,
      MOCK_IDS.user,
      { expectedVersion: 0, selectedChoiceIds: [MOCK_IDS.choiceOneA] },
    );
    const replay = state.submitPracticeQuestion(
      MOCK_IDS.practice,
      MOCK_IDS.questionOne,
      MOCK_IDS.user,
      { expectedVersion: 0, selectedChoiceIds: [MOCK_IDS.choiceOneA] },
    );

    expect(replay).toEqual(first);
    expect(state.snapshot().practice.stateVersion).toBe(1);
    expectMockError(
      () =>
        state.submitPracticeQuestion(
          MOCK_IDS.practice,
          MOCK_IDS.questionOne,
          MOCK_IDS.user,
          { expectedVersion: 1, selectedChoiceIds: [MOCK_IDS.choiceOneB] },
        ),
      "answer-locked",
    );

    const completed = state.submitPracticeQuestion(
      MOCK_IDS.practice,
      MOCK_IDS.questionTwo,
      MOCK_IDS.user,
      { expectedVersion: 1, selectedChoiceIds: [MOCK_IDS.choiceTwoA] },
    );
    const completedReplay = state.submitPracticeQuestion(
      MOCK_IDS.practice,
      MOCK_IDS.questionTwo,
      MOCK_IDS.user,
      { expectedVersion: 1, selectedChoiceIds: [MOCK_IDS.choiceTwoA] },
    );

    expect(completed.completedPracticeResultId).toBe(MOCK_IDS.practiceResult);
    expect(completedReplay).toEqual(completed);
    expect(state.snapshot().practice.resultCount).toBe(1);
  });

  // **Validates: Requirements 10.3-10.13, 11.6-11.10**
  it("models serverNow/expiresAt, preview counts, and same-submit result without claiming real server time or idempotency", () => {
    const state = createCertQuizMockStateMachine();

    const activeExam = state.getExam(MOCK_IDS.exam, MOCK_IDS.user);
    expect(activeExam).toMatchObject({
      kind: "exam-active-session",
      serverNow: "2026-03-23T12:10:00.000Z",
      expiresAt: "2026-03-23T15:00:00.000Z",
      remainingSeconds: 10_200,
    });

    state.patchExam(MOCK_IDS.exam, MOCK_IDS.user, {
      expectedVersion: 0,
      answer: {
        questionId: MOCK_IDS.questionOne,
        selectedChoiceIds: [MOCK_IDS.choiceOneA],
      },
      flag: { questionId: MOCK_IDS.questionTwo, flagged: false },
    });
    expect(state.getExamSubmissionPreview(MOCK_IDS.exam, MOCK_IDS.user)).toEqual({
      examSessionId: MOCK_IDS.exam,
      unansweredQuestionCount: 1,
      flaggedQuestionCount: 0,
      stateVersion: 1,
    });

    const firstResult = state.submitExam(MOCK_IDS.exam, MOCK_IDS.user);
    const repeatedResult = state.submitExam(MOCK_IDS.exam, MOCK_IDS.user);
    expect(repeatedResult).toEqual(firstResult);
    expect(state.snapshot().exam.attemptCount).toBe(1);
  });

  // **Validates: Requirements 15.20-15.27**
  it("models actor-bound import token expiry and reuse without claiming authorization or atomic catalog replacement", () => {
    const state = createCertQuizMockStateMachine();
    const validation = state.createImportValidation('{"version":1}', MOCK_IDS.user);

    const committed = state.commitImport(
      {
        validationId: validation.validationId!,
        commitToken: validation.commitToken!,
        content: '{"version":1}',
      },
      MOCK_IDS.user,
    );
    expect(committed.activatedRevisionId).toBe(MOCK_IDS.revision);
    expectMockError(
      () =>
        state.commitImport(
          {
            validationId: validation.validationId!,
            commitToken: validation.commitToken!,
            content: '{"version":1}',
          },
          MOCK_IDS.user,
        ),
      "token-used",
    );

    const expiringState = createCertQuizMockStateMachine();
    const expiringValidation = expiringState.createImportValidation(
      '{"version":2}',
      MOCK_IDS.user,
    );
    expiringState.advanceTime(15 * 60_000);
    expectMockError(
      () =>
        expiringState.commitImport(
          {
            validationId: expiringValidation.validationId!,
            commitToken: expiringValidation.commitToken!,
            content: '{"version":2}',
          },
          MOCK_IDS.user,
        ),
      "validation-expired",
    );
  });

  // **Validates: Requirements 6.7-6.12**
  it("generated UI mock flag saves increase exactly once while a generated stale replay is a no-op", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }), (flags) => {
        const state = createCertQuizMockStateMachine();
        let version = 0;

        for (const flagged of flags) {
          state.patchPractice(MOCK_IDS.practice, MOCK_IDS.user, {
            expectedVersion: version,
            flag: { questionId: MOCK_IDS.questionOne, flagged },
          });
          version += 1;
        }

        const beforeStale = state.snapshot();
        expectMockError(
          () =>
            state.patchPractice(MOCK_IDS.practice, MOCK_IDS.user, {
              expectedVersion: Math.max(0, version - 1),
              flag: { questionId: MOCK_IDS.questionOne, flagged: true },
            }),
          "stale-version",
        );
        expect(state.snapshot()).toEqual(beforeStale);
        expect(beforeStale.practice.stateVersion).toBe(version);
      }),
      { numRuns: 200 },
    );
  });
});
