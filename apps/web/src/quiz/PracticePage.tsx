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
import { quizErrorMessage } from "./quiz-error-messages";
import { QuizQuestionPresenter } from "./QuizQuestionPresenter";
import { questionTarget } from "./quiz-presentation";
import { type QuizTarget, useQuizStore } from "./quiz-store";
import { useDocumentTitle } from "../lib/use-document-title";

function errorMessage(error: unknown): string {
  return quizErrorMessage(error, "연습 상태를 저장하지 못했습니다.");
}

function PracticeProgress({
  session,
  sessionTarget,
}: {
  session: PracticeSessionDto;
  sessionTarget: QuizTarget;
}) {
  const drafts = useQuizStore((state) => state.draftChoiceIdsByQuestion);
  const storedIndex = useQuizStore(
    (state) => state.currentIndexBySession[sessionTarget],
  );
  const total = session.questions.length;
  const currentNumber = Math.min((storedIndex ?? session.currentIndex) + 1, total);
  let answered = 0;
  let submitted = 0;
  for (const question of session.questions) {
    if (question.kind === "practice-submitted") {
      submitted += 1;
      continue;
    }
    const selected =
      drafts[questionTarget(sessionTarget, question.id)] ?? question.selectedChoiceIds;
    if (selected.length === question.requiredChoiceCount) answered += 1;
  }
  const percent = Math.round((submitted / total) * 100);

  return (
    <div className="mb-6 rounded-xl border border-border bg-muted/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm font-semibold text-foreground">
          <span className="mr-2 inline-flex rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
            {session.certificationCode}
          </span>
          {session.certificationName}
        </p>
        <p className="text-sm tabular-nums text-muted-foreground">
          <strong className="text-foreground">
            {currentNumber} / {total}
          </strong>{" "}
          · 제출 {submitted}개 · 답 선택 {answered}개
        </p>
      </div>
      <div
        aria-label="제출 진행률"
        aria-valuemax={total}
        aria-valuemin={0}
        aria-valuenow={submitted}
        className="mt-3 h-2 overflow-hidden rounded-full bg-border"
        role="progressbar"
      >
        <div
          className="h-full rounded-full bg-success"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
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

  const sessionTarget: QuizTarget = `practice:${practiceSessionId}`;

  return (
    <>
      <PracticeProgress session={session} sessionTarget={sessionTarget} />
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
        sessionTarget={sessionTarget}
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
  useDocumentTitle(
    sessionQuery.data ? `연습 · ${sessionQuery.data.certificationCode}` : "연습",
  );
  const state = toQueryAsyncBoundaryState(sessionQuery, {
    loadingLabel: "연습 세션을 불러오는 중입니다.",
    nextAction: {
      label: "학습 홈으로 이동",
      onAction: () => navigate("/app"),
    },
  });

  return (
    <section className="content-card" aria-labelledby="practice-title" data-screen="S4">
      <h1 id="practice-title" className="text-2xl font-bold tracking-tight">
        연습 모드
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
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
