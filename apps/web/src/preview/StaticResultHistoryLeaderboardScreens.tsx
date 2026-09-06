import type {
  ExamResultDto,
  HistoryPageDto,
  HistoryTrendsDto,
  LeaderboardDto,
  PracticeResultDto,
  ReviewQuestion,
} from "@cert-quiz/contracts";

import {
  AccessibleChart,
  Badge,
  DataTable,
  DomainBreakdown,
  PageHeader,
  ScoreSummary,
  StatePanel,
  StatusBanner,
} from "../components";

interface FixtureSuccess<Data> {
  readonly state: "success";
  readonly data: Data;
}

interface FixtureEmpty<Data> {
  readonly state: "empty";
  readonly title: string;
  readonly message: string;
  readonly nextAction: string;
  readonly data?: Data;
}

interface FixtureError<Data> {
  readonly state: "error";
  readonly error: { readonly message: string; readonly nextAction: string };
  readonly data?: Data;
}

type ResultFixtures =
  | FixtureSuccess<{
      readonly practice?: PracticeResultDto;
      readonly exam?: ExamResultDto;
    }>
  | FixtureEmpty<never>
  | FixtureError<never>;
type HistoryFixtures =
  | FixtureSuccess<{ readonly page: HistoryPageDto; readonly trends: HistoryTrendsDto }>
  | FixtureEmpty<{ readonly page: HistoryPageDto; readonly trends: HistoryTrendsDto }>
  | FixtureError<never>;
type LeaderboardFixtures =
  FixtureSuccess<LeaderboardDto> | FixtureEmpty<LeaderboardDto> | FixtureError<never>;

function displayScore(value: string, suffix = ""): string {
  const numeric = Number(value);
  return `${Number.isFinite(numeric) ? numeric.toFixed(2) : value}${suffix}`;
}

function dateTime(value: string): string {
  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(new Date(value));
}

function ReviewTable({ questions }: { questions: readonly ReviewQuestion[] }) {
  return (
    <DataTable
      caption="문항 검토"
      columns={[
        { id: "question", header: "문항", cell: (item) => `${item.displayNumber}번` },
        { id: "domain", header: "도메인", cell: (item) => item.domainName },
        {
          id: "result",
          header: "결과",
          cell: (item) => (
            <Badge tone={item.isCorrect ? "success" : "danger"}>
              {item.isCorrect ? "정답" : "오답"}
            </Badge>
          ),
        },
        {
          id: "score",
          header: "획득 점수",
          cell: (item) => displayScore(item.earnedScore),
        },
        {
          id: "review",
          header: "검토 상태",
          cell: (item) =>
            `${item.selectedChoiceIds.length}개 응답 · ${item.correctChoiceIds.length}개 정답`,
        },
      ]}
      rows={questions.slice(0, 6)}
    />
  );
}

function ResultMetadata({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

export function StaticPracticeResultScreen({ fixture }: { fixture: ResultFixtures }) {
  if (fixture.state === "empty") {
    return (
      <StatePanel status="empty" title={fixture.title} message={fixture.message} />
    );
  }
  if (fixture.state === "error") {
    return (
      <StatePanel
        status="error"
        title="연습 결과를 열 수 없습니다"
        message={`${fixture.error.message} ${fixture.error.nextAction}`}
      />
    );
  }

  const result = fixture.data.practice;
  if (!result) {
    return (
      <StatePanel
        status="error"
        title="연습 결과를 열 수 없습니다"
        message="결과 데이터가 없습니다."
      />
    );
  }
  return (
    <div className="grid max-w-6xl gap-8">
      <PageHeader
        eyebrow="S6 · PRACTICE RESULT"
        title="연습 결과"
        description={`${result.certification.code} · ${result.certification.name}`}
        metadata={<Badge tone="info">168시간 다시보기</Badge>}
      />
      <StatusBanner
        title="연습 결과는 모의고사 통계와 리더보드에 포함되지 않습니다"
        message={`완료 ${dateTime(result.completedAt)} · 만료 ${dateTime(result.expiresAt)}`}
      />
      <ScoreSummary
        rawScore={displayScore(result.score.rawScore)}
        accuracyRate={displayScore(result.score.accuracyRate, "%")}
        totalQuestions={result.questions.length}
      />
      <DomainBreakdown
        items={result.domains.map((domain) => ({
          id: domain.domainName,
          name: domain.domainName,
          questionCount: domain.questionCount,
          earnedScore: displayScore(domain.earnedScore),
          accuracyRate: displayScore(domain.accuracyRate, "%"),
        }))}
      />
      <section aria-labelledby="practice-review-title" className="grid gap-4">
        <div>
          <h2 id="practice-review-title" className="text-lg font-bold">
            문항별 검토
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            저장된 응답, 정답, 점수와 해설을 기준으로 다시 봅니다.
          </p>
        </div>
        <ReviewTable questions={result.questions} />
      </section>
    </div>
  );
}

export function StaticExamResultScreen({ fixture }: { fixture: ResultFixtures }) {
  if (fixture.state === "empty") {
    return (
      <StatePanel status="empty" title={fixture.title} message={fixture.message} />
    );
  }
  if (fixture.state === "error") {
    return (
      <StatePanel
        status="error"
        title="모의고사 결과를 열 수 없습니다"
        message={`${fixture.error.message} ${fixture.error.nextAction}`}
      />
    );
  }

  const result = fixture.data.exam;
  if (!result) {
    return (
      <StatePanel
        status="error"
        title="모의고사 결과를 열 수 없습니다"
        message="결과 데이터가 없습니다."
      />
    );
  }
  return (
    <div className="grid max-w-6xl gap-8">
      <PageHeader
        eyebrow="S7 · EXAM RESULT"
        title="모의고사 결과"
        description={`${result.certification.code} · ${result.certification.name}`}
        metadata={
          <Badge tone={result.passed ? "success" : "danger"}>
            {result.passed ? "합격" : "불합격"}
          </Badge>
        }
      />
      <ScoreSummary
        rawScore={displayScore(result.score.rawScore)}
        accuracyRate={displayScore(result.score.accuracyRate, "%")}
        totalQuestions={result.questions.length}
        passed={result.passed}
        reference1000={String(result.reference1000Score)}
      />
      <dl className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-3">
        <ResultMetadata
          label="합격 기준"
          value={`${result.certification.passThreshold}%`}
        />
        <ResultMetadata label="제출 시각" value={dateTime(result.submittedAt)} />
        <ResultMetadata
          label="제출 방식"
          value={
            result.submissionReason === "expired" ? "시간 만료 자동 제출" : "직접 제출"
          }
        />
      </dl>
      <DomainBreakdown
        items={result.domains.map((domain) => ({
          id: domain.domainName,
          name: domain.domainName,
          questionCount: domain.questionCount,
          earnedScore: displayScore(domain.earnedScore),
          accuracyRate: displayScore(domain.accuracyRate, "%"),
        }))}
      />
      <section aria-labelledby="exam-review-title" className="grid gap-4">
        <div>
          <h2 id="exam-review-title" className="text-lg font-bold">
            불변 응시 검토
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            이 응시 당시의 문항 순서, 응답과 채점 결과를 표시합니다.
          </p>
        </div>
        <ReviewTable questions={result.questions} />
      </section>
    </div>
  );
}

function TrendGraphic({ points }: { points: readonly { accuracyRate: string }[] }) {
  const coordinates = points
    .map((point, index) => `${20 + index * 120},${120 - Number(point.accuracyRate)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 320 140" className="h-52 w-full" aria-hidden="true">
      <path
        d="M 20 120 H 300 M 20 20 V 120"
        fill="none"
        stroke="currentColor"
        opacity="0.25"
      />
      <polyline
        points={coordinates}
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
      />
      {points.map((point, index) => (
        <circle
          key={index}
          cx={20 + index * 120}
          cy={120 - Number(point.accuracyRate)}
          r="5"
          fill="currentColor"
        />
      ))}
    </svg>
  );
}

export function StaticHistoryScreen({ fixture }: { fixture: HistoryFixtures }) {
  if (fixture.state === "error") {
    return (
      <StatePanel
        status="error"
        title="모의고사 이력을 불러올 수 없습니다"
        message={`${fixture.error.message} ${fixture.error.nextAction}`}
      />
    );
  }
  if (fixture.state === "empty") {
    return (
      <StatePanel
        status="empty"
        title={fixture.title}
        message={`${fixture.message} ${fixture.nextAction}`}
      />
    );
  }

  const { page, trends } = fixture.data;
  const trend = trends.certifications[0];
  return (
    <div className="grid max-w-6xl gap-8">
      <PageHeader
        eyebrow="S8 · HISTORY"
        title="모의고사 이력"
        description="연습 결과는 응시 횟수와 점수 추이에서 제외됩니다."
      />
      <DataTable
        caption="모의고사 응시 이력"
        columns={[
          {
            id: "submitted",
            header: "제출 시각",
            cell: (item) => dateTime(item.submittedAt),
          },
          { id: "cert", header: "자격증", cell: (item) => item.certificationCode },
          { id: "raw", header: "원점수", cell: (item) => displayScore(item.rawScore) },
          {
            id: "accuracy",
            header: "정답률",
            cell: (item) => displayScore(item.accuracyRate, "%"),
          },
          {
            id: "pass",
            header: "결과",
            cell: (item) => (
              <Badge tone={item.passed ? "success" : "danger"}>
                {item.passed ? "합격" : "불합격"}
              </Badge>
            ),
          },
        ]}
        rows={page.attempts.map((attempt) => ({ ...attempt, id: attempt.attemptId }))}
      />
      {trend ? (
        <AccessibleChart
          title={`${trend.certificationCode} 정답률 추이`}
          description={`${trend.attemptCount}회 모의고사 응시의 시간순 정답률입니다.`}
          columns={["응시", "제출 시각", "정답률"]}
          rows={trend.points.map((point, index) => ({
            id: point.attemptId,
            cells: [
              `${index + 1}회`,
              dateTime(point.submittedAt),
              displayScore(point.accuracyRate, "%"),
            ],
          }))}
        >
          <TrendGraphic points={trend.points} />
        </AccessibleChart>
      ) : null}
    </div>
  );
}

export function StaticLeaderboardScreen({
  fixture,
  privateVisibility = false,
  scorePublic,
  onScorePublicChange,
  visibilityPending = false,
}: {
  fixture: LeaderboardFixtures;
  privateVisibility?: boolean;
  scorePublic?: boolean;
  onScorePublicChange?: (scorePublic: boolean) => void;
  visibilityPending?: boolean;
}) {
  if (fixture.state === "error") {
    return (
      <StatePanel
        status="error"
        title="리더보드를 불러올 수 없습니다"
        message={`${fixture.error.message} ${fixture.error.nextAction}`}
      />
    );
  }
  if (fixture.state === "empty") {
    return (
      <StatePanel
        status="empty"
        title={fixture.title}
        message={`${fixture.message} ${fixture.nextAction}`}
      />
    );
  }

  const isScorePublic = scorePublic ?? !privateVisibility;

  return (
    <div className="grid max-w-6xl gap-8">
      <PageHeader
        eyebrow="S9 · LEADERBOARD"
        title="리더보드"
        description={`${fixture.data.certificationCode} · 공개 사용자의 최고 정답률 순위`}
      />
      <StatusBanner
        title="점수 공개 설정"
        message={
          !isScorePublic
            ? "현재 점수는 비공개이며 리더보드 후보에서 제외됩니다."
            : "현재 점수는 공개 상태이며 최고 성과 하나만 순위에 반영됩니다."
        }
        tone={!isScorePublic ? "warning" : "success"}
      >
        <label className="inline-flex items-center gap-2 font-semibold">
          <input
            type="checkbox"
            checked={isScorePublic}
            disabled={visibilityPending}
            onChange={(event) => onScorePublicChange?.(event.target.checked)}
            readOnly={onScorePublicChange === undefined}
            aria-label="점수 공개"
          />
          점수 공개
        </label>
      </StatusBanner>
      {!isScorePublic ? (
        <StatusBanner
          title="비공개 상태"
          message="순위는 계속 볼 수 있지만 내 점수와 현재 사용자 표시는 포함되지 않습니다."
          tone="info"
        />
      ) : null}
      <DataTable
        caption="공개 최고 성과 리더보드"
        columns={[
          { id: "rank", header: "순위", cell: (item) => `${item.rank}위` },
          {
            id: "name",
            header: "사용자",
            cell: (item) => (
              <span>
                {item.displayName}{" "}
                {item.isCurrentUser ? <Badge tone="info">나</Badge> : null}
              </span>
            ),
          },
          {
            id: "accuracy",
            header: "정답률",
            cell: (item) => displayScore(item.accuracyRate, "%"),
          },
          { id: "raw", header: "원점수", cell: (item) => displayScore(item.rawScore) },
          {
            id: "submitted",
            header: "대표 응시",
            cell: (item) => dateTime(item.submittedAt),
          },
        ]}
        rows={fixture.data.entries.map((entry) => ({ ...entry, id: entry.attemptId }))}
      />
      <p className="text-sm text-muted-foreground">
        동점 사용자는 같은 순위를 공유하며 다음 순위는 건너뜁니다.
      </p>
    </div>
  );
}
