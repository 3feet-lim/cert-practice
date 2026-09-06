// Feature: cert-quiz-mvp, Property 25
import type {
  PracticeSessionDto,
  PracticeStateResponse,
  SubmitPracticeQuestionResponse,
} from "@cert-quiz/contracts";
import { act, renderHook } from "@testing-library/react";
import fc from "fast-check";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  type CertQuizApi,
  type CertQuizApiFailure,
  type CertQuizApiResult,
} from "../api/port";
import { CertQuizRequestError } from "../api/query-result";
import { createUnavailableCertQuizApi } from "../api/unavailable-adapter";
import { CertQuizCompositionRoot } from "../app/CertQuizCompositionRoot";
import { createCertQuizQueryClient } from "../app/query-client";
import { certQuizQueryKeys } from "../app/query-keys";
import {
  toMutationAsyncBoundaryState,
  toQueryAsyncBoundaryState,
} from "../components/async-boundary-state";
import { createCertQuizFixtures } from "../mocks/fixtures";
import { createQuizStore, type QuizQuestionTarget } from "./quiz-store";
import { usePracticeFlagMutation, usePracticeQuestionSubmit } from "./quiz-queries";

type RequestOutcome =
  "success" | "retryable-failure" | "non-retryable-failure" | "duplicate";

const PROPERTY_RUNS = 200;
const PROPERTY_SEED = 25053025;
const PROPERTY_PATH = "";

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

function failure(retryable: boolean): CertQuizApiFailure {
  return {
    ok: false,
    error: retryable
      ? {
          code: "dependency-unavailable",
          message: "잠시 후 다시 시도해 주세요.",
          requestId: "property-25:retryable",
          retryable: true,
        }
      : {
          code: "answer-locked",
          message: "이미 제출된 답안입니다.",
          requestId: "property-25:next-action",
          retryable: false,
          nextAction: "결과를 확인하세요.",
        },
  };
}

function assertBoundaryState(outcome: RequestOutcome) {
  const retry = vi.fn();
  const nextAction = vi.fn();
  const rightRequest = toQueryAsyncBoundaryState(
    {
      isPending: true,
      isError: false,
      data: undefined,
      error: null,
      refetch: vi.fn(),
    },
    { nextAction: { label: "학습 홈으로 이동", onAction: nextAction } },
  );
  expect(rightRequest).toEqual({ status: "loading", label: undefined });

  if (outcome === "success") {
    const completedRequest = toQueryAsyncBoundaryState(
      {
        isPending: false,
        isError: false,
        data: ["catalog"],
        error: null,
        refetch: vi.fn(),
      },
      { nextAction: { label: "학습 홈으로 이동", onAction: nextAction } },
    );
    expect(completedRequest).toEqual({ status: "success", data: ["catalog"] });
    return;
  }

  if (outcome === "duplicate") {
    const firstSubmission = toMutationAsyncBoundaryState(
      { isPending: true, isError: false, data: undefined, error: null },
      {
        nextAction: { label: "학습 홈으로 이동", onAction: nextAction },
        retry: { onRetry: retry },
      },
    );
    expect(firstSubmission).toEqual({ status: "loading", label: undefined });
    return;
  }

  const requestError = new CertQuizRequestError(
    failure(outcome === "retryable-failure").error,
  );
  const state = toMutationAsyncBoundaryState(
    { isPending: false, isError: true, data: undefined, error: requestError },
    {
      nextAction: { label: "학습 홈으로 이동", onAction: nextAction },
      retry: { onRetry: retry },
    },
  );

  expect(state.status).toBe("error");
  if (outcome === "retryable-failure") {
    expect(state).toMatchObject({
      retryable: true,
      message: requestError.detail.message,
    });
    if (state.status === "error" && state.retryable) state.retry.onRetry();
    expect(retry).toHaveBeenCalledOnce();
    expect(nextAction).not.toHaveBeenCalled();
  } else {
    expect(state).toMatchObject({
      retryable: false,
      message: requestError.detail.message,
    });
    if (state.status === "error" && !state.retryable) state.nextAction.onAction();
    expect(nextAction).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  }
}

describe("Property 25: asynchronous UI request-state machine", () => {
  // Seed and empty replay path make any generated failure reproducible with Vitest output.
  it("keeps request states, drafts, retries, and canonical results isolated across generated outcomes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.constantFrom<RequestOutcome>(
            "success",
            "retryable-failure",
            "non-retryable-failure",
            "duplicate",
          ),
          { minLength: 1, maxLength: 12 },
        ),
        async (outcomes) => {
          const fixtures = createCertQuizFixtures();
          const sessionId = fixtures.ids.practiceSessionId;
          const submittedQuestion = fixtures.practice.submitted.questions[0];
          if (submittedQuestion?.kind !== "practice-submitted") {
            throw new Error("Expected a submitted practice question fixture.");
          }

          const queryClient = createCertQuizQueryClient();
          const quizStore = createQuizStore();
          queryClient.setQueryData(
            certQuizQueryKeys.practice(sessionId),
            fixtures.practice.active,
          );
          const target =
            `practice:${sessionId}:${submittedQuestion.id}` as QuizQuestionTarget;
          const selectedChoiceIds = submittedQuestion.selectedChoiceIds;
          let canonicalVersion = fixtures.practice.active.stateVersion;
          let submitResponse: () => Promise<
            CertQuizApiResult<SubmitPracticeQuestionResponse>
          >;
          let flagResponse: () => Promise<CertQuizApiResult<PracticeStateResponse>>;
          const submitPracticeQuestion = vi.fn<CertQuizApi["submitPracticeQuestion"]>(
            () => submitResponse(),
          );
          const patchPracticeState = vi.fn<CertQuizApi["patchPracticeState"]>(() =>
            flagResponse(),
          );
          const api: CertQuizApi = {
            ...createUnavailableCertQuizApi(),
            submitPracticeQuestion,
            patchPracticeState,
          };
          const { result, unmount } = renderHook(
            () => ({
              submit: usePracticeQuestionSubmit(sessionId),
              flag: usePracticeFlagMutation(sessionId),
            }),
            { wrapper: wrapperFor(api, queryClient, quizStore) },
          );

          try {
            for (const outcome of outcomes) {
              assertBoundaryState(outcome);
              const beforeSubmitCalls = submitPracticeQuestion.mock.calls.length;
              const beforeSubmit = queryClient.getQueryData<PracticeSessionDto>(
                certQuizQueryKeys.practice(sessionId),
              );

              if (outcome === "duplicate") {
                const pending =
                  deferred<CertQuizApiResult<SubmitPracticeQuestionResponse>>();
                submitResponse = () => pending.promise;
                let first!: Promise<SubmitPracticeQuestionResponse | undefined>;
                let duplicate!: Promise<SubmitPracticeQuestionResponse | undefined>;
                act(() => {
                  first = result.current.submit.submit({
                    questionId: submittedQuestion.id,
                    selectedChoiceIds,
                  });
                  duplicate = result.current.submit.submit({
                    questionId: submittedQuestion.id,
                    selectedChoiceIds,
                  });
                });

                expect(quizStore.getState().submittingTargets[target]).toBe(true);
                await expect(duplicate).resolves.toBeUndefined();
                expect(submitPracticeQuestion.mock.calls.length).toBe(
                  beforeSubmitCalls + 1,
                );
                canonicalVersion += 1;
                pending.resolve({
                  ok: true,
                  data: {
                    practiceSessionId: sessionId,
                    stateVersion: canonicalVersion,
                    question: submittedQuestion,
                  },
                });
                await expect(first).resolves.toMatchObject({
                  stateVersion: canonicalVersion,
                });
              } else {
                const nextSubmissionVersion = canonicalVersion + 1;
                if (outcome === "success") canonicalVersion = nextSubmissionVersion;
                submitResponse = () =>
                  Promise.resolve(
                    outcome === "success"
                      ? {
                          ok: true as const,
                          data: {
                            practiceSessionId: sessionId,
                            stateVersion: nextSubmissionVersion,
                            question: submittedQuestion,
                          },
                        }
                      : failure(outcome === "retryable-failure"),
                  );
                let submission!: Promise<SubmitPracticeQuestionResponse | undefined>;
                act(() => {
                  submission = result.current.submit.submit({
                    questionId: submittedQuestion.id,
                    selectedChoiceIds,
                  });
                });

                if (outcome === "success") {
                  await expect(submission).resolves.toMatchObject({
                    stateVersion: canonicalVersion,
                  });
                } else {
                  await expect(submission).rejects.toBeInstanceOf(CertQuizRequestError);
                  expect(
                    queryClient.getQueryData<PracticeSessionDto>(
                      certQuizQueryKeys.practice(sessionId),
                    ),
                  ).toEqual(beforeSubmit);
                  expect(quizStore.getState().draftChoiceIdsByQuestion[target]).toEqual(
                    selectedChoiceIds,
                  );
                }
              }

              expect(quizStore.getState().submittingTargets[target]).toBeUndefined();
              const reconciled = queryClient.getQueryData<PracticeSessionDto>(
                certQuizQueryKeys.practice(sessionId),
              );
              expect(reconciled?.stateVersion).toBe(canonicalVersion);
              if (outcome === "success" || outcome === "duplicate") {
                expect(
                  reconciled?.questions.find(({ id }) => id === submittedQuestion.id),
                ).toEqual(submittedQuestion);
              } else {
                expect(reconciled).toEqual(beforeSubmit);
              }
              expect(submitPracticeQuestion.mock.calls.length).toBe(
                beforeSubmitCalls + 1,
              );

              const beforeFlag = queryClient.getQueryData<PracticeSessionDto>(
                certQuizQueryKeys.practice(sessionId),
              );
              if (!beforeFlag) throw new Error("Expected cached practice session.");
              const expectedFlagged = !beforeFlag.questions[0]?.flagged;
              const nextFlagVersion = canonicalVersion + 1;
              if (outcome === "success" || outcome === "duplicate") {
                canonicalVersion = nextFlagVersion;
              }
              flagResponse = () =>
                Promise.resolve(
                  outcome === "success" || outcome === "duplicate"
                    ? {
                        ok: true as const,
                        data: {
                          practiceSessionId: sessionId,
                          stateVersion: nextFlagVersion,
                          currentIndex: 8,
                        },
                      }
                    : failure(outcome === "retryable-failure"),
                );
              let flagMutation!: Promise<PracticeStateResponse>;
              act(() => {
                flagMutation = result.current.flag.mutateAsync({
                  questionId: submittedQuestion.id,
                  flagged: expectedFlagged,
                });
              });

              if (outcome === "success" || outcome === "duplicate") {
                await expect(flagMutation).resolves.toMatchObject({
                  stateVersion: canonicalVersion,
                  currentIndex: 8,
                });
                const committed = queryClient.getQueryData<PracticeSessionDto>(
                  certQuizQueryKeys.practice(sessionId),
                );
                expect(committed).toMatchObject({
                  stateVersion: canonicalVersion,
                  currentIndex: 8,
                });
                expect(
                  committed?.questions.find(({ id }) => id === submittedQuestion.id)
                    ?.flagged,
                ).toBe(expectedFlagged);
              } else {
                await expect(flagMutation).rejects.toBeInstanceOf(CertQuizRequestError);
                expect(
                  queryClient.getQueryData<PracticeSessionDto>(
                    certQuizQueryKeys.practice(sessionId),
                  ),
                ).toEqual(beforeFlag);
                expect(quizStore.getState().draftChoiceIdsByQuestion[target]).toEqual(
                  selectedChoiceIds,
                );
              }
              expect(quizStore.getState().pendingFlags[target]).toBeUndefined();
            }
          } finally {
            unmount();
            queryClient.clear();
          }
        },
      ),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED, path: PROPERTY_PATH },
    );
  }, 120_000);
});
