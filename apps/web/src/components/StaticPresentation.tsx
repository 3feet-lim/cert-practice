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
}

export function ScoreSummary({
  rawScore,
  accuracyRate,
  totalQuestions,
  passed,
  reference1000,
}: ScoreSummaryProps) {
  return (
    <section
      aria-labelledby="score-summary-title"
      className="rounded-xl border border-border bg-card p-6 shadow-card"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="score-summary-title" className="text-lg font-bold">
            점수 요약
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            원점수와 정답률을 우선 표시합니다.
          </p>
        </div>
        {passed === undefined ? null : (
          <Badge tone={passed ? "success" : "danger"}>
            {passed ? "합격" : "불합격"}
          </Badge>
        )}
      </div>
      <dl className="mt-5 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-sm text-muted-foreground">원점수</dt>
          <dd className="mt-1 text-2xl font-bold">
            {rawScore}
            <span className="ml-1 text-base font-medium">/ {totalQuestions}</span>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted-foreground">정답률</dt>
          <dd className="mt-1 text-2xl font-bold">{accuracyRate}</dd>
        </div>
        {reference1000 ? (
          <div>
            <dt className="text-sm text-muted-foreground">참고 환산값</dt>
            <dd className="mt-1 text-2xl font-bold">{reference1000}</dd>
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
}

export interface DomainBreakdownProps {
  items: DomainBreakdownItem[];
  title?: string;
}

export function DomainBreakdown({
  items,
  title = "도메인별 성과",
}: DomainBreakdownProps) {
  return (
    <section
      aria-labelledby="domain-breakdown-title"
      className="rounded-xl border border-border bg-card p-6 shadow-card"
    >
      <h2 id="domain-breakdown-title" className="text-lg font-bold">
        {title}
      </h2>
      <Table className="mt-4">
        <TableCaption>{title} 표</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>도메인</TableHead>
            <TableHead>문항 수</TableHead>
            <TableHead>획득 점수</TableHead>
            <TableHead>정답률</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <th scope="row" className="px-4 py-3 font-medium">
                {item.name}
              </th>
              <TableCell>{item.questionCount}</TableCell>
              <TableCell>{item.earnedScore}</TableCell>
              <TableCell>{item.accuracyRate}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

export interface DataTableColumn<Row> {
  id: string;
  header: string;
  cell: (row: Row) => ReactNode;
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
            <TableHead key={column.id}>{column.header}</TableHead>
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
                  <th key={column.id} scope="row" className="px-4 py-3 font-medium">
                    {column.cell(row)}
                  </th>
                ) : (
                  <TableCell key={column.id}>{column.cell(row)}</TableCell>
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
