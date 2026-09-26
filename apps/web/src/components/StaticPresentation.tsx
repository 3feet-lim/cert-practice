import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import { Badge, type BadgeTone } from "./ui/Badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/Card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/Table";

export interface CertificationCardProps {
  provider: string;
  code: string;
  name: string;
  totalQuestions: number;
  timeLimitMinutes: number;
  passThreshold: string;
  domainCount: number;
  href?: string;
  status?: { label: string; tone?: BadgeTone };
}

/** Static catalog summary; navigation is expressed as a declarative href. */
export function CertificationCard({
  provider,
  code,
  name,
  totalQuestions,
  timeLimitMinutes,
  passThreshold,
  domainCount,
  href,
  status,
}: CertificationCardProps) {
  const content = (
    <Card className={cn("h-full", href && "transition-shadow hover:shadow-md")}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm font-semibold text-muted-foreground">{provider}</p>
          {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
        </div>
        <CardTitle>{name}</CardTitle>
        <CardDescription>{code}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-muted-foreground">문항 수</dt>
            <dd className="mt-1 font-semibold">{totalQuestions}문항</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">제한 시간</dt>
            <dd className="mt-1 font-semibold">{timeLimitMinutes}분</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">합격 기준</dt>
            <dd className="mt-1 font-semibold">{passThreshold}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">도메인</dt>
            <dd className="mt-1 font-semibold">{domainCount}개</dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );

  return href ? (
    <a
      href={href}
      className="block rounded-xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30"
    >
      {content}
    </a>
  ) : (
    content
  );
}

export interface ScoreSummaryProps {
  rawScore: string;
  accuracyRate: string;
  totalQuestions: number;
  passed?: boolean;
  reference1000?: string;
  /** Pass threshold percentage; enables the gauge and the gap-to-threshold copy. */
  passThreshold?: string;
  /** Raw numeric accuracy (0-100) used for the gauge; defaults to parsing accuracyRate. */
  accuracyValue?: number;
  actions?: ReactNode;
}

function gapCopy(gap: number) {
  const rounded = Math.round(gap * 10) / 10;
  if (rounded >= 0) return `합격선보다 ${Math.abs(rounded)}%p 높습니다`;
  return `합격선까지 ${Math.abs(rounded)}%p 남았습니다`;
}

/** Result hero: large accuracy, pass/fail verdict, and a gauge with the pass line. */
export function ScoreSummary({
  rawScore,
  accuracyRate,
  totalQuestions,
  passed,
  reference1000,
  passThreshold,
  accuracyValue,
  actions,
}: ScoreSummaryProps) {
  const accuracy = accuracyValue ?? Number.parseFloat(accuracyRate);
  const threshold = passThreshold === undefined ? undefined : Number(passThreshold);
  const hasGauge = Number.isFinite(accuracy) && threshold !== undefined;
  const gap = hasGauge ? accuracy - threshold : 0;
  const verdictTone = passed === undefined ? "neutral" : passed ? "success" : "danger";

  return (
    <section
      aria-labelledby="score-summary-title"
      className={cn(
        "overflow-hidden rounded-2xl border bg-card shadow-card",
        verdictTone === "success" && "border-success/30",
        verdictTone === "danger" && "border-danger/30",
        verdictTone === "neutral" && "border-border",
      )}
    >
      <div
        className={cn(
          "grid gap-6 p-6 sm:p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center",
          verdictTone === "success" && "bg-success-soft/60",
          verdictTone === "danger" && "bg-danger-soft/60",
        )}
      >
        <div className="min-w-0">
          <h2
            id="score-summary-title"
            className="text-sm font-bold uppercase tracking-wide text-muted-foreground"
          >
            점수 요약
          </h2>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="text-5xl font-extrabold tracking-tight tabular-nums text-foreground sm:text-6xl">
              {accuracyRate}
            </p>
            {passed === undefined ? null : (
              <p
                className={cn(
                  "text-2xl font-extrabold",
                  passed ? "text-success" : "text-danger",
                )}
              >
                {passed ? "합격" : "불합격"}
              </p>
            )}
          </div>
          {hasGauge ? (
            <p
              className={cn(
                "mt-2 text-sm font-semibold",
                gap >= 0 ? "text-success" : "text-danger",
              )}
            >
              {gapCopy(gap)}
            </p>
          ) : null}
          {hasGauge ? (
            <div className="mt-5 max-w-xl">
              <div
                role="meter"
                aria-label="정답률과 합격선"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(accuracy)}
                aria-valuetext={`정답률 ${accuracyRate}, 합격선 ${threshold}%`}
                className="relative h-3 rounded-full bg-border"
              >
                <div
                  className={cn(
                    "h-full rounded-full",
                    gap >= 0 ? "bg-success" : "bg-danger",
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, accuracy))}%` }}
                />
                <div
                  aria-hidden="true"
                  className="absolute -top-1 h-5 w-0.5 bg-foreground"
                  style={{ left: `${Math.min(100, Math.max(0, threshold))}%` }}
                />
              </div>
              <div
                aria-hidden="true"
                className="relative mt-1 h-4 text-xs font-semibold text-muted-foreground"
              >
                <span
                  className="absolute -translate-x-1/2 whitespace-nowrap"
                  style={{ left: `${Math.min(100, Math.max(0, threshold))}%` }}
                >
                  합격선 {threshold}%
                </span>
              </div>
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap gap-2 md:flex-col">{actions}</div>
        ) : null}
      </div>
      <dl className="grid gap-4 border-t border-border p-6 sm:grid-cols-3 sm:px-8">
        <div>
          <dt className="text-sm text-muted-foreground">원점수</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">
            {rawScore}
            <span className="ml-1 text-base font-medium">/ {totalQuestions}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">정답률</dt>
          <dd className="mt-1 text-2xl font-bold tabular-nums">{accuracyRate}</dd>
        </div>
        {reference1000 ? (
          <div>
            <dt className="text-sm text-muted-foreground">참고 환산값</dt>
            <dd className="mt-1 text-2xl font-bold tabular-nums">
              {reference1000}
              <span className="ml-1 text-base font-medium">/ 1000</span>
            </dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

export interface DomainBreakdownItem {
  id: string;
  name: string;
  questionCount: number;
  earnedScore: string;
  accuracyRate: string;
  /** Numeric accuracy (0-100) for the bar; defaults to parsing accuracyRate. */
  accuracyValue?: number;
}

export interface DomainBreakdownProps {
  items: DomainBreakdownItem[];
  title?: string;
  /** Pass threshold percentage; domains below it are highlighted as weak. */
  passThreshold?: string;
}

export function DomainBreakdown({
  items,
  title = "도메인별 성과",
  passThreshold,
}: DomainBreakdownProps) {
  const threshold = passThreshold === undefined ? undefined : Number(passThreshold);
  const valueOf = (item: DomainBreakdownItem) =>
    item.accuracyValue ?? Number.parseFloat(item.accuracyRate);
  const weakCount =
    threshold === undefined
      ? 0
      : items.filter((item) => valueOf(item) < threshold).length;
  const sorted = [...items].sort((left, right) => valueOf(left) - valueOf(right));

  return (
    <section
      aria-labelledby="domain-breakdown-title"
      className="rounded-xl border border-border bg-card p-6 shadow-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="domain-breakdown-title" className="text-lg font-bold">
          {title}
        </h2>
        {threshold !== undefined ? (
          <p className="text-sm text-muted-foreground">
            {weakCount > 0
              ? `합격선(${threshold}%) 미만 도메인 ${weakCount}개 · 낮은 순으로 정렬`
              : `모든 도메인이 합격선(${threshold}%) 이상입니다`}
          </p>
        ) : null}
      </div>
      <Table className="mt-4">
        <TableCaption>{title} 표</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>도메인</TableHead>
            <TableHead className="w-2/5">정답률</TableHead>
            <TableHead>획득 / 문항</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((item) => {
            const value = valueOf(item);
            const weak = threshold !== undefined && value < threshold;
            return (
              <TableRow key={item.id} className={cn(weak && "bg-danger-soft/40")}>
                <th scope="row" className="px-4 py-3 text-left font-medium">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {item.name}
                    {weak ? <Badge tone="danger">약점</Badge> : null}
                  </span>
                </th>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div
                      aria-hidden="true"
                      className="relative h-2 min-w-24 flex-1 rounded-full bg-border"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full",
                          weak ? "bg-danger" : "bg-success",
                        )}
                        style={{
                          width: `${Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0))}%`,
                        }}
                      />
                      {threshold !== undefined ? (
                        <div
                          className="absolute -top-1 h-4 w-0.5 bg-foreground/60"
                          style={{ left: `${threshold}%` }}
                        />
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "w-16 shrink-0 text-right font-semibold tabular-nums",
                        weak && "text-danger",
                      )}
                    >
                      {item.accuracyRate}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {item.earnedScore} / {item.questionCount}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
  className?: string;
}
export interface DataTableProps<Row extends { id: string }> {
  caption: string;
  columns: DataTableColumn<Row>[];
  rows: Row[];
  emptyMessage?: string;
}

export function DataTable<Row extends { id: string }>({
  caption,
  columns,
  rows,
  emptyMessage = "표시할 데이터가 없습니다.",
}: DataTableProps<Row>) {
  return (
    <Table>
      <TableCaption>{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          {columns.map((column) => (
            <TableHead key={column.id} className={column.className}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={columns.length}
              className="text-center text-muted-foreground"
            >
              {emptyMessage}
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow key={row.id}>
              {columns.map((column, index) =>
                index === 0 ? (
                  <th
                    key={column.id}
                    scope="row"
                    className={cn("px-4 py-3 text-left font-medium", column.className)}
                  >
                    {column.cell(row)}
                  </th>
                ) : (
                  <TableCell key={column.id} className={column.className}>
                    {column.cell(row)}
                  </TableCell>
                ),
              )}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export interface StatusBannerProps {
  title: string;
  message: string;
  tone?: BadgeTone;
  children?: ReactNode;
}
const bannerClasses: Record<BadgeTone, string> = {
  neutral: "border-border bg-muted",
  info: "border-info/20 bg-info-soft",
  success: "border-success/20 bg-success-soft",
  warning: "border-warning/20 bg-warning-soft",
  danger: "border-danger/20 bg-danger-soft",
};
export function StatusBanner({
  title,
  message,
  tone = "info",
  children,
}: StatusBannerProps) {
  return (
    <section
      role={tone === "danger" ? "alert" : "status"}
      aria-live="polite"
      className={cn("rounded-xl border p-4", bannerClasses[tone])}
    >
      <h2 className="font-bold">{title}</h2>
      <p className="mt-1 text-sm">{message}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}

export interface QuestionNavigatorItem {
  number: number;
  href: string;
  state?: "current" | "answered" | "unanswered";
  /** Answer progress independent of focus, so the current question keeps its status. */
  progress?: "unanswered" | "answered" | "submitted";
  flagged?: boolean;
}
export interface QuestionNavigatorProps {
  items: QuestionNavigatorItem[];
  label?: string;
  onNavigate?: (item: QuestionNavigatorItem, index: number) => void;
  className?: string;
}

const progressLabels = {
  unanswered: "미응답",
  answered: "답 선택함",
  submitted: "제출함",
} as const;

function navigatorProgress(item: QuestionNavigatorItem) {
  if (item.progress) return item.progress;
  return item.state === "answered" ? "answered" : "unanswered";
}

export function QuestionNavigator({
  items,
  label = "문항 탐색",
  onNavigate,
  className,
}: QuestionNavigatorProps) {
  const showsSubmitted = items.some((item) => item.progress === "submitted");
  return (
    <nav
      aria-label={label}
      className={cn("rounded-xl border border-border bg-card p-4", className)}
    >
      <ol className="flex flex-wrap gap-2">
        {items.map((item, index) => {
          const current = item.state === "current";
          const progress = navigatorProgress(item);
          const className = cn(
            "relative inline-flex size-10 items-center justify-center rounded-md border text-sm font-bold focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30",
            current && item.progress === undefined
              ? "border-primary bg-primary text-primary-foreground"
              : progress === "submitted"
                ? "border-success/40 bg-success-soft text-success"
                : progress === "answered"
                  ? "border-primary/40 bg-primary-soft text-primary"
                  : "border-border bg-card text-foreground",
            current &&
              item.progress !== undefined &&
              "ring-2 ring-primary ring-offset-2 ring-offset-card",
          );
          const itemLabel = (
            <>
              <span className="sr-only">
                {item.number}번 문항, {current ? "현재 문항, " : ""}
                {progressLabels[progress]}
                {item.flagged ? ", 나중에 보기 표시됨" : ""}
              </span>
              <span aria-hidden="true">{item.number}</span>
              {item.flagged ? (
                <span
                  aria-hidden="true"
                  className="absolute -right-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-warning text-[0.6rem] leading-none text-white"
                >
                  ★
                </span>
              ) : null}
            </>
          );

          return (
            <li key={item.number}>
              {onNavigate ? (
                <button
                  aria-current={current ? "page" : undefined}
                  className={className}
                  onClick={() => onNavigate(item, index)}
                  type="button"
                >
                  {itemLabel}
                </button>
              ) : (
                <a
                  aria-current={current ? "page" : undefined}
                  className={className}
                  href={item.href}
                >
                  {itemLabel}
                </a>
              )}
            </li>
          );
        })}
      </ol>
      <ul
        aria-hidden="true"
        className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground"
      >
        <li className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-border bg-card" />
          미응답
        </li>
        <li className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm border border-primary/40 bg-primary-soft" />
          답 선택함
        </li>
        {showsSubmitted ? (
          <li className="inline-flex items-center gap-1.5">
            <span className="size-3 rounded-sm border border-success/40 bg-success-soft" />
            제출함
          </li>
        ) : null}
        <li className="inline-flex items-center gap-1.5">
          <span className="text-warning">★</span>
          나중에 보기
        </li>
      </ul>
    </nav>
  );
}

export interface TimerFaceProps {
  remaining: string;
  label?: string;
  expired?: boolean;
}
export function TimerFace({
  remaining,
  label = "남은 시간",
  expired = false,
}: TimerFaceProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        "inline-flex min-w-36 flex-col rounded-xl border p-4 text-center",
        expired
          ? "border-danger/30 bg-danger-soft text-danger"
          : "border-border bg-card",
      )}
    >
      <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      <time className="mt-1 font-mono text-2xl font-bold" dateTime={remaining}>
        {remaining}
      </time>
      {expired ? (
        <span className="mt-1 text-xs font-semibold">시간이 만료되었습니다.</span>
      ) : null}
    </section>
  );
}

export interface FileSummaryProps {
  name: string;
  size: string;
  status: string;
  tone?: BadgeTone;
  details?: ReactNode;
}
export function FileSummary({
  name,
  size,
  status,
  tone = "neutral",
  details,
}: FileSummaryProps) {
  return (
    <section
      aria-label="선택한 파일 요약"
      className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card p-4"
    >
      <div>
        <h2 className="font-semibold">{name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{size}</p>
        {details ? <div className="mt-2 text-sm">{details}</div> : null}
      </div>
      <Badge tone={tone}>{status}</Badge>
    </section>
  );
}

export interface ValidationError {
  id: string;
  path?: string;
  message: string;
}
export interface ValidationErrorListProps {
  errors: ValidationError[];
  title?: string;
}
export function ValidationErrorList({
  errors,
  title = "검증 오류",
}: ValidationErrorListProps) {
  return (
    <section
      aria-labelledby="validation-errors-title"
      className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-danger"
    >
      <h2 id="validation-errors-title" className="font-bold">
        {title} ({errors.length})
      </h2>
      {errors.length === 0 ? (
        <p className="mt-2 text-sm">검증 오류가 없습니다.</p>
      ) : (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          {errors.map((error) => (
            <li key={error.id}>
              {error.path ? (
                <span className="font-semibold">{error.path}: </span>
              ) : null}
              {error.message}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
