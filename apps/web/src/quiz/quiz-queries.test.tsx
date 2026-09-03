import type {
  ApprovalStatusDto,
  CatalogDto,
  PracticeSessionDto,
  PracticeStateResponse,
  SubmitPracticeQuestionResponse,
} from "@cert-quiz/contracts";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it, vi } from "vitest";

import type { CertQuizApi, CertQuizApiResult } from "../api/port";
import { useApprovalStatusQuery, useCatalogQuery } from "../api/queries";
import { createUnavailableCertQuizApi } from "../api/unavailable-adapter";
import { CertQuizCompositionRoot } from "../app/CertQuizCompositionRoot";
import { createCertQuizQueryClient, purgeCertQuizSession } from "../app/query-client";
import { certQuizQueryKeys } from "../app/query-keys";
import { createCertQuizFixtures } from "../mocks/fixtures";
import { createQuizStore, type QuizQuestionTarget } from "./quiz-store";
import {
  usePracticeFlagMutation,
  usePracticeQuestionSubmit,
} from "./quiz-queries";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

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

const retryableFailure = {
  ok: false as const,
  error: {
    code: "dependency-unavailable" as const,
    message: "Try later.",
    requestId: "request-query-test",
    retryable: true,
  },
};

describe("TanStack Query API state", () => {
  it("tracks independent loading and error state for concurrent queries", async () => {
    const pendingApproval = deferred<CertQuizApiResult<ApprovalStatusDto>>();
    const api: CertQuizApi = {
      ...createUnavailableCertQuizApi(),
      getApprovalStatus: vi.fn(() => pendingApproval.promise),
      getCatalog: vi.fn(async (): Promise<CertQuizApiResult<CatalogDto>> => retryableFailure),
    };

    const { result } = renderHook(
      () => ({ approval: useApprovalStatusQuery(), catalog: useCatalogQuery() }),
      { wrapper: wrapperFor(api) },
    );

    await waitFor(() => expect(result.current.catalog.isError).toBe(true));
    expect(result.current.approval.isPending).toBe(true);
    expect(result.current.catalog.isPending).toBe(false);

    pendingApproval.resolve({
      ok: true,
      data: { approvalStatus: "approved" },
    });
    await waitFor(() => expect(result.current.approval.isSuccess).toBe(true));
    expect(result.current.catalog.isError).toBe(true);
  });

  it("reconciles successful flag mutations and rolls failed mutations back without losing input", async () => {
    const fixtures = createCertQuizFixtures();
    const sessionId = fixtures.ids.practiceSessionId;
    const question = fixtures.practice.active.questions[0];
    if (!question) throw new Error("Expected a practice question fixture.");

    const queryClient = createCertQuizQueryClient();
    const quizStore = createQuizStore();
    queryClient.setQueryData(
      certQuizQueryKeys.practice(sessionId),
      fixtures.practice.active,
    );
    const questionTarget = `practice:${sessionId}:${question.id}` as QuizQuestionTarget;
    quizStore.getState().setDraftChoiceIds(questionTarget, question.selectedChoiceIds);

    const patchPracticeState = vi
      .fn<CertQuizApi["patchPracticeState"]>()
      .mockResolvedValueOnce({
        ok: true,
        data: {
          practiceSessionId: sessionId,
          stateVersion: 13,
          currentIndex: 8,
        } satisfies PracticeStateResponse,
      })
      .mockResolvedValueOnce(retryableFailure);
    const api: CertQuizApi = {
      ...createUnavailableCertQuizApi(),
      patchPracticeState,
    };
    const { result } = renderHook(() => usePracticeFlagMutation(sessionId), {
      wrapper: wrapperFor(api, queryClient, quizStore),
    });

    act(() => result.current.mutate({ questionId: question.id, flagged: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const committed = queryClient.getQueryData<PracticeSessionDto>(
      certQuizQueryKeys.practice(sessionId),
    );
    expect(committed?.stateVersion).toBe(13);
    expect(committed?.currentIndex).toBe(8);
    expect(committed?.questions[0]?.flagged).toBe(true);

    act(() => result.current.mutate({ questionId: question.id, flagged: false }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    const rolledBack = queryClient.getQueryData<PracticeSessionDto>(
      certQuizQueryKeys.practice(sessionId),
    );
    expect(rolledBack?.questions[0]?.flagged).toBe(true);
    expect(rolledBack?.stateVersion).toBe(13);
    expect(quizStore.getState().draftChoiceIdsByQuestion[questionTarget]).toEqual(
      question.selectedChoiceIds,
    );
    expect(quizStore.getState().pendingFlags[questionTarget]).toBeUndefined();
  });

  it("locks duplicate question submits and applies the one canonical result", async () => {
    const fixtures = createCertQuizFixtures();
    const sessionId = fixtures.ids.practiceSessionId;
    const submittedQuestion = fixtures.practice.submitted.questions[0];
    if (submittedQuestion?.kind !== "practice-submitted") {
      throw new Error("Expected a submitted practice question fixture.");
    }
    const selectedChoiceIds = submittedQuestion.selectedChoiceIds;
    const pendingSubmit = deferred<CertQuizApiResult<SubmitPracticeQuestionResponse>>();
    const submitPracticeQuestion = vi.fn(() => pendingSubmit.promise);
    const api: CertQuizApi = {
      ...createUnavailableCertQuizApi(),
      submitPracticeQuestion,
    };
    const queryClient = createCertQuizQueryClient();
    queryClient.setQueryData(
      certQuizQueryKeys.practice(sessionId),
      fixtures.practice.active,
    );
    const quizStore = createQuizStore();
    const { result } = renderHook(() => usePracticeQuestionSubmit(sessionId), {
      wrapper: wrapperFor(api, queryClient, quizStore),
    });

    let first!: Promise<SubmitPracticeQuestionResponse | undefined>;
    let duplicate!: Promise<SubmitPracticeQuestionResponse | undefined>;
    act(() => {
      first = result.current.submit({
        questionId: submittedQuestion.id,
        selectedChoiceIds,
      });
      duplicate = result.current.submit({
        questionId: submittedQuestion.id,
        selectedChoiceIds,
      });
    });

    await expect(duplicate).resolves.toBeUndefined();
    expect(submitPracticeQuestion).toHaveBeenCalledOnce();
    pendingSubmit.resolve({
      ok: true,
      data: {
        practiceSessionId: sessionId,
        stateVersion: 13,
        question: submittedQuestion,
      },
    });
    await expect(first).resolves.toMatchObject({ stateVersion: 13 });

    const canonical = queryClient.getQueryData<PracticeSessionDto>(
      certQuizQueryKeys.practice(sessionId),
    );
    expect(canonical?.stateVersion).toBe(13);
    expect(canonical?.questions[0]?.kind).toBe("practice-submitted");
    expect(submitPracticeQuestion).toHaveBeenCalledOnce();
  });

  it("purges all CertQuiz query and transient state on logout", async () => {
    const fixtures = createCertQuizFixtures();
    const queryClient = createCertQuizQueryClient();
    const quizStore = createQuizStore();
    queryClient.setQueryData(certQuizQueryKeys.catalog(), fixtures.catalog.valid);
    queryClient.setQueryData(
      certQuizQueryKeys.practice(fixtures.ids.practiceSessionId),
      fixtures.practice.active,
    );
    const question = fixtures.practice.active.questions[0];
    if (!question) throw new Error("Expected a practice question fixture.");
    const target =
      `practice:${fixtures.ids.practiceSessionId}:${question.id}` as QuizQuestionTarget;
    quizStore.getState().setDraftChoiceIds(target, question.selectedChoiceIds);
    quizStore.getState().acquireSubmitLock(target);

    await purgeCertQuizSession(queryClient, quizStore);

    expect(queryClient.getQueryCache().findAll({ queryKey: certQuizQueryKeys.all })).toEqual(
      [],
    );
    expect(quizStore.getState().draftChoiceIdsByQuestion).toEqual({});
    expect(quizStore.getState().submittingTargets).toEqual({});
  });
});
