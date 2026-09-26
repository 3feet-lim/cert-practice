import type { LanguageMode, ReviewQuestion, Uuid } from "@cert-quiz/contracts";
import { useId, useMemo, useState } from "react";

import { cn } from "../lib/cn";
import { formatScore } from "../lib/format";
import { SafeMarkdown } from "./SafeMarkdown";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";

type ReviewFilter = "all" | "wrong" | "correct" | "flagged";

const filterLabels: Record<ReviewFilter, string> = {
  all: "전체",
  wrong: "오답",
  correct: "정답",
  flagged: "나중에 보기",
};

function localized(text: { en: string | null; ko: string }, language: LanguageMode) {
  return language === "en" ? (text.en ?? text.ko) : text.ko;
}

function choiceLetter(index: number) {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

function sameSet(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

interface RetryState {
  picked: Uuid[];
  checked: boolean;
}

function ReviewChoices({
  question,
  language,
  retry,
  onPick,
}: {
  question: ReviewQuestion;
  language: LanguageMode;
  retry?: RetryState;
  onPick?: (choiceId: Uuid) => void;
}) {
  const reveal = retry === undefined || retry.checked;
  return (
    <ul className="mt-4 grid gap-2" aria-label="선지">
      {question.choices.map((choice, index) => {
        const correct = question.correctChoiceIds.includes(choice.id);
        const selected = retry
          ? retry.picked.includes(choice.id)
          : question.selectedChoiceIds.includes(choice.id);
        const tone = reveal
          ? correct
            ? "correct"
            : selected
              ? "wrong"
              : "neutral"
          : selected
            ? "picked"
            : "neutral";
        const status = reveal
          ? [correct ? "정답" : null, selected ? (retry ? "내 선택" : "내 답변") : null]
              .filter(Boolean)
              .join(" · ")
          : selected
            ? "선택함"
            : "";
        const content = (
          <>
            <span
              aria-hidden="true"
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
                tone === "correct" && "border-success bg-success text-white",
                tone === "wrong" && "border-danger bg-danger text-white",
                tone === "picked" &&
                  "border-primary bg-primary text-primary-foreground",
                tone === "neutral" && "border-border bg-card text-muted-foreground",
              )}
            >
              {choiceLetter(index)}
            </span>
            <span className="min-w-0 flex-1 text-left leading-6">
              {localized(choice.text, language)}
            </span>
            {status ? (
              <span
                className={cn(
                  "shrink-0 text-xs font-bold",
                  tone === "correct" && "text-success",
                  tone === "wrong" && "text-danger",
                  tone === "picked" && "text-primary",
                )}
              >
                {status}
              </span>
            ) : null}
          </>
        );
        const itemClass = cn(
          "flex w-full items-start gap-3 rounded-lg border p-3 text-sm",
          tone === "correct" && "border-success/40 bg-success-soft",
          tone === "wrong" && "border-danger/40 bg-danger-soft",
          tone === "picked" && "border-primary/40 bg-primary-soft",
          tone === "neutral" && "border-border bg-card",
        );
        return (
          <li key={choice.id}>
            {retry && !retry.checked ? (
              <button
                type="button"
                aria-pressed={selected}
                className={cn(
                  itemClass,
                  "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30",
                )}
                onClick={() => onPick?.(choice.id)}
              >
                {content}
              </button>
            ) : (
              <div className={itemClass}>{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ReviewItem({
  question,
  language,
  expanded,
  onToggle,
  retryMode,
}: {
  question: ReviewQuestion;
  language: LanguageMode;
  expanded: boolean;
  onToggle: () => void;
  retryMode: boolean;
}) {
  const panelId = useId();
  const [retry, setRetry] = useState<RetryState>({ picked: [], checked: false });
  const activeRetry = retryMode ? retry : undefined;
  const retryCorrect =
    retry.checked && sameSet(retry.picked, question.correctChoiceIds);

  const pick = (choiceId: Uuid) =>
    setRetry((current) => {
      if (question.requiredChoiceCount === 1)
        return { picked: [choiceId], checked: false };
      const picked = current.picked.includes(choiceId)
        ? current.picked.filter((id) => id !== choiceId)
        : current.picked.length < question.requiredChoiceCount
          ? [...current.picked, choiceId]
          : current.picked;
      return { picked, checked: false };
    });

  const hideVerdict = retryMode && !retry.checked;

  return (
    <li
      className={cn(
        "rounded-xl border bg-card shadow-sm",
        hideVerdict
          ? "border-border"
          : question.isCorrect
            ? "border-border"
            : "border-danger/30",
      )}
      data-review-result={question.isCorrect ? "correct" : "wrong"}
    >
      <h3 className="m-0">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-xl px-4 py-3 text-left hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30 sm:flex-nowrap"
        >
          <span className="w-10 shrink-0 font-bold tabular-nums text-primary">
            Q{question.displayNumber}
          </span>
          {hideVerdict ? (
            <Badge tone="neutral">풀이 전</Badge>
          ) : (
            <Badge tone={question.isCorrect ? "success" : "danger"}>
              {question.isCorrect ? "정답" : "오답"}
            </Badge>
          )}
          <span className="order-last w-full min-w-0 truncate text-sm text-foreground sm:order-none sm:w-auto sm:flex-1">
            {localized(question.stem, language)}
          </span>
          <span className="hidden shrink-0 text-xs text-muted-foreground md:inline">
            {question.domainName}
          </span>
          {question.flagged ? (
            <span className="shrink-0 text-warning" aria-label="나중에 보기 표시됨">
              ★
            </span>
          ) : null}
          <span aria-hidden="true" className="ml-auto shrink-0 text-muted-foreground">
            {expanded ? "▴" : "▾"}
          </span>
        </button>
      </h3>
      {expanded ? (
        <div id={panelId} className="border-t border-border px-4 pb-5 pt-4">
          <p className="text-xs font-semibold text-muted-foreground">
            {question.domainName}
            {question.requiredChoiceCount > 1
              ? ` · ${question.requiredChoiceCount}개 선택`
              : ""}
            {hideVerdict ? "" : ` · 획득 점수 ${formatScore(question.earnedScore)}`}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-base font-medium leading-7 text-foreground">
            {localized(question.stem, language)}
          </p>
          <ReviewChoices
            question={question}
            language={language}
            retry={activeRetry}
            onPick={pick}
          />
          {retryMode ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              {retry.checked ? (
                <>
                  <p
                    role="status"
                    className={cn(
                      "text-sm font-bold",
                      retryCorrect ? "text-success" : "text-danger",
                    )}
                  >
                    {retryCorrect ? "정답입니다!" : "다시 틀렸어요. 해설을 확인하세요."}
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() => setRetry({ picked: [], checked: false })}
                  >
                    다시 풀기
                  </Button>
                </>
              ) : (
                <Button
                  disabled={retry.picked.length !== question.requiredChoiceCount}
                  onClick={() => setRetry((current) => ({ ...current, checked: true }))}
                >
                  정답 확인
                </Button>
              )}
            </div>
          ) : null}
          {!hideVerdict ? (
            <section
              aria-label="해설"
              className="mt-5 rounded-lg border border-border bg-muted/50 p-4"
            >
              <h4 className="text-sm font-bold text-foreground">해설</h4>
              {language === "en" && question.explanation.en === null ? (
                <p className="mt-1 text-xs text-warning">
                  영어 해설이 없어 한국어로 표시합니다.
                </p>
              ) : null}
              <SafeMarkdown
                className="mt-2 text-sm"
                content={localized(question.explanation, language)}
              />
            </section>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export interface ResultReviewProps {
  questions: readonly ReviewQuestion[];
  /** Initial filter; defaults to wrong answers when any exist. */
  initialFilter?: ReviewFilter;
}

/**
 * Full per-question review with correctness filters, domain filter, answer/explanation
 * reveal, and a client-side "retry wrong answers" self-test mode.
 */
export function ResultReview({ questions, initialFilter }: ResultReviewProps) {
  const wrongCount = questions.filter((question) => !question.isCorrect).length;
  const [filter, setFilter] = useState<ReviewFilter>(
    initialFilter ?? (wrongCount > 0 ? "wrong" : "all"),
  );
  const [domain, setDomain] = useState("all");
  const [language, setLanguage] = useState<LanguageMode>("ko");
  const [retryMode, setRetryMode] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<Uuid>>(new Set());
  const domainSelectId = useId();

  const domains = useMemo(
    () => [...new Set(questions.map((question) => question.domainName))],
    [questions],
  );
  const counts: Record<ReviewFilter, number> = {
    all: questions.length,
    wrong: wrongCount,
    correct: questions.length - wrongCount,
    flagged: questions.filter((question) => question.flagged).length,
  };
  const hasEnglish = questions.some((question) => question.stem.en !== null);

  const visible = questions.filter((question) => {
    if (domain !== "all" && question.domainName !== domain) return false;
    if (filter === "wrong") return !question.isCorrect;
    if (filter === "correct") return question.isCorrect;
    if (filter === "flagged") return question.flagged;
    return true;
  });

  const toggle = (id: Uuid) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const startRetry = () => {
    setRetryMode(true);
    setFilter("wrong");
    setExpanded(
      new Set(
        questions
          .filter((question) => !question.isCorrect)
          .map((question) => question.id),
      ),
    );
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
        <div
          role="group"
          aria-label="결과 필터"
          className="flex flex-wrap gap-1 rounded-lg bg-muted p-1"
        >
          {(Object.keys(filterLabels) as ReviewFilter[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30",
                filter === key
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {filterLabels[key]}{" "}
              <span className="tabular-nums text-xs">{counts[key]}</span>
            </button>
          ))}
        </div>
        {domains.length > 1 ? (
          <div className="flex items-center gap-2">
            <label
              htmlFor={domainSelectId}
              className="text-sm font-semibold text-muted-foreground"
            >
              도메인
            </label>
            <select
              id={domainSelectId}
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              className="min-h-9 max-w-[14rem] rounded-md border border-border bg-card px-2 text-sm"
            >
              <option value="all">전체 도메인</option>
              {domains.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {hasEnglish ? (
          <Button
            variant="ghost"
            aria-pressed={language === "en"}
            onClick={() => setLanguage(language === "en" ? "ko" : "en")}
          >
            {language === "en" ? "한국어로 보기" : "English"}
          </Button>
        ) : null}
        <div className="ml-auto flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={() =>
              setExpanded(
                expanded.size > 0
                  ? new Set()
                  : new Set(visible.map((question) => question.id)),
              )
            }
          >
            {expanded.size > 0 ? "모두 접기" : "모두 펼치기"}
          </Button>
          {retryMode ? (
            <Button variant="secondary" onClick={() => setRetryMode(false)}>
              다시 풀기 종료
            </Button>
          ) : wrongCount > 0 ? (
            <Button onClick={startRetry}>오답 다시 풀기 ({wrongCount})</Button>
          ) : null}
        </div>
      </div>
      {retryMode ? (
        <p
          role="status"
          className="rounded-lg border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary"
        >
          정답과 해설을 가린 상태입니다. 답을 고른 뒤 &lsquo;정답 확인&rsquo;을 눌러
          스스로 점검하세요. 이 풀이는 기록되지 않습니다.
        </p>
      ) : null}
      {visible.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          조건에 맞는 문항이 없습니다.
        </p>
      ) : (
        <ol aria-label="문항 검토" className="grid list-none gap-2 p-0">
          {visible.map((question) => (
            <ReviewItem
              key={`${question.id}:${retryMode ? "retry" : "review"}`}
              question={question}
              language={language}
              expanded={expanded.has(question.id)}
              onToggle={() => toggle(question.id)}
              retryMode={retryMode && !question.isCorrect}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
