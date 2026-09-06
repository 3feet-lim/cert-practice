import type {
  ExamActiveSessionDto,
  ExamStateResponse,
  GetExamResponse,
  PatchExamStateRequest,
  PatchPracticeStateRequest,
  PracticeSessionDto,
  PracticeStateResponse,
  SubmissionPreviewDto,
  SubmitExamResponse,
  SubmitPracticeQuestionResponse,
  Uuid,
} from "@cert-quiz/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";

import { resolveCertQuizResult } from "../api/query-result";
import { useCertQuizApi } from "../api/useCertQuizApi";
import { certQuizQueryKeys } from "../app/query-keys";
import {
  type QuizQuestionTarget,
  type QuizTarget,
  useQuizStoreApi,
} from "./quiz-store";

const practiceTarget = (sessionId: Uuid): QuizTarget => `practice:${sessionId}`;
const examTarget = (sessionId: Uuid): QuizTarget => `exam:${sessionId}`;
const questionTarget = (
  sessionTarget: QuizTarget,
  questionId: Uuid,
): QuizQuestionTarget => `${sessionTarget}:${questionId}`;

class QuizCacheMissError extends Error {
  constructor(entity: string) {
    super(`${entity} must be loaded before it can be changed.`);
    this.name = "QuizCacheMissError";
  }
}

export function usePracticeSessionQuery(practiceSessionId: Uuid) {
  const api = useCertQuizApi();
  const quizStore = useQuizStoreApi();
  const query = useQuery({
    queryKey: certQuizQueryKeys.practice(practiceSessionId),
    queryFn: () => resolveCertQuizResult(api.resumePractice({ practiceSessionId })),
  });

  useEffect(() => {
    if (query.data) {
      quizStore
        .getState()
        .hydrateSession(practiceTarget(practiceSessionId), query.data.currentIndex);
    }
  }, [practiceSessionId, query.data, quizStore]);

  return query;
}

export function useExamSessionQuery(examSessionId: Uuid) {
  const api = useCertQuizApi();
  const quizStore = useQuizStoreApi();
  const query = useQuery({
    queryKey: certQuizQueryKeys.exam(examSessionId),
    queryFn: () => resolveCertQuizResult(api.getExam({ examSessionId })),
  });

  useEffect(() => {
    if (query.data?.kind === "exam-active-session") {
      quizStore
        .getState()
        .hydrateSession(examTarget(examSessionId), query.data.currentIndex);
    }
  }, [examSessionId, query.data, quizStore]);

  return query;
}

type FlagVariables = { questionId: Uuid; flagged: boolean };
type FlagMutationContext<T> = {
  previous: T;
  questionTarget: QuizQuestionTarget;
  token: number;
};

function setPracticeFlag(
  session: PracticeSessionDto,
  questionId: Uuid,
  flagged: boolean,
): PracticeSessionDto {
  return {
    ...session,
    questions: session.questions.map((question) =>
      question.id === questionId ? { ...question, flagged } : question,
    ),
  };
}

type PracticeStatePatchVariables = Pick<
  PatchPracticeStateRequest,
  "answer" | "currentIndex"
>;

export function usePracticeStatePatchMutation(practiceSessionId: Uuid) {
  const api = useCertQuizApi();
  const queryClient = useQueryClient();
  const key = certQuizQueryKeys.practice(practiceSessionId);

  return useMutation<PracticeStateResponse, Error, PracticeStatePatchVariables>({
    mutationFn: (patch) => {
      const session = queryClient.getQueryData<PracticeSessionDto>(key);
      if (!session) throw new QuizCacheMissError("Practice session");
      return resolveCertQuizResult(
        api.patchPracticeState({
          practiceSessionId,
          expectedVersion: session.stateVersion,
          ...patch,
        }),
      );
    },
    onSuccess: (canonical, patch) => {
      queryClient.setQueryData<PracticeSessionDto>(key, (session) =>
        session
          ? {
              ...session,
              stateVersion: canonical.stateVersion,
              currentIndex: canonical.currentIndex,
              questions: patch.answer
                ? session.questions.map((question) =>
                    question.id === patch.answer?.questionId
                      ? {
                          ...question,
                          selectedChoiceIds: [...patch.answer.selectedChoiceIds],
                        }
                      : question,
                  )
                : session.questions,
            }
          : session,
      );
    },
  });
}

function setExamFlag(
  session: GetExamResponse,
  questionId: Uuid,
  flagged: boolean,
): GetExamResponse {
  if (session.kind !== "exam-active-session") return session;
  return {
    ...session,
    questions: session.questions.map((question) =>
      question.id === questionId ? { ...question, flagged } : question,
    ),
  };
}

export function usePracticeFlagMutation(practiceSessionId: Uuid) {
  const api = useCertQuizApi();
  const queryClient = useQueryClient();
  const quizStore = useQuizStoreApi();
  const key = certQuizQueryKeys.practice(practiceSessionId);
  const sessionTarget = practiceTarget(practiceSessionId);

  return useMutation<
    PracticeStateResponse,
    Error,
    FlagVariables,
    FlagMutationContext<PracticeSessionDto>
  >({
    mutationFn: ({ questionId, flagged }) => {
      const session = queryClient.getQueryData<PracticeSessionDto>(key);
      if (!session) throw new QuizCacheMissError("Practice session");
      return resolveCertQuizResult(
        api.patchPracticeState({
          practiceSessionId,
          expectedVersion: session.stateVersion,
          flag: { questionId, flagged },
        }),
      );
    },
    onMutate: async ({ questionId, flagged }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<PracticeSessionDto>(key);
      if (!previous) throw new QuizCacheMissError("Practice session");
      const question = previous.questions.find(({ id }) => id === questionId);
      if (!question) throw new QuizCacheMissError("Practice question");
      const target = questionTarget(sessionTarget, questionId);
      const token = quizStore
        .getState()
        .beginFlagChange(target, question.flagged, flagged);
      queryClient.setQueryData(key, setPracticeFlag(previous, questionId, flagged));
      return { previous, questionTarget: target, token };
    },
    onSuccess: (canonical, { questionId, flagged }, context) => {
      queryClient.setQueryData<PracticeSessionDto>(key, (session) =>
        session
          ? {
              ...setPracticeFlag(session, questionId, flagged),
              stateVersion: canonical.stateVersion,
              currentIndex: canonical.currentIndex,
            }
          : session,
      );
      if (context) {
        quizStore.getState().commitFlagChange(context.questionTarget, context.token);
      }
    },
    onError: (_error, _variables, context) => {
      if (
        context &&
        quizStore.getState().isCurrentFlagChange(context.questionTarget, context.token)
      ) {
        queryClient.setQueryData(key, context.previous);
        quizStore.getState().rollbackFlagChange(context.questionTarget, context.token);
      }
    },
  });
}

type ExamStatePatchVariables = Pick<PatchExamStateRequest, "answer" | "currentIndex">;

/** Persists exam answers and navigation; the server remains the state authority. */
export function useExamStatePatchMutation(examSessionId: Uuid) {
  const api = useCertQuizApi();
  const queryClient = useQueryClient();
  const key = certQuizQueryKeys.exam(examSessionId);

  return useMutation<ExamStateResponse, Error, ExamStatePatchVariables>({
    mutationFn: (patch) => {
      const session = queryClient.getQueryData<GetExamResponse>(key);
      if (session?.kind !== "exam-active-session") {
        throw new QuizCacheMissError("Active exam session");
      }
      return resolveCertQuizResult(
        api.patchExamState({
          examSessionId,
          expectedVersion: session.stateVersion,
          ...patch,
        }),
      );
    },
    onSuccess: (canonical, patch) => {
      queryClient.setQueryData<GetExamResponse>(key, (session) =>
        session?.kind === "exam-active-session"
          ? {
              ...session,
              stateVersion: canonical.stateVersion,
              currentIndex: canonical.currentIndex,
              serverNow: canonical.serverNow,
              remainingSeconds: canonical.remainingSeconds,
              questions: patch.answer
                ? session.questions.map((question) =>
                    question.id === patch.answer?.questionId
                      ? {
                          ...question,
                          selectedChoiceIds: [...patch.answer.selectedChoiceIds],
                        }
                      : question,
                  )
                : session.questions,
            }
          : session,
      );
    },
  });
}

/** Fetches authoritative counts immediately before the user confirms submission. */
export function useExamSubmissionPreview(examSessionId: Uuid) {
  const api = useCertQuizApi();
  const queryClient = useQueryClient();

  return useMutation<SubmissionPreviewDto>({
    mutationFn: () =>
      resolveCertQuizResult(api.getExamSubmissionPreview({ examSessionId })),
    onSuccess: (preview) => {
      queryClient.setQueryData(certQuizQueryKeys.examPreview(examSessionId), preview);
    },
  });
}

export function useExamFlagMutation(examSessionId: Uuid) {
  const api = useCertQuizApi();
  const queryClient = useQueryClient();
  const quizStore = useQuizStoreApi();
  const key = certQuizQueryKeys.exam(examSessionId);
  const sessionTarget = examTarget(examSessionId);

  return useMutation({
    mutationFn: ({ questionId, flagged }: FlagVariables) => {
      const session = queryClient.getQueryData<GetExamResponse>(key);
      if (session?.kind !== "exam-active-session") {
        throw new QuizCacheMissError("Active exam session");
      }
      return resolveCertQuizResult(
        api.patchExamState({
          examSessionId,
          expectedVersion: session.stateVersion,
          flag: { questionId, flagged },
        }),
      );
    },
    onMutate: async ({ questionId, flagged }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<GetExamResponse>(key);
      if (previous?.kind !== "exam-active-session") {
        throw new QuizCacheMissError("Active exam session");
      }
      const question = previous.questions.find(({ id }) => id === questionId);
      if (!question) throw new QuizCacheMissError("Exam question");
      const target = questionTarget(sessionTarget, questionId);
      const token = quizStore
        .getState()
        .beginFlagChange(target, question.flagged, flagged);
      queryClient.setQueryData(key, setExamFlag(previous, questionId, flagged));
      return { previous, questionTarget: target, token };
    },
    onSuccess: (canonical, { questionId, flagged }, context) => {
      queryClient.setQueryData<GetExamResponse>(key, (session) => {
        const updated = session ? setExamFlag(session, questionId, flagged) : session;
        return updated?.kind === "exam-active-session"
          ? {
              ...updated,
              stateVersion: canonical.stateVersion,
              currentIndex: canonical.currentIndex,
              serverNow: canonical.serverNow,
              remainingSeconds: canonical.remainingSeconds,
            }
          : updated;
      });
      if (context) {
        quizStore.getState().commitFlagChange(context.questionTarget, context.token);
      }
    },
    onError: (_error, _variables, context) => {
      if (
        context &&
        quizStore.getState().isCurrentFlagChange(context.questionTarget, context.token)
      ) {
        queryClient.setQueryData(key, context.previous);
        quizStore.getState().rollbackFlagChange(context.questionTarget, context.token);
      }
    },
  });
}

type PracticeSubmitInput = { questionId: Uuid; selectedChoiceIds: Uuid[] };

export function usePracticeQuestionSubmit(practiceSessionId: Uuid) {
  const api = useCertQuizApi();
  const queryClient = useQueryClient();
  const quizStore = useQuizStoreApi();
  const key = certQuizQueryKeys.practice(practiceSessionId);
  const sessionTarget = practiceTarget(practiceSessionId);

  const mutation = useMutation<
    SubmitPracticeQuestionResponse,
    Error,
    PracticeSubmitInput & { expectedVersion: number }
  >({
    mutationFn: ({ questionId, selectedChoiceIds, expectedVersion }) =>
      resolveCertQuizResult(
        api.submitPracticeQuestion({
          practiceSessionId,
          questionId,
          expectedVersion,
          selectedChoiceIds,
        }),
      ),
    onSuccess: (canonical) => {
      queryClient.setQueryData<PracticeSessionDto>(key, (session) =>
        session
          ? {
              ...session,
              stateVersion: canonical.stateVersion,
              questions: session.questions.map((question) =>
                question.id === canonical.question.id ? canonical.question : question,
              ),
            }
          : session,
      );
      quizStore
        .getState()
        .setDraftChoiceIds(
          questionTarget(sessionTarget, canonical.question.id),
          canonical.question.selectedChoiceIds,
        );
    },
  });

  const submit = useCallback(
    async ({ questionId, selectedChoiceIds }: PracticeSubmitInput) => {
      const target = questionTarget(sessionTarget, questionId);
      const state = quizStore.getState();
      state.setDraftChoiceIds(target, selectedChoiceIds);
      if (!state.acquireSubmitLock(target)) return undefined;

      try {
        const session = queryClient.getQueryData<PracticeSessionDto>(key);
        if (!session) throw new QuizCacheMissError("Practice session");
        return await mutation.mutateAsync({
          questionId,
          selectedChoiceIds,
          expectedVersion: session.stateVersion,
        });
      } finally {
        quizStore.getState().releaseSubmitLock(target);
      }
    },
    [key, mutation, queryClient, quizStore, sessionTarget],
  );

  return { ...mutation, submit };
}

export function useExamSubmit(examSessionId: Uuid) {
  const api = useCertQuizApi();
  const queryClient = useQueryClient();
  const quizStore = useQuizStoreApi();
  const key = certQuizQueryKeys.exam(examSessionId);
  const target = examTarget(examSessionId);

  const mutation = useMutation<SubmitExamResponse>({
    mutationFn: () => resolveCertQuizResult(api.submitExam({ examSessionId })),
    onSuccess: (canonical) => {
      queryClient.setQueryData(
        certQuizQueryKeys.attempt(canonical.attemptId),
        canonical,
      );
      queryClient.setQueryData<GetExamResponse>(key, {
        kind: "exam-finalized",
        examSessionId,
        attemptId: canonical.attemptId,
      });
    },
  });

  const submit = useCallback(async () => {
    const state = quizStore.getState();
    if (!state.acquireSubmitLock(target)) return undefined;
    try {
      return await mutation.mutateAsync();
    } finally {
      quizStore.getState().releaseSubmitLock(target);
    }
  }, [mutation, quizStore, target]);

  return { ...mutation, submit };
}

export function isActiveExam(
  session: GetExamResponse | undefined,
): session is ExamActiveSessionDto {
  return session?.kind === "exam-active-session";
}
