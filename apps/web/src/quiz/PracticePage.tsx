import type { PracticeSessionDto, Uuid } from "@cert-quiz/contracts";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AsyncBoundary } from "../components/AsyncBoundary";
import { toQueryAsyncBoundaryState } from "../components/async-boundary-state";
import {
  usePracticeFlagMutation,
  usePracticeQuestionSubmit,
  usePracticeSessionQuery,
  usePracticeStatePatchMutation,
} from "./quiz-queries";
import { QuizQuestionPresenter } from "./QuizQuestionPresenter";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "연습 상태를 저장하지 못했습니다.";
}

function PracticeInteraction({
  practiceSessionId,
  session,
}: {
  practiceSessionId: Uuid;
  session: PracticeSessionDto;
}) {
  const navigate = useNavigate();
  const flagMutation = usePracticeFlagMutation(practiceSessionId);
  const stateMutation = usePracticeStatePatchMutation(practiceSessionId);
  const {
    submit,
    data: submittedResult,
    isPending: submitPending,
  } = usePracticeQuestionSubmit(practiceSessionId);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (submittedResult?.completedPracticeResultId) {
      navigate(`/app/practice-results/${submittedResult.completedPracticeResultId}`);
    }
  }, [navigate, submittedResult?.completedPracticeResultId]);

  const showError = (error: unknown) => {
    setRequestError(errorMessage(error));
  };

  return (
    <>
      {requestError ? (
        <section
          className="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4"
          role="alert"
        >
          {requestError}
        </section>
      ) : null}
      <QuizQuestionPresenter
        initialIndex={session.currentIndex}
        onAnswerChange={(questionId, selectedChoiceIds) => {
          setRequestError(null);
          stateMutation.mutate(
            { answer: { questionId, selectedChoiceIds } },
            { onError: showError },
          );
        }}
        onFlagChange={(questionId, flagged) => {
          setRequestError(null);
          flagMutation.mutate({ questionId, flagged }, { onError: showError });
        }}
        onNavigate={(currentIndex) => {
          setRequestError(null);
          stateMutation.mutate({ currentIndex }, { onError: showError });
        }}
        onSubmit={(questionId, selectedChoiceIds) => {
          setRequestError(null);
          void submit({ questionId, selectedChoiceIds }).catch(showError);
        }}
        questions={session.questions}
        sessionTarget={`practice:${practiceSessionId}`}
        submitPending={
          submitPending || stateMutation.isPending || flagMutation.isPending
        }
      />
    </>
  );
}

export function PracticePage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const practiceSessionId = sessionId as Uuid;
  const sessionQuery = usePracticeSessionQuery(practiceSessionId);
  const state = toQueryAsyncBoundaryState(sessionQuery, {
    loadingLabel: "연습 세션을 불러오는 중입니다.",
    nextAction: {
      label: "학습 홈으로 이동",
      onAction: () => navigate("/app"),
    },
  });

  return (
    <section className="welcome-card" aria-labelledby="practice-title" data-screen="S4">
      <p className="eyebrow">S4 · PRACTICE</p>
      <h1 id="practice-title">연습 모드</h1>
      <p className="description">
        답변은 초안으로 저장되며, 제출 후에만 정답과 해설을 확인할 수 있습니다.
      </p>
      <div className="mt-6">
        <AsyncBoundary state={state}>
          {(session) => (
            <PracticeInteraction
              practiceSessionId={practiceSessionId}
              session={session}
            />
          )}
        </AsyncBoundary>
      </div>
    </section>
  );
}
