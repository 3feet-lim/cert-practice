import type { StartPracticeResponse } from "@cert-quiz/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { resolveCertQuizResult } from "../api/query-result";
import { useCertQuizApi } from "../api/useCertQuizApi";
import { certQuizQueryKeys } from "./query-keys";
import { providerLogoSrc } from "./provider-logos";
import {
  useActivePracticeSessionsQuery,
  useCatalogQuery,
  useHistoryQuery,
} from "../api/queries";
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
import { cn } from "../lib/cn";
import { useDocumentTitle } from "../lib/use-document-title";

const scoringModeLabels: Record<string, string> = {
  all_or_nothing: "완전 일치 시 정답",
  partial: "부분 점수",
};

/** Mirrors Button's primary-variant classes so a router `Link` can look identical to a `<Button>`. */
const linkButtonClassName = cn(
  "inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors",
  "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30",
  "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
);

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
  const sessions = activeSessions.data?.sessions ?? [];

  if (!activeSessions.isSuccess || sessions.length === 0) return null;

  return (
    <section aria-label="이어 풀 수 있는 연습">
      <Card tone="highlight">
        <p className="eyebrow mb-2">ACTIVE PRACTICE</p>
        <h2 className="text-xl font-bold tracking-tight text-foreground">이어 풀기</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          진행 중인 연습을 이어서 풀어보세요.
        </p>
        <ul className="mt-4 grid gap-3">
          {sessions.map((session) => (
            <li
              key={session.practiceSessionId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-card p-4 shadow-sm"
            >
              <p className="text-sm text-foreground">
                {session.certificationCode} · {session.currentQuestionNumber} /{" "}
                {session.totalQuestions}번 문항
              </p>
              <Link
                className={linkButtonClassName}
                aria-label={`${session.certificationCode} 연습 이어 풀기`}
                to={`/app/practice/${session.practiceSessionId}`}
              >
                연습 이어 풀기
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </section>
  );
}

function RecentExamSummary() {
  const history = useHistoryQuery();
  const attempts = history.data?.attempts.slice(0, 3) ?? [];

  return (
    <section aria-labelledby="recent-exams-heading">
      <Card>
        <h2 id="recent-exams-heading" className="text-lg font-bold tracking-tight">
          최근 모의고사
        </h2>
        {history.isPending ? (
          <p className="mt-3 text-sm text-muted-foreground" role="status">
            최근 성적을 불러오는 중입니다.
          </p>
        ) : attempts.length === 0 ? (
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            아직 응시한 모의고사가 없습니다. 자격증을 골라 첫 모의고사에 도전해 보세요.
          </p>
        ) : (
          <ul className="mt-4 grid gap-2">
            {attempts.map((attempt) => (
              <li key={attempt.attemptId}>
                <Link
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30"
                  to={`/app/attempts/${attempt.attemptId}`}
                >
                  <span className="min-w-0">
                    <span className="block font-semibold text-foreground">
                      {attempt.certificationCode}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {new Date(attempt.submittedAt).toLocaleDateString("ko-KR")}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-bold tabular-nums">
                      {Number(attempt.accuracyRate).toFixed(0)}%
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-bold",
                        attempt.passed
                          ? "bg-success-soft text-success"
                          : "bg-danger-soft text-danger",
                      )}
                    >
                      {attempt.passed ? "합격" : "불합격"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {attempts.length > 0 ? (
          <Link
            className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
            to="/app/history"
          >
            전체 이력 보기
          </Link>
        ) : null}
      </Card>
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
              <div className="mb-4 flex items-center gap-3">
                {providerLogoSrc(provider.name) || provider.logoUrl ? (
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-white p-1 shadow-sm">
                    <img
                      src={
                        providerLogoSrc(provider.name) ?? provider.logoUrl ?? undefined
                      }
                      alt={provider.name}
                      className="size-full object-contain"
                    />
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground shadow-sm"
                  >
                    {provider.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
                <h2
                  id={`provider-${provider.id}`}
                  className="text-base font-extrabold tracking-tight text-foreground"
                >
                  {provider.name}
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                {provider.certifications.map((certification) => (
                  <Card key={certification.id} className="flex w-full flex-col">
                    <CardHeader>
                      <p className="eyebrow">{certification.code}</p>
                      <CardTitle>{certification.name}</CardTitle>
                    </CardHeader>
                    <div className="mt-auto flex flex-col gap-4">
                      <CardDescription>
                        {certification.totalQuestions}문항 ·{" "}
                        {certification.timeLimitMinutes}분 · 합격 기준{" "}
                        {certification.passThreshold}%
                      </CardDescription>
                      <CardFooter className="mt-0">
                        <Link
                          className={linkButtonClassName}
                          to={`/app/certifications/${certification.id}`}
                        >
                          학습 모드 선택
                        </Link>
                      </CardFooter>
                    </div>
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
  useDocumentTitle("학습 홈");
  return (
    <section className="content-card" aria-labelledby="welcome-title" data-screen="S2">
      <div>
        <h1 id="welcome-title" className="text-2xl font-bold tracking-tight">
          학습 홈
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          이어 풀던 연습을 계속하거나, 새 자격증을 선택해 시작하세요.
        </p>
      </div>
      <div className="mt-10 grid gap-10 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <section aria-labelledby="catalog-heading" className="min-w-0">
          <div className="mb-5">
            <h2 id="catalog-heading" className="text-xl font-bold tracking-tight">
              자격증 찾아보기
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              준비 중인 자격증을 선택해 학습을 시작하세요.
            </p>
          </div>
          <CatalogContent />
        </section>
        <div className="order-first grid gap-6 xl:order-none">
          <ActivePracticeBanner />
          <RecentExamSummary />
        </div>
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
  useDocumentTitle(
    certification ? `학습 모드 선택 · ${certification.code}` : "학습 모드 선택",
  );

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
  const certificationFacts = [
    { label: "문항 수", value: `${certification.totalQuestions}문항` },
    { label: "제한 시간", value: `${certification.timeLimitMinutes}분` },
    { label: "합격 기준", value: `${certification.passThreshold}%` },
    {
      label: "채점 방식",
      value: scoringModeLabels[certification.scoringMode] ?? certification.scoringMode,
    },
  ];

  return (
    <section
      className="content-card"
      aria-labelledby="mode-select-title"
      data-screen="S3"
    >
      <nav aria-label="이동 경로" className="mb-4 text-sm">
        <ol className="flex flex-wrap items-center gap-1 text-muted-foreground">
          <li>
            <Link
              className="rounded font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30"
              to="/app"
            >
              학습 홈
            </Link>
          </li>
          <li aria-hidden="true">›</li>
          <li aria-current="page" className="font-semibold text-foreground">
            {certification.code}
          </li>
        </ol>
      </nav>
      <div className="rounded-xl border border-border bg-muted/40 p-4 sm:p-6">
        <span className="inline-flex items-center rounded-md bg-primary px-2.5 py-1 text-xs font-bold tracking-wide text-primary-foreground">
          {certification.code}
        </span>
        <h1
          id="mode-select-title"
          className="mt-3 text-2xl font-bold tracking-tight text-foreground"
        >
          {certification.name}
        </h1>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {certificationFacts.map((fact) => (
            <div
              key={fact.label}
              className="rounded-lg border border-border bg-card px-4 py-3 shadow-sm"
            >
              <dt className="text-xs font-semibold text-muted-foreground">
                {fact.label}
              </dt>
              <dd className="mt-1 text-lg font-bold text-foreground">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <h2
        id="mode-select-options"
        className="mt-8 text-lg font-bold tracking-tight text-foreground"
      >
        학습 모드 선택
      </h2>
      <div
        className="mt-4 grid gap-4 md:grid-cols-2"
        role="group"
        aria-labelledby="mode-select-options"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">연습 모드</CardTitle>
            <CardDescription className="text-foreground/70">
              제출 뒤 정답과 해설을 바로 확인합니다.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button disabled={commandsPending} onClick={() => startPractice.mutate()}>
              연습 시작
            </Button>
          </CardFooter>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">모의고사</CardTitle>
            <CardDescription className="text-foreground/70">
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
        <p
          className="mt-4 rounded-lg border border-danger/30 bg-danger-soft p-4 text-sm font-medium text-danger"
          role="alert"
        >
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
