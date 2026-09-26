import type {
  ActiveQuestion,
  LanguageMode,
  PracticeSubmittedQuestion,
  Uuid,
} from "@cert-quiz/contracts";

import { useState } from "react";

import { ChoiceField } from "../components/ChoiceField";
import { SafeMarkdown } from "../components/SafeMarkdown";
import {
  QuestionNavigator,
  type QuestionNavigatorItem,
} from "../components/StaticPresentation";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";
import { localizedQuestionText } from "./quiz-presentation";

export interface QuestionPresenterProps {
  question: ActiveQuestion;
  totalQuestions: number;
  language: LanguageMode;
  navigatorItems: readonly QuestionNavigatorItem[];
  previousDisabled?: boolean;
  nextDisabled?: boolean;
  reveal?: boolean;
  onChoiceChange?: (choiceId: Uuid) => void;
  onLanguageChange?: (language: LanguageMode) => void;
  onFlagChange?: (flagged: boolean) => void;
  onNavigate?: (index: number) => void;
  onSubmit?: () => void;
  submitPending?: boolean;
  interactionDisabled?: boolean;
  /** Shows the keyboard shortcut legend (interactive sessions only). */
  showShortcutHint?: boolean;
}

function isSubmittedQuestion(
  question: ActiveQuestion,
): question is PracticeSubmittedQuestion {
  return question.kind === "practice-submitted";
}

/**
 * Shared quiz visual. It stays props-driven for static previews, while optional
 * callbacks make the same accessible controls usable by session interaction code.
 */
export function QuestionPresenter({
  question,
  totalQuestions,
  language,
  navigatorItems,
  previousDisabled = false,
  nextDisabled = false,
  reveal = isSubmittedQuestion(question),
  onChoiceChange,
  onLanguageChange,
  onFlagChange,
  onNavigate,
  onSubmit,
  submitPending = false,
  interactionDisabled = false,
  showShortcutHint = false,
}: QuestionPresenterProps) {
  const [flaggedOnly, setFlaggedOnly] = useState(false);
  const flaggedCount = navigatorItems.filter((item) => item.flagged).length;
  const isMultipleChoice = question.requiredChoiceCount > 1;
  const submitted = isSubmittedQuestion(question);
  const showReveal = reveal && submitted;
  const showingKoreanFallbackForEnglishQuestion =
    language === "en" &&
    (question.stem.en === null ||
      question.choices.some((choice) => choice.text.en === null));
  const showingKoreanFallbackForEnglishExplanation =
    language === "en" && submitted && question.explanation.en === null;
  const selectedCount = question.selectedChoiceIds.length;
  const currentIndex = navigatorItems.findIndex(({ state }) => state === "current");
  const selectionDisabled =
    interactionDisabled || submitted || onChoiceChange === undefined;

  return (
    <section
      aria-label={`Q${question.displayNumber} / ${totalQuestions} · ${question.domainName}`}
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start"
    >
      <div className="grid min-w-0 gap-6">
        <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-muted-foreground">
              도메인 · {question.domainName}
            </p>
            {showingKoreanFallbackForEnglishQuestion ? (
              <p role="status" className="mt-2 text-sm text-warning">
                영어 문제 또는 선택지 번역이 없어 한국어로 표시합니다.
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="문항 표시 언어"
              className="inline-flex rounded-lg bg-muted p-1"
            >
              {(
                [
                  ["ko", "한국어"],
                  ["en", "English"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={language === value}
                  disabled={interactionDisabled || onLanguageChange === undefined}
                  onClick={() => onLanguageChange?.(value)}
                  className={cn(
                    "min-h-8 rounded-md px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:opacity-70",
                    language === value
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {onFlagChange ? (
              <button
                aria-pressed={question.flagged}
                className={cn(
                  "inline-flex min-h-10 items-center justify-center rounded-md border px-4 py-2 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30 disabled:cursor-not-allowed disabled:opacity-70",
                  question.flagged
                    ? "border-warning/50 bg-warning-soft text-warning"
                    : "border-border bg-card text-foreground hover:bg-muted",
                )}
                disabled={interactionDisabled}
                onClick={() => onFlagChange(!question.flagged)}
                type="button"
              >
                <span aria-hidden="true" className="mr-1.5">
                  {question.flagged ? "★" : "☆"}
                </span>
                {question.flagged ? "표시됨" : "나중에 보기"}
              </button>
            ) : question.flagged ? (
              <Badge tone="warning">★ 나중에 보기</Badge>
            ) : null}
          </div>
        </div>

        <article className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-6">
          <p className="whitespace-pre-wrap text-base font-medium leading-7 text-foreground">
            <span className="mr-2 font-bold text-primary">
              Q{question.displayNumber}.
            </span>
            {localizedQuestionText(question.stem, language)}
          </p>
          <fieldset
            className="mt-6 grid gap-3"
            aria-describedby="required-choice-count"
          >
            <legend className="font-bold">답변 선택</legend>
            <p id="required-choice-count" className="text-sm text-muted-foreground">
              {isMultipleChoice
                ? `정확히 ${question.requiredChoiceCount}개를 선택하세요. (${selectedCount}/${question.requiredChoiceCount} 선택)`
                : "정확히 1개를 선택하세요."}
            </p>
            {question.choices.map((choice, index) => {
              const selected = question.selectedChoiceIds.includes(choice.id);
              const correct =
                showReveal && question.correctChoiceIds.includes(choice.id);
              return (
                <ChoiceField
                  checked={selected}
                  className={cn(
                    correct && "border-success/50 bg-success-soft",
                    showReveal &&
                      selected &&
                      !correct &&
                      "border-danger/40 bg-danger-soft",
                  )}
                  description={
                    showReveal
                      ? correct
                        ? "정답"
                        : selected
                          ? "선택한 답변"
                          : undefined
                      : undefined
                  }
                  disabled={selectionDisabled}
                  key={choice.id}
                  label={
                    <>
                      <span className="mr-2 font-bold text-primary">
                        {String.fromCharCode("A".charCodeAt(0) + index)}.
                      </span>{" "}
                      {localizedQuestionText(choice.text, language)}
                    </>
                  }
                  name={`question-${question.id}`}
                  onChange={() => onChoiceChange?.(choice.id)}
                  readOnly={selectionDisabled}
                  type={isMultipleChoice ? "checkbox" : "radio"}
                  value={choice.id}
                />
              );
            })}
          </fieldset>

          {showReveal ? (
            <section
              aria-labelledby="question-feedback-title"
              className={cn(
                "mt-6 rounded-lg border p-5",
                question.isCorrect
                  ? "border-success/30 bg-success-soft"
                  : "border-danger/30 bg-danger-soft",
              )}
            >
              <div className="flex flex-wrap items-center gap-3">
                <h3 id="question-feedback-title" className="font-bold">
                  제출 결과
                </h3>
                <Badge tone={question.isCorrect ? "success" : "danger"}>
                  {question.isCorrect ? "정답" : "오답"}
                </Badge>
                <span className="text-sm font-semibold">
                  획득 점수: {question.earnedScore}
                </span>
              </div>
              <h4 className="mt-5 font-bold">해설</h4>
              {showingKoreanFallbackForEnglishExplanation ? (
                <p role="status" className="mt-2 text-sm text-warning">
                  영어 해설이 없어 한국어로 표시합니다.
                </p>
              ) : null}
              <SafeMarkdown
                className="mt-2"
                content={localizedQuestionText(question.explanation, language)}
              />
            </section>
          ) : null}

          {showShortcutHint ? (
            <p
              className="mt-6 hidden text-xs text-muted-foreground md:block"
              aria-hidden="true"
            >
              단축키: <kbd className="rounded border border-border px-1">←</kbd>{" "}
              <kbd className="rounded border border-border px-1">→</kbd> 이동 ·{" "}
              <kbd className="rounded border border-border px-1">1</kbd>–
              <kbd className="rounded border border-border px-1">
                {Math.min(9, question.choices.length)}
              </kbd>{" "}
              선택 · <kbd className="rounded border border-border px-1">F</kbd> 나중에
              보기
              {onSubmit && !submitted ? (
                <>
                  {" "}
                  · <kbd className="rounded border border-border px-1">Enter</kbd> 제출
                </>
              ) : null}
            </p>
          ) : null}

          {onSubmit && !submitted ? (
            <div className="mt-6 flex justify-end">
              <Button
                disabled={
                  interactionDisabled ||
                  selectedCount !== question.requiredChoiceCount ||
                  submitPending
                }
                onClick={onSubmit}
              >
                {submitPending ? "제출 중..." : "답변 제출"}
              </Button>
            </div>
          ) : null}
        </article>
      </div>

      <aside aria-label="문항 이동" className="grid gap-3 lg:sticky lg:top-6">
        <nav aria-label="이전 또는 다음 문항" className="grid grid-cols-2 gap-3">
          <Button
            disabled={
              interactionDisabled ||
              previousDisabled ||
              (onNavigate !== undefined && currentIndex <= 0)
            }
            onClick={() => onNavigate?.(currentIndex - 1)}
            variant="secondary"
          >
            이전 문항
          </Button>
          <Button
            disabled={
              interactionDisabled ||
              nextDisabled ||
              (onNavigate !== undefined &&
                (currentIndex < 0 || currentIndex >= navigatorItems.length - 1))
            }
            onClick={() => onNavigate?.(currentIndex + 1)}
          >
            다음 문항
          </Button>
        </nav>
        {flaggedCount > 0 ? (
          <button
            type="button"
            aria-pressed={flaggedOnly}
            onClick={() => setFlaggedOnly(!flaggedOnly)}
            className={cn(
              "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30",
              flaggedOnly
                ? "border-warning/50 bg-warning-soft text-warning"
                : "border-border bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            <span aria-hidden="true">★</span>
            나중에 보기만 ({flaggedCount})
          </button>
        ) : null}
        <QuestionNavigator
          className="max-h-60 overflow-y-auto lg:max-h-[calc(100vh-14rem)]"
          items={navigatorItems.filter(
            (item) => !(flaggedOnly && flaggedCount > 0) || item.flagged,
          )}
          onNavigate={
            onNavigate
              ? (item) =>
                  onNavigate(
                    navigatorItems.findIndex(
                      (candidate) => candidate.number === item.number,
                    ),
                  )
              : undefined
          }
        />
      </aside>
    </section>
  );
}
