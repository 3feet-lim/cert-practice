import type { ReactNode } from "react";
import type {
  CertificationTrendDto,
  ExamResultDto,
  HistoryPageDto,
  HistoryTrendsDto,
  LeaderboardDto,
  PracticeResultDto,
} from "@cert-quiz/contracts";
import { Link } from "react-router-dom";

import {
  AccessibleChart,
  Badge,
  DataTable,
  DomainBreakdown,
  PageHeader,
  ResultReview,
  ScoreSummary,
  StatePanel,
  StatusBanner,
} from "../components";
import { cn } from "../lib/cn";
import {
  clampPercent,
  formatDateTime,
  formatPercent,
  formatPointGap,
  formatScore,
  formatShortDate,
} from "../lib/format";

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

/** Shared page width for S6-S9 so every results-style screen lines up. */
const pageClassName = "content-card grid gap-8";

const actionLinkClassName =
  "inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30";
const primaryActionClassName = cn(
  actionLinkClassName,
  "bg-primary text-primary-foreground shadow-sm hover:bg-primary-hover",
);
const secondaryActionClassName = cn(
  actionLinkClassName,
  "border border-border bg-card text-foreground shadow-sm hover:bg-muted",
);

function domainItems(domains: PracticeResultDto["domains"]) {
  return domains.map((domain) => ({
    id: domain.domainName,
    name: domain.domainName,
    questionCount: domain.questionCount,
    earnedScore: formatScore(domain.earnedScore),
    accuracyRate: formatScore(domain.accuracyRate, "%"),
    accuracyValue: Number(domain.accuracyRate),
  }));
}

function ResultActions({
  practiceHref,
  historyHref,
}: {
  practiceHref?: string;
  historyHref?: string;
}) {
  if (!practiceHref && !historyHref) return null;
  return (
    <>
      {practiceHref ? (
        <Link className={primaryActionClassName} to={practiceHref}>
          이 자격증 다시 연습하기
        </Link>
      ) : null}
      {historyHref ? (
        <Link className={secondaryActionClassName} to={historyHref}>
          전체 이력 보기
        </Link>
      ) : null}
    </>
  );
}

function ResultReviewSection({
  headingId,
  title,
  description,
  questions,
}: {
  headingId: string;
  title: string;
  description: string;
  questions: PracticeResultDto["questions"];
}) {
  return (
    <section aria-labelledby={headingId} className="grid gap-4">
      <div>
        <h2 id={headingId} className="text-lg font-bold">
          {title}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <ResultReview questions={questions} />
    </section>
  );
}

export function StaticPracticeResultScreen({
  fixture,
  screenMarker = "S6 · PRACTICE RESULT",
  practiceHref,
  historyHref,
}: {
  fixture: ResultFixtures;
  screenMarker?: string | null;
  practiceHref?: string;
  historyHref?: string;
}) {
  if (fixture.state === "empty") {
    return (
      <div className={pageClassName}>
        <StatePanel status="empty" title={fixture.title} message={fixture.message} />
      </div>
    );
  }
  if (fixture.state === "error") {
    return (
      <div className={pageClassName}>
        <StatePanel
          status="error"
          title="연습 결과를 열 수 없습니다"
          message={`${fixture.error.message} ${fixture.error.nextAction}`}
        />
      </div>
    );
  }

  const result = fixture.data.practice;
  if (!result) {
    return (
      <div className={pageClassName}>
        <StatePanel
          status="error"
          title="연습 결과를 열 수 없습니다"
          message="결과 데이터가 없습니다."
        />
      </div>
    );
  }
  return (
    <div className={pageClassName}>
      <PageHeader
        eyebrow={screenMarker ?? undefined}
        title="연습 결과"
        description={`${result.certification.code} · ${result.certification.name}`}
        metadata={<Badge tone="info">168시간 다시보기</Badge>}
      />
      <ScoreSummary
        rawScore={formatScore(result.score.rawScore)}
        accuracyRate={formatScore(result.score.accuracyRate, "%")}
        accuracyValue={Number(result.score.accuracyRate)}
        totalQuestions={result.questions.length}
        passThreshold={result.certification.passThreshold}
        actions={
          <ResultActions practiceHref={practiceHref} historyHref={historyHref} />
        }
      />
      <StatusBanner
        title="연습 결과는 모의고사 통계와 리더보드에 포함되지 않습니다"
        message={`완료 ${formatDateTime(result.completedAt)} · ${formatDateTime(result.expiresAt)}까지 다시 볼 수 있습니다`}
      />
      <DomainBreakdown
        items={domainItems(result.domains)}
        passThreshold={result.certification.passThreshold}
      />
      <ResultReviewSection
        headingId="practice-review-title"
        title="문항별 검토"
        description="저장된 응답, 정답, 점수와 해설을 기준으로 다시 봅니다."
        questions={result.questions}
      />
    </div>
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

export function StaticExamResultScreen({
  fixture,
  screenMarker = "S7 · EXAM RESULT",
  practiceHref,
  historyHref,
}: {
  fixture: ResultFixtures;
  screenMarker?: string | null;
  practiceHref?: string;
  historyHref?: string;
}) {
  if (fixture.state === "empty") {
    return (
      <div className={pageClassName}>
        <StatePanel status="empty" title={fixture.title} message={fixture.message} />
      </div>
    );
  }
  if (fixture.state === "error") {
    return (
      <div className={pageClassName}>
        <StatePanel
          status="error"
          title="모의고사 결과를 열 수 없습니다"
          message={`${fixture.error.message} ${fixture.error.nextAction}`}
        />
      </div>
    );
  }

  const result = fixture.data.exam;
  if (!result) {
    return (
      <div className={pageClassName}>
        <StatePanel
          status="error"
          title="모의고사 결과를 열 수 없습니다"
          message="결과 데이터가 없습니다."
        />
      </div>
    );
  }
  const durationMinutes = Math.max(
    0,
    Math.round(
      (Date.parse(result.submittedAt) - Date.parse(result.startedAt)) / 60_000,
    ),
  );
  return (
    <div className={pageClassName}>
      <PageHeader
        eyebrow={screenMarker ?? undefined}
        title="모의고사 결과"
        description={`${result.certification.code} · ${result.certification.name}`}
      />
      <ScoreSummary
        rawScore={formatScore(result.score.rawScore)}
        accuracyRate={formatScore(result.score.accuracyRate, "%")}
        accuracyValue={Number(result.score.accuracyRate)}
        totalQuestions={result.questions.length}
        passed={result.passed}
        reference1000={String(result.reference1000Score)}
        passThreshold={result.certification.passThreshold}
        actions={
          <ResultActions practiceHref={practiceHref} historyHref={historyHref} />
        }
      />
      <dl className="grid gap-4 rounded-xl border border-border bg-card p-5 sm:grid-cols-4">
        <ResultMetadata
          label="합격 기준"
          value={`${result.certification.passThreshold}%`}
        />
        <ResultMetadata label="제출 시각" value={formatDateTime(result.submittedAt)} />
        <ResultMetadata label="소요 시간" value={`${durationMinutes}분`} />
        <ResultMetadata
          label="제출 방식"
          value={
            result.submissionReason === "expired" ? "시간 만료 자동 제출" : "직접 제출"
          }
        />
      </dl>
      <DomainBreakdown
        items={domainItems(result.domains)}
        passThreshold={result.certification.passThreshold}
      />
      <ResultReviewSection
        headingId="exam-review-title"
        title="불변 응시 검토"
        description="이 응시 당시의 문항 순서, 응답과 채점 결과를 표시합니다."
        questions={result.questions}
      />
    </div>
  );
}

const chart = { width: 800, height: 260, left: 40, right: 24, top: 24, bottom: 36 };

/** Accuracy trend with evenly spaced points, a 0-100 axis, and an optional pass line. */
export function TrendGraphic({
  points,
  passThreshold,
}: {
  points: readonly { accuracyRate: string; submittedAt: string }[];
  passThreshold?: number;
}) {
  const plotWidth = chart.width - chart.left - chart.right;
  const plotHeight = chart.height - chart.top - chart.bottom;
  const x = (index: number) =>
    points.length <= 1
      ? chart.left + plotWidth / 2
      : chart.left + (plotWidth * index) / (points.length - 1);
  const y = (value: number) => chart.top + plotHeight * (1 - clampPercent(value) / 100);
  const coordinates = points
    .map((point, index) => `${x(index)},${y(Number(point.accuracyRate))}`)
    .join(" ");
  const labelEvery = Math.max(1, Math.ceil(points.length / 8));

  return (
    <svg
      viewBox={`0 0 ${chart.width} ${chart.height}`}
      className="h-auto w-full text-primary"
      aria-hidden="true"
    >
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line
            x1={chart.left}
            x2={chart.width - chart.right}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-border"
            strokeWidth="1"
          />
          <text
            x={chart.left - 8}
            y={y(tick) + 4}
            textAnchor="end"
            className="fill-muted-foreground text-[11px]"
          >
            {tick}
          </text>
        </g>
      ))}
      {passThreshold !== undefined ? (
        <g>
          <line
            x1={chart.left}
            x2={chart.width - chart.right}
            y1={y(passThreshold)}
            y2={y(passThreshold)}
            className="stroke-success"
            strokeWidth="1.5"
            strokeDasharray="6 4"
          />
          <text
            x={chart.left + 6}
            y={y(passThreshold) + 14}
            textAnchor="start"
            className="fill-success text-[11px] font-bold"
          >
            합격선 {passThreshold}%
          </text>
        </g>
      ) : null}
      {points.length > 1 ? (
        <polyline
          points={coordinates}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      ) : null}
      {points.map((point, index) => {
        const value = Number(point.accuracyRate);
        const passed = passThreshold === undefined || value >= passThreshold;
        return (
          <g key={`${point.submittedAt}:${index}`}>
            <circle
              cx={x(index)}
              cy={y(value)}
              r="5"
              className={passed ? "fill-primary" : "fill-danger"}
            />
            <text
              x={x(index)}
              y={y(value) - 10}
              textAnchor="middle"
              className="fill-foreground text-[11px] font-semibold"
            >
              {formatPercent(value)}
            </text>
            {index % labelEvery === 0 || index === points.length - 1 ? (
              <text
                x={x(index)}
                y={chart.height - 12}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {formatShortDate(point.submittedAt)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

function HistoryStats({ attempts }: { attempts: HistoryPageDto["attempts"] }) {
  const rates = attempts.map((attempt) => Number(attempt.accuracyRate));
  const best = Math.max(...rates);
  const average = rates.reduce((sum, rate) => sum + rate, 0) / rates.length;
  const passes = attempts.filter((attempt) => attempt.passed).length;
  const [latest, previous] = rates;
  const stats = [
    { label: "응시 횟수", value: `${attempts.length}회` },
    { label: "최고 정답률", value: formatPercent(best) },
    { label: "평균 정답률", value: formatPercent(average) },
    { label: "합격", value: `${passes} / ${attempts.length}회` },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-xl border border-border bg-card p-4 shadow-sm"
        >
          <dt className="text-xs font-semibold text-muted-foreground">{stat.label}</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{stat.value}</dd>
        </div>
      ))}
      {latest !== undefined && previous !== undefined ? (
        <p className="col-span-2 text-sm text-muted-foreground md:col-span-4">
          최근 응시는 직전보다{" "}
          <strong className={latest >= previous ? "text-success" : "text-danger"}>
            {formatPointGap(latest - previous)}
          </strong>{" "}
          변했습니다.
        </p>
      ) : null}
    </dl>
  );
}

function TrendChart({
  trend,
  passThreshold,
}: {
  trend: CertificationTrendDto;
  passThreshold?: string;
}) {
  const threshold = passThreshold === undefined ? undefined : Number(passThreshold);
  return (
    <AccessibleChart
      title={`${trend.certificationCode} 정답률 추이`}
      description={`${trend.attemptCount}회 모의고사 응시의 시간순 정답률입니다.`}
      columns={["응시", "제출 시각", "정답률"]}
      rows={trend.points.map((point, index) => ({
        id: point.attemptId,
        cells: [
          `${index + 1}회`,
          formatDateTime(point.submittedAt),
          formatScore(point.accuracyRate, "%"),
        ],
      }))}
    >
      <TrendGraphic
        points={trend.points}
        passThreshold={Number.isFinite(threshold) ? threshold : undefined}
      />
    </AccessibleChart>
  );
}

const historyHeaderDescription = "연습 결과는 응시 횟수와 점수 추이에서 제외됩니다.";

export function StaticHistoryScreen({
  fixture,
  screenMarker = "S8 · HISTORY",
  emptyAction,
  attemptHref,
  passThresholds = {},
}: {
  fixture: HistoryFixtures;
  screenMarker?: string | null;
  emptyAction?: ReactNode;
  /** Builds the result link for a history row; rows are plain text without it. */
  attemptHref?: (attemptId: string) => string;
  /** Pass thresholds keyed by certification id, used for the trend pass line. */
  passThresholds?: Readonly<Record<string, string>>;
}) {
  if (fixture.state === "error") {
    return (
      <div className={pageClassName}>
        <StatePanel
          status="error"
          title="모의고사 이력을 불러올 수 없습니다"
          message={`${fixture.error.message} ${fixture.error.nextAction}`}
        />
      </div>
    );
  }
  if (fixture.state === "empty") {
    return (
      <div className={pageClassName}>
        <PageHeader
          eyebrow={screenMarker ?? undefined}
          title="모의고사 이력"
          titleClassName="text-2xl"
          description={historyHeaderDescription}
        />
        <StatePanel
          status="empty"
          title={fixture.title}
          message={`${fixture.message} ${fixture.nextAction}`}
          action={emptyAction}
        />
      </div>
    );
  }

  const { page, trends } = fixture.data;
  return (
    <div className={pageClassName}>
      <PageHeader
        eyebrow={screenMarker ?? undefined}
        title="모의고사 이력"
        titleClassName="text-2xl"
        description={historyHeaderDescription}
      />
      {page.attempts.length > 0 ? <HistoryStats attempts={page.attempts} /> : null}
      {trends.certifications.map((trend) => (
        <TrendChart
          key={trend.certificationId}
          trend={trend}
          passThreshold={passThresholds[trend.certificationId]}
        />
      ))}
      <DataTable
        caption="모의고사 응시 이력"
        columns={[
          {
            id: "submitted",
            header: "제출 시각",
            cell: (item) => formatDateTime(item.submittedAt),
            className: "whitespace-nowrap",
          },
          { id: "cert", header: "자격증", cell: (item) => item.certificationCode },
          {
            id: "accuracy",
            header: "정답률",
            cell: (item) => (
              <span className="font-semibold tabular-nums">
                {formatScore(item.accuracyRate, "%")}
              </span>
            ),
          },
          {
            id: "raw",
            header: "원점수",
            cell: (item) => formatScore(item.rawScore),
            className: "hidden sm:table-cell",
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
          ...(attemptHref
            ? [
                {
                  id: "link",
                  header: "상세",
                  cell: (item: (typeof page.attempts)[number] & { id: string }) => (
                    <Link
                      className="whitespace-nowrap font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30"
                      to={attemptHref(item.attemptId)}
                      aria-label={`${formatDateTime(item.submittedAt)} 응시 결과 보기`}
                    >
                      결과 보기 ›
                    </Link>
                  ),
                },
              ]
            : []),
        ]}
        rows={page.attempts.map((attempt) => ({ ...attempt, id: attempt.attemptId }))}
      />
    </div>
  );
}

function VisibilitySwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  onChange?: (checked: boolean) => void;
}) {
  return (
    <label
      className={cn(
        "inline-flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold shadow-sm",
        disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.checked)}
        readOnly={onChange === undefined}
        aria-label="점수 공개"
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 shrink-0 rounded-full bg-muted-foreground/40 transition-colors peer-checked:bg-success peer-focus-visible:ring-3 peer-focus-visible:ring-focus/30 after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:after:translate-x-5"
      />
      <span>점수 공개</span>
    </label>
  );
}

const medals = ["🥇", "🥈", "🥉"];

function MyRankSummary({
  entries,
  isScorePublic,
}: {
  entries: LeaderboardDto["entries"];
  isScorePublic: boolean;
}) {
  const mine = entries.find((entry) => entry.isCurrentUser);
  if (!isScorePublic || !mine) {
    return (
      <section
        aria-label="내 순위"
        className="rounded-2xl border border-dashed border-border bg-card p-5"
      >
        <p className="text-sm font-bold text-muted-foreground">내 순위</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {isScorePublic
            ? "공개된 모의고사 성과가 아직 없습니다. 모의고사를 완료하면 순위에 반영됩니다."
            : "점수가 비공개라 내 순위가 표시되지 않습니다. 공개로 바꾸면 경쟁에 참여할 수 있습니다."}
        </p>
      </section>
    );
  }
  const myRate = Number(mine.accuracyRate);
  const better = entries
    .filter((entry) => Number(entry.accuracyRate) > myRate)
    .sort((left, right) => Number(left.accuracyRate) - Number(right.accuracyRate))[0];
  const percentile = Math.max(1, Math.ceil((mine.rank / entries.length) * 100));
  return (
    <section
      aria-label="내 순위"
      className="grid gap-4 rounded-2xl border border-primary/20 bg-primary-soft p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center"
    >
      <div className="flex items-baseline gap-2">
        <p className="text-4xl font-extrabold tabular-nums text-primary">
          {mine.rank}위
        </p>
        <p className="text-sm font-semibold text-primary">
          / {entries.length}명 · 상위 {percentile}%
        </p>
      </div>
      <p className="text-sm text-foreground sm:text-right">
        최고 정답률 <strong>{formatScore(mine.accuracyRate, "%")}</strong>
        {better ? (
          <>
            {" "}
            · 한 계단 위({better.rank}위)까지{" "}
            <strong className="text-primary">
              {formatPointGap(Number(better.accuracyRate) - myRate).replace("+", "")}
            </strong>
          </>
        ) : (
          <> · 현재 최고 순위입니다</>
        )}
      </p>
    </section>
  );
}

function Podium({ entries }: { entries: LeaderboardDto["entries"] }) {
  const top = entries.filter((entry) => entry.rank <= 3).slice(0, 3);
  if (top.length === 0) return null;
  return (
    <ol aria-label="상위 3위" className="grid list-none grid-cols-3 gap-2 p-0 sm:gap-3">
      {top.map((entry) => (
        <li
          key={entry.attemptId}
          className={cn(
            "min-w-0 rounded-2xl border bg-card p-3 shadow-card sm:p-5",
            entry.rank === 1 ? "border-warning/40" : "border-border",
            entry.isCurrentUser && "ring-2 ring-primary",
          )}
        >
          <p className="flex items-center gap-1 text-xs font-bold text-muted-foreground sm:gap-2 sm:text-sm">
            <span aria-hidden="true" className="text-xl sm:text-2xl">
              {medals[entry.rank - 1]}
            </span>
            {entry.rank}등
          </p>
          <p className="mt-2 truncate text-sm font-bold text-foreground sm:text-lg">
            {entry.displayName}
          </p>
          <p className="mt-1 text-base font-extrabold tabular-nums text-foreground sm:text-2xl">
            {formatScore(entry.accuracyRate, "%")}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function StaticLeaderboardScreen({
  fixture,
  privateVisibility = false,
  scorePublic,
  onScorePublicChange,
  visibilityPending = false,
  screenMarker = "S9 · LEADERBOARD",
  certificationPicker,
  emptyAction,
}: {
  fixture: LeaderboardFixtures;
  privateVisibility?: boolean;
  scorePublic?: boolean;
  onScorePublicChange?: (scorePublic: boolean) => void;
  visibilityPending?: boolean;
  screenMarker?: string | null;
  certificationPicker?: ReactNode;
  emptyAction?: ReactNode;
}) {
  if (fixture.state === "error") {
    return (
      <div className={pageClassName}>
        <StatePanel
          status="error"
          title="리더보드를 불러올 수 없습니다"
          message={`${fixture.error.message} ${fixture.error.nextAction}`}
        />
      </div>
    );
  }

  const isScorePublic = scorePublic ?? !privateVisibility;
  const certificationCode = fixture.data?.certificationCode;
  const entries = fixture.state === "success" ? fixture.data.entries : [];

  return (
    <div className={pageClassName}>
      <PageHeader
        eyebrow={screenMarker ?? undefined}
        title="리더보드"
        titleClassName="text-2xl"
        description={
          certificationCode
            ? `${certificationCode} · 공개 사용자의 최고 정답률 순위`
            : "공개 사용자의 최고 정답률 순위"
        }
        actions={
          <div className="flex flex-wrap items-end gap-3">
            {certificationPicker}
            <VisibilitySwitch
              checked={isScorePublic}
              disabled={visibilityPending}
              onChange={onScorePublicChange}
            />
          </div>
        }
      />
      {!isScorePublic ? (
        <StatusBanner
          title="비공개 상태"
          message="순위는 계속 볼 수 있지만 내 점수와 현재 사용자 표시는 포함되지 않습니다."
          tone="warning"
        />
      ) : null}
      {fixture.state === "empty" ? (
        <StatePanel
          status="empty"
          title={fixture.title}
          message={`${fixture.message} ${fixture.nextAction}`}
          action={emptyAction}
        />
      ) : (
        <>
          <MyRankSummary entries={entries} isScorePublic={isScorePublic} />
          <Podium entries={entries} />
          <LeaderboardTable entries={entries} />
        </>
      )}
    </div>
  );
}

function LeaderboardTable({ entries }: { entries: LeaderboardDto["entries"] }) {
  return (
    <div className="grid gap-2">
      <DataTable
        caption="공개 최고 성과 리더보드"
        columns={[
          {
            id: "rank",
            header: "순위",
            className: "w-16 whitespace-nowrap",
            cell: (item) => (
              <span className="inline-flex items-center gap-1 font-bold tabular-nums">
                {item.rank <= 3 ? (
                  <span aria-hidden="true">{medals[item.rank - 1]}</span>
                ) : null}
                {item.rank}위
              </span>
            ),
          },
          {
            id: "name",
            header: "사용자",
            cell: (item) => (
              <span
                className={cn(
                  "inline-flex flex-wrap items-center gap-2",
                  item.isCurrentUser && "font-bold text-primary",
                )}
              >
                {item.displayName}
                {item.isCurrentUser ? <Badge tone="info">나</Badge> : null}
              </span>
            ),
          },
          {
            id: "accuracy",
            header: "정답률",
            className: "whitespace-nowrap",
            cell: (item) => (
              <span className="font-semibold tabular-nums">
                {formatScore(item.accuracyRate, "%")}
              </span>
            ),
          },
          {
            id: "raw",
            header: "원점수",
            className: "hidden sm:table-cell",
            cell: (item) => formatScore(item.rawScore),
          },
          {
            id: "submitted",
            header: "대표 응시",
            className: "hidden md:table-cell whitespace-nowrap",
            cell: (item) => formatDateTime(item.submittedAt),
          },
        ]}
        rows={entries.map((entry) => ({ ...entry, id: entry.attemptId }))}
      />
      <p className="text-sm text-muted-foreground">
        동점 사용자는 같은 순위를 공유하며 다음 순위는 건너뜁니다.
      </p>
    </div>
  );
}
