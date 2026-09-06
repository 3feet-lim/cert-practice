import type { StartPracticeResponse } from "@cert-quiz/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { resolveCertQuizResult } from "../api/query-result";
import { useCertQuizApi } from "../api/useCertQuizApi";
import { certQuizQueryKeys } from "./query-keys";
import { useActivePracticeSessionsQuery, useCatalogQuery } from "../api/queries";
import { AccessibleDialog } from "../components/AccessibleDialog";
import { AsyncBoundary } from "../components/AsyncBoundary";
import { toQueryAsyncBoundaryState } from "../components/async-boundary-state";
import { Button } from "../components/ui/Button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "../components/ui/Card";

type PracticeDecision = Extract<
  StartPracticeResponse,
  { kind: "resume-or-replace-required" }
>;

function RequestError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <section className="route-card" role="alert">
      <h1>요청을 완료하지 못했습니다.</h1>
      <p className="description">{message}</p>
      <Button onClick={onRetry}>다시 시도</Button>
    </section>
  );
}

function ActivePracticeBanner() {
  const activeSessions = useActivePracticeSessionsQuery();
  const session = activeSessions.data?.sessions[0];

  if (!activeSessions.isSuccess || !session) return null;

  return (
    <section className="route-card" aria-label="이어 풀 수 있는 연습">
      <p className="eyebrow">ACTIVE PRACTICE</p>
      <h2>이어 풀 수 있는 연습이 있습니다.</h2>
      <p className="description">
        {session.certificationCode} · {session.currentQuestionNumber} /{" "}
        {session.totalQuestions}번 문항
      </p>
      <Link className="primary-link" to={`/app/practice/${session.practiceSessionId}`}>
        연습 이어 풀기
      </Link>
    </section>
  );
}

function CatalogContent() {
  const catalog = useCatalogQuery();
  const navigate = useNavigate();
  const state = toQueryAsyncBoundaryState(catalog, {
    loadingLabel: "자격증 카탈로그를 불러오는 중입니다.",
    isEmpty: (data) => data.providers.length === 0,
    empty: {
      title: "학습 가능한 자격증이 없습니다.",
      message: "카탈로그가 준비되면 이곳에 표시됩니다.",
    },
    nextAction: {
      label: "학습 홈으로 이동",
      onAction: () => navigate("/app"),
    },
  });

  return (
    <AsyncBoundary state={state}>
      {(data) => (
        <div className="grid gap-6">
          {data.providers.map((provider) => (
            <section key={provider.id} aria-labelledby={`provider-${provider.id}`}>
              <h2 id={`provider-${provider.id}`}>{provider.name}</h2>
              <div className="grid gap-4 md:grid-cols-2">
                {provider.certifications.map((certification) => (
                  <Card key={certification.id}>
                    <CardHeader>
                      <p className="eyebrow">{certification.code}</p>
                      <CardTitle>{certification.name}</CardTitle>
                      <CardDescription>
                        {certification.totalQuestions}문항 ·{" "}
                        {certification.timeLimitMinutes}분 · 합격 기준{" "}
                        {certification.passThreshold}%
                      </CardDescription>
                    </CardHeader>
                    <CardFooter>
                      <Link
                        className="primary-link"
                        to={`/app/certifications/${certification.id}`}
                      >
                        학습 모드 선택
                      </Link>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AsyncBoundary>
  );
}

export function CatalogHomePage() {
  return (
    <section className="welcome-card" aria-labelledby="welcome-title" data-screen="S2">
      <p className="eyebrow">CERTQUIZ</p>
      <h1 id="welcome-title">클라우드 자격증 연습을 시작하세요.</h1>
      <p className="description">
        Provider별로 학습 가능한 자격증과 진행 중인 연습을 확인합니다.
      </p>
      <div className="mt-6 grid gap-6">
        <ActivePracticeBanner />
        <CatalogContent />
      </div>
    </section>
  );
}

export function ModeSelectPage() {
  const { id: certificationId } = useParams();
  const navigate = useNavigate();
  const api = useCertQuizApi();
  const queryClient = useQueryClient();
  const catalog = useCatalogQuery();
  const [practiceDecision, setPracticeDecision] = useState<PracticeDecision | null>(
    null,
  );
  const [examDialogOpen, setExamDialogOpen] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const examIdempotencyKey = useRef("");
  const examSubmissionLocked = useRef(false);

  const certification = catalog.data?.providers
    .flatMap((provider) => provider.certifications)
    .find((candidate) => candidate.id === certificationId);

  const startPractice = useMutation({
    mutationFn: () => {
      if (!certification) throw new Error("A selected certification is required.");
      return resolveCertQuizResult(
        api.startPractice({ certificationId: certification.id }),
      );
    },
    onSuccess: (result) => {
      setCommandError(null);
      if (result.kind === "created") {
        navigate(`/app/practice/${result.practiceSessionId}`);
        return;
      }
      setPracticeDecision(result);
    },
    onError: (error) => setCommandError(error.message),
  });

  const resumePractice = useMutation({
    mutationFn: (practiceSessionId: string) =>
      resolveCertQuizResult(api.resumePractice({ practiceSessionId })),
    onSuccess: (session) => {
      setCommandError(null);
      setPracticeDecision(null);
      navigate(`/app/practice/${session.practiceSessionId}`);
    },
    onError: (error) => setCommandError(error.message),
  });

  const replacePractice = useMutation({
    mutationFn: (practiceSessionId: string) =>
      resolveCertQuizResult(
        api.replacePractice({
          practiceSessionId,
          confirmationNonce: `replace:${practiceSessionId}`,
        }),
      ),
    onSuccess: async (session) => {
      setCommandError(null);
      await queryClient.invalidateQueries({
        queryKey: certQuizQueryKeys.activePracticeSessions(),
      });
      setPracticeDecision(null);
      navigate(`/app/practice/${session.practiceSessionId}`);
    },
    onError: (error) => setCommandError(error.message),
  });

  const startExam = useMutation({
    mutationFn: () => {
      if (!certification) throw new Error("A selected certification is required.");
      return resolveCertQuizResult(
        api.startExam({
          certificationId: certification.id,
          idempotencyKey: examIdempotencyKey.current,
        }),
      );
    },
    onSuccess: (result) => {
      setCommandError(null);
      setExamDialogOpen(false);
      navigate(`/app/exams/${result.examSessionId}`);
    },
    onError: (error) => setCommandError(error.message),
    onSettled: () => {
      examSubmissionLocked.current = false;
    },
  });

  const openExamConfirmation = () => {
    examIdempotencyKey.current = `exam:${certificationId ?? "unknown"}:${Date.now()}`;
    setCommandError(null);
    setExamDialogOpen(true);
  };

  const confirmExamStart = () => {
    if (examSubmissionLocked.current) return;
    examSubmissionLocked.current = true;
    startExam.mutate();
  };

  if (catalog.isPending) {
    return (
      <section className="route-card" role="status">
        학습 모드를 불러오는 중입니다.
      </section>
    );
  }
  if (catalog.isError) {
    return (
      <RequestError
        message={catalog.error.message}
        onRetry={() => void catalog.refetch()}
      />
    );
  }
  if (!certification) {
    return (
      <section className="route-card" role="alert">
        <h1>자격증을 찾을 수 없습니다.</h1>
        <Link className="primary-link" to="/app">
          학습 홈으로 돌아가기
        </Link>
      </section>
    );
  }

  const commandsPending =
    startPractice.isPending || resumePractice.isPending || replacePractice.isPending;

  return (
    <section
      className="route-card"
      aria-labelledby="mode-select-title"
      data-screen="S3"
    >
      <p className="eyebrow">{certification.code}</p>
      <h1 id="mode-select-title">학습 모드 선택</h1>
      <p className="description">{certification.name}</p>
      <dl className="description">
        <div>
          <dt>문항 수</dt>
          <dd>{certification.totalQuestions}문항</dd>
        </div>
        <div>
          <dt>제한 시간</dt>
          <dd>{certification.timeLimitMinutes}분</dd>
        </div>
        <div>
          <dt>합격 기준</dt>
          <dd>{certification.passThreshold}%</dd>
        </div>
        <div>
          <dt>채점 방식</dt>
          <dd>{certification.scoringMode}</dd>
        </div>
      </dl>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>연습 모드</CardTitle>
            <CardDescription>제출 뒤 정답과 해설을 바로 확인합니다.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button disabled={commandsPending} onClick={() => startPractice.mutate()}>
              연습 시작
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>모의고사</CardTitle>
            <CardDescription>
              확인한 시점부터 서버 기준 제한 시간이 시작됩니다.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button disabled={startExam.isPending} onClick={openExamConfirmation}>
              모의고사 시작
            </Button>
          </CardFooter>
        </Card>
      </div>
      {commandError ? (
        <p className="description" role="alert">
          {commandError}
        </p>
      ) : null}
      <AccessibleDialog
        trigger={<span aria-hidden="true" />}
        title="진행 중인 연습이 있습니다"
        description="선택 전에는 기존 연습 세션이 변경되지 않습니다."
        open={practiceDecision !== null}
        onOpenChange={(open) => {
          if (!open && !commandsPending) setPracticeDecision(null);
        }}
      >
        <p>
          {practiceDecision?.session.certificationCode}{" "}
          {practiceDecision?.session.currentQuestionNumber} /
          {practiceDecision?.session.totalQuestions}번 문항에서 이어갈 수 있습니다.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button
            disabled={commandsPending || !practiceDecision}
            onClick={() =>
              practiceDecision &&
              resumePractice.mutate(practiceDecision.session.practiceSessionId)
            }
          >
            이어 풀기
          </Button>
          <Button
            disabled={commandsPending || !practiceDecision}
            variant="secondary"
            onClick={() =>
              practiceDecision &&
              replacePractice.mutate(practiceDecision.session.practiceSessionId)
            }
          >
            기존 세션 교체
          </Button>
        </div>
      </AccessibleDialog>
      <AccessibleDialog
        trigger={<span aria-hidden="true" />}
        title="모의고사를 시작할까요?"
        description={`확인 시점부터 서버 기준 ${certification.timeLimitMinutes}분이 시작됩니다.`}
        open={examDialogOpen}
        onOpenChange={(open) => {
          if (!startExam.isPending) setExamDialogOpen(open);
        }}
        confirmAction={{
          label: "확인하고 시작",
          onConfirm: confirmExamStart,
          disabled: startExam.isPending,
        }}
      >
        <p>확인 전에는 모의고사 세션을 만들지 않습니다.</p>
      </AccessibleDialog>
    </section>
  );
}
