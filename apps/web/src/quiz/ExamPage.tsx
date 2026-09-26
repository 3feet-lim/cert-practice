import type { ExamActiveSessionDto, Uuid } from "@cert-quiz/contracts";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { CertQuizRequestError } from "../api/query-result";
import { useDocumentTitle } from "../lib/use-document-title";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { toQueryAsyncBoundaryState } from "../components/async-boundary-state";
import { Button } from "../components/ui/Button";
import { ServerTimer } from "./ServerTimer";
import {
  isActiveExam,
  useExamFlagMutation,
  useExamSessionQuery,
  useExamStatePatchMutation,
  useExamSubmissionPreview,
  useExamSubmit,
} from "./quiz-queries";
import { quizErrorMessage } from "./quiz-error-messages";
import { questionTarget } from "./quiz-presentation";
import { QuizQuestionPresenter } from "./QuizQuestionPresenter";
import { useQuizStore } from "./quiz-store";
import { useLeaveWarning } from "./use-quiz-shortcuts";

function errorMessage(error: unknown): string {
  return quizErrorMessage(error, "모의고사 상태를 저장하지 못했습니다.");
}

function ExamInteraction({
  examSessionId,
  session,
}: {
  examSessionId: Uuid;
  session: ExamActiveSessionDto;
}) {
  const navigate = useNavigate();
  const flagMutation = useExamFlagMutation(examSessionId);
  const stateMutation = useExamStatePatchMutation(examSessionId);
  const previewMutation = useExamSubmissionPreview(examSessionId);
  const { submit, isPending: submitPending } = useExamSubmit(examSessionId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const interactionPending =
    expired || stateMutation.isPending || flagMutation.isPending || submitPending;
  const sessionTarget = `exam:${examSessionId}` as const;
  const drafts = useQuizStore((state) => state.draftChoiceIdsByQuestion);
  const answeredCount = session.questions.filter((question) => {
    const selected =
      drafts[questionTarget(sessionTarget, question.id)] ?? question.selectedChoiceIds;
    return selected.length === question.requiredChoiceCount;
  }).length;
  const flaggedCount = session.questions.filter((question) => question.flagged).length;
  const totalCount = session.questions.length;
  useLeaveWarning(!expired && !submitPending);

  const submitAndNavigate = async () => {
    try {
      const result = await submit();
      if (result) navigate(`/app/attempts/${result.attemptId}`, { replace: true });
    } catch (error) {
      setRequestError(errorMessage(error));
    }
  };

  const handleMutationError = (error: unknown) => {
    if (error instanceof CertQuizRequestError && error.detail.code === "exam-expired") {
      setExpired(true);
      void submitAndNavigate();
      return;
    }
    setRequestError(errorMessage(error));
  };

  const openPreview = (open: boolean) => {
    setDialogOpen(open);
    if (open) {
      setRequestError(null);
      previewMutation.mutate(undefined, { onError: handleMutationError });
    }
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
      <div className="mb-6 grid gap-4 rounded-xl border border-border bg-card p-4 shadow-card sm:p-5 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-center">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-muted-foreground">
            {session.certificationCode}
          </p>
          <h2 className="truncate text-lg font-bold sm:text-xl">
            {session.certificationName}
          </h2>
          <dl
            aria-label="진행 현황"
            className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums text-muted-foreground"
          >
            <div className="flex gap-1">
              <dt>응답</dt>
              <dd className="font-bold text-foreground">
                {answeredCount}/{totalCount}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>미응답</dt>
              <dd
                className={
                  totalCount - answeredCount > 0
                    ? "font-bold text-danger"
                    : "font-bold text-foreground"
                }
              >
                {totalCount - answeredCount}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>나중에 보기</dt>
              <dd className="font-bold text-warning">{flaggedCount}</dd>
            </div>
          </dl>
          <div
            aria-hidden="true"
            className="mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-border"
          >
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${Math.round((answeredCount / totalCount) * 100)}%` }}
            />
          </div>
        </div>
        <div className="md:text-right">
          <p className="text-sm text-muted-foreground">서버 기준 남은 시간</p>
          <ServerTimer
            expiresAt={session.expiresAt}
            onExpire={() => {
              setExpired(true);
              void submitAndNavigate();
            }}
            serverNow={session.serverNow}
          />
        </div>
        <div>
          <AccessibleDialog
            confirmAction={{
              label: submitPending ? "제출 중..." : "제출 확정",
              disabled:
                previewMutation.isPending ||
                previewMutation.data === undefined ||
                submitPending,
              onConfirm: () => void submitAndNavigate(),
            }}
            description="제출 후 정답과 해설은 결과 화면에서만 확인할 수 있습니다."
            onOpenChange={openPreview}
            open={dialogOpen}
            title="모의고사를 제출하시겠습니까?"
            trigger={<Button disabled={interactionPending}>제출 미리보기</Button>}
          >
            {previewMutation.isPending ? (
              <p role="status">제출 현황을 확인하는 중입니다.</p>
            ) : previewMutation.data ? (
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-muted-foreground">미응답</dt>
                  <dd className="text-2xl font-bold">
                    {previewMutation.data.unansweredQuestionCount}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">나중에 보기</dt>
                  <dd className="text-2xl font-bold">
                    {previewMutation.data.flaggedQuestionCount}
                  </dd>
                </div>
              </dl>
            ) : (
              <p>제출 현황을 불러오지 못했습니다.</p>
            )}
          </AccessibleDialog>
        </div>
      </div>
      {expired ? (
        <p
          className="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-4"
          role="status"
        >
          시간이 만료되었습니다. 서버에서 결과를 확정하는 중입니다.
        </p>
      ) : null}
      <QuizQuestionPresenter
        initialIndex={session.currentIndex}
        interactionDisabled={interactionPending}
        onAnswerChange={(questionId, selectedChoiceIds) => {
          setRequestError(null);
          stateMutation.mutate(
            { answer: { questionId, selectedChoiceIds } },
            { onError: handleMutationError },
          );
        }}
        onFlagChange={(questionId, flagged) => {
          setRequestError(null);
          flagMutation.mutate(
            { questionId, flagged },
            { onError: handleMutationError },
          );
        }}
        onNavigate={(currentIndex) => {
          setRequestError(null);
          stateMutation.mutate({ currentIndex }, { onError: handleMutationError });
        }}
        questions={session.questions}
        sessionTarget={sessionTarget}
        submitPending={interactionPending}
      />
    </>
  );
}

export function ExamPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const examSessionId = sessionId as Uuid;
  const sessionQuery = useExamSessionQuery(examSessionId);
  const certificationCode =
    sessionQuery.data && isActiveExam(sessionQuery.data)
      ? sessionQuery.data.certificationCode
      : undefined;
  useDocumentTitle(certificationCode ? `모의고사 · ${certificationCode}` : "모의고사");

  useEffect(() => {
    if (sessionQuery.data && !isActiveExam(sessionQuery.data)) {
      navigate(`/app/attempts/${sessionQuery.data.attemptId}`, { replace: true });
    }
  }, [navigate, sessionQuery.data]);

  const state = toQueryAsyncBoundaryState(sessionQuery, {
    loadingLabel: "모의고사 세션을 불러오는 중입니다.",
    nextAction: { label: "학습 홈으로 이동", onAction: () => navigate("/app") },
  });

  return (
    <section className="content-card" aria-labelledby="exam-title" data-screen="S5">
      <h1 id="exam-title" className="text-2xl font-bold tracking-tight">
        모의고사
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        남은 시간과 제출 결과는 서버 기준으로 처리됩니다.
      </p>
      <div className="mt-6">
        <AsyncBoundary state={state}>
          {(session) =>
            isActiveExam(session) ? (
              <ExamInteraction examSessionId={examSessionId} session={session} />
            ) : (
              <p role="status">제출된 모의고사 결과로 이동하는 중입니다.</p>
            )
          }
        </AsyncBoundary>
      </div>
    </section>
  );
}
