// Feature: cert-quiz-mvp, Property 10
import type {
  ExamStateResponse,
  GetExamResponse,
  PracticeSessionDto,
  PracticeStateResponse,
} from "@cert-quiz/contracts";
import { act, renderHook } from "@testing-library/react";
import fc from "fast-check";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import type { CertQuizApi, CertQuizApiFailure, CertQuizApiResult } from "../api/port";
import { CertQuizRequestError } from "../api/query-result";
import { createUnavailableCertQuizApi } from "../api/unavailable-adapter";
import { CertQuizCompositionRoot } from "../app/CertQuizCompositionRoot";
import { createCertQuizQueryClient } from "../app/query-client";
import { certQuizQueryKeys } from "../app/query-keys";
import { createCertQuizFixtures } from "../mocks/fixtures";
import { createQuizStore, type QuizQuestionTarget } from "./quiz-store";
import { useExamFlagMutation, usePracticeFlagMutation } from "./quiz-queries";

type FlagOutcome = "success" | "stale-version" | "persistence-failure";

const PROPERTY_RUNS = 200;
const PROPERTY_SEED = 10075025;
const PROPERTY_PATH = "";
const OUTCOMES: readonly FlagOutcome[] = [
  "success",
  "stale-version",
  "persistence-failure",
];

function wrapperFor(
  api: CertQuizApi,
  queryClient = createCertQuizQueryClient(),
  quizStore = createQuizStore(),
) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <CertQuizCompositionRoot
        api={api}
        queryClient={queryClient}
        quizStore={quizStore}
      >
        {children}
      </CertQuizCompositionRoot>
    );
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

async function flushMutation(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function failedSave(outcome: Exclude<FlagOutcome, "success">): CertQuizApiFailure {
  return {
    ok: false,
    error:
      outcome === "stale-version"
        ? {
            code: "stale-version",
            message: "Refresh the latest state before saving again.",
            requestId: "property-10:stale-version",
            retryable: false,
            nextAction: "Refresh and retry.",
          }
        : {
            code: "transaction-conflict",
            message: "The state could not be persisted.",
            requestId: "property-10:persistence-failure",
            retryable: true,
          },
  };
}

function practiceWithFlag(
  session: PracticeSessionDto,
  flagged: boolean,
): PracticeSessionDto {
  const question = session.questions[0];
  if (!question) throw new Error("Expected a practice question fixture.");
  return {
    ...session,
    questions: [{ ...question, flagged }, ...session.questions.slice(1)],
  };
}

function examWithFlag(session: GetExamResponse, flagged: boolean): GetExamResponse {
  if (session.kind !== "exam-active-session") {
    throw new Error("Expected an active exam fixture.");
  }
  const question = session.questions[0];
  if (!question) throw new Error("Expected an exam question fixture.");
  return {
    ...session,
    questions: [{ ...question, flagged }, ...session.questions.slice(1)],
  };
}

async function exercisePracticeFlag(
  outcome: FlagOutcome,
  initialFlagged: boolean,
): Promise<void> {
  const fixtures = createCertQuizFixtures();
  const sessionId = fixtures.ids.practiceSessionId;
  const initial = practiceWithFlag(fixtures.practice.active, initialFlagged);
  const question = initial.questions[0];
  if (!question) throw new Error("Expected a practice question fixture.");

  const queryClient = createCertQuizQueryClient();
  const quizStore = createQuizStore();
  const key = certQuizQueryKeys.practice(sessionId);
  const target = `practice:${sessionId}:${question.id}` as QuizQuestionTarget;
  queryClient.setQueryData(key, initial);
  quizStore.getState().setDraftChoiceIds(target, question.selectedChoiceIds);

  const response = deferred<CertQuizApiResult<PracticeStateResponse>>();
  let expectedVersion: number | undefined;
  const api: CertQuizApi = {
    ...createUnavailableCertQuizApi(),
    patchPracticeState: async (input) => {
      expectedVersion = input.expectedVersion;
      return response.promise;
    },
  };
  const { result, unmount } = renderHook(() => usePracticeFlagMutation(sessionId), {
    wrapper: wrapperFor(api, queryClient, quizStore),
  });

  try {
    let mutation!: Promise<PracticeStateResponse>;
    act(() => {
      mutation = result.current.mutateAsync({
        questionId: question.id,
        flagged: !initialFlagged,
      });
    });
    await flushMutation();

    expect(
      queryClient.getQueryData<PracticeSessionDto>(key)?.questions[0]?.flagged,
    ).toBe(!initialFlagged);
    expect(quizStore.getState().pendingFlags[target]).toMatchObject({
      previousFlagged: initialFlagged,
      optimisticFlagged: !initialFlagged,
    });

    if (outcome === "success") {
      const canonical = {
        practiceSessionId: sessionId,
        stateVersion: initial.stateVersion + 1,
        currentIndex: initial.currentIndex + 1,
      } satisfies PracticeStateResponse;
      response.resolve({ ok: true, data: canonical });

      await expect(mutation).resolves.toEqual(canonical);
      expect(queryClient.getQueryData<PracticeSessionDto>(key)).toMatchObject({
        stateVersion: canonical.stateVersion,
        currentIndex: canonical.currentIndex,
      });
      expect(
        queryClient.getQueryData<PracticeSessionDto>(key)?.questions[0]?.flagged,
      ).toBe(!initialFlagged);
    } else {
      response.resolve(failedSave(outcome));

      await expect(mutation).rejects.toBeInstanceOf(CertQuizRequestError);
      expect(queryClient.getQueryData<PracticeSessionDto>(key)).toEqual(initial);
      expect(quizStore.getState().draftChoiceIdsByQuestion[target]).toEqual(
        question.selectedChoiceIds,
      );
    }

    expect(expectedVersion).toBe(initial.stateVersion);
    expect(quizStore.getState().pendingFlags[target]).toBeUndefined();
  } finally {
    unmount();
    queryClient.clear();
  }
}

async function exerciseExamFlag(
  outcome: FlagOutcome,
  initialFlagged: boolean,
): Promise<void> {
  const fixtures = createCertQuizFixtures();
  const sessionId = fixtures.ids.activeExamSessionId;
  const initial = examWithFlag(fixtures.exam.active, initialFlagged);
  if (initial.kind !== "exam-active-session") {
    throw new Error("Expected an active exam fixture.");
  }
  const question = initial.questions[0];
  if (!question) throw new Error("Expected an exam question fixture.");

  const queryClient = createCertQuizQueryClient();
  const quizStore = createQuizStore();
  const key = certQuizQueryKeys.exam(sessionId);
  const target = `exam:${sessionId}:${question.id}` as QuizQuestionTarget;
  queryClient.setQueryData(key, initial);
  quizStore.getState().setDraftChoiceIds(target, question.selectedChoiceIds);

  const response = deferred<CertQuizApiResult<ExamStateResponse>>();
  let expectedVersion: number | undefined;
  const api: CertQuizApi = {
    ...createUnavailableCertQuizApi(),
    patchExamState: async (input) => {
      expectedVersion = input.expectedVersion;
      return response.promise;
    },
  };
  const { result, unmount } = renderHook(() => useExamFlagMutation(sessionId), {
    wrapper: wrapperFor(api, queryClient, quizStore),
  });

  try {
    let mutation!: Promise<ExamStateResponse>;
    act(() => {
      mutation = result.current.mutateAsync({
        questionId: question.id,
        flagged: !initialFlagged,
      });
    });
    await flushMutation();

    const optimistic = queryClient.getQueryData<GetExamResponse>(key);
    expect(optimistic?.kind).toBe("exam-active-session");
    expect(
      optimistic?.kind === "exam-active-session"
        ? optimistic.questions[0]?.flagged
        : undefined,
    ).toBe(!initialFlagged);
    expect(quizStore.getState().pendingFlags[target]).toMatchObject({
      previousFlagged: initialFlagged,
      optimisticFlagged: !initialFlagged,
    });

    if (outcome === "success") {
      const canonical = {
        examSessionId: sessionId,
        stateVersion: initial.stateVersion + 1,
        currentIndex: initial.currentIndex + 1,
        serverNow: "2026-03-02T00:00:00.000Z",
        remainingSeconds: initial.remainingSeconds - 1,
      } satisfies ExamStateResponse;
      response.resolve({ ok: true, data: canonical });

      await expect(mutation).resolves.toEqual(canonical);
      const committed = queryClient.getQueryData<GetExamResponse>(key);
      expect(committed).toMatchObject({
        kind: "exam-active-session",
        stateVersion: canonical.stateVersion,
        currentIndex: canonical.currentIndex,
        serverNow: canonical.serverNow,
        remainingSeconds: canonical.remainingSeconds,
      });
      expect(
        committed?.kind === "exam-active-session"
          ? committed.questions[0]?.flagged
          : undefined,
      ).toBe(!initialFlagged);
    } else {
      response.resolve(failedSave(outcome));

      await expect(mutation).rejects.toBeInstanceOf(CertQuizRequestError);
      expect(queryClient.getQueryData<GetExamResponse>(key)).toEqual(initial);
      expect(quizStore.getState().draftChoiceIdsByQuestion[target]).toEqual(
        question.selectedChoiceIds,
      );
    }

    expect(expectedVersion).toBe(initial.stateVersion);
    expect(quizStore.getState().pendingFlags[target]).toBeUndefined();
  } finally {
    unmount();
    queryClient.clear();
  }
}

describe("Property 10: flag versioned commit/rollback", () => {
  // **Validates: Requirements 6.7-6.12**
  it("commits canonical versions or restores optimistic flags for every mock-port outcome", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.boolean(), {
          minLength: OUTCOMES.length * 2,
          maxLength: OUTCOMES.length * 2,
        }),
        async (initialFlags) => {
          for (const [index, outcome] of OUTCOMES.entries()) {
            await exercisePracticeFlag(outcome, initialFlags[index] ?? false);
            await exerciseExamFlag(
              outcome,
              initialFlags[index + OUTCOMES.length] ?? false,
            );
          }
        },
      ),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED, path: PROPERTY_PATH },
    );
  }, 120_000);
});
