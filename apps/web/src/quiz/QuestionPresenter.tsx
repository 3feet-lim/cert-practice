import type {
  ActiveQuestion,
  LanguageMode,
  PracticeSubmittedQuestion,
  Uuid,
} from "@cert-quiz/contracts";

import { ChoiceField } from "../components/ChoiceField";
import { SafeMarkdown } from "../components/SafeMarkdown";
import {
  QuestionNavigator,
  type QuestionNavigatorItem,
} from "../components/StaticPresentation";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/cn";

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
}

function localizedText(
  value: { en: string; ko: string | null },
  language: LanguageMode,
): string {
  return language === "ko" && value.ko !== null ? value.ko : value.en;
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
}: QuestionPresenterProps) {
  const isMultipleChoice = question.requiredChoiceCount > 1;
  const submitted = isSubmittedQuestion(question);
  const showReveal = reveal && submitted;
  const translated = language === "ko" && question.translationStatus === "translated";
  const selectedCount = question.selectedChoiceIds.length;
  const currentIndex = navigatorItems.findIndex(({ state }) => state === "current");
  const selectionDisabled =
    interactionDisabled || submitted || onChoiceChange === undefined;

  return (
    <section aria-labelledby="question-presenter-title" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-card">
        <div>
          <p className="text-sm font-semibold text-muted-foreground">
            문항 {question.displayNumber} / {totalQuestions} · {question.domainName}
          </p>
          <h2 id="question-presenter-title" className="mt-1 text-xl font-bold">
            {question.domainName} 문제
          </h2>
          {language === "ko" && !translated ? (
            <p role="status" className="mt-2 text-sm text-warning">
              한국어 번역이 없어 영어로 표시합니다.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2" aria-label="문항 표시 언어">
          <Button
            aria-pressed={language === "en"}
            disabled={interactionDisabled || onLanguageChange === undefined}
            onClick={() => onLanguageChange?.("en")}
            variant={language === "en" ? "primary" : "secondary"}
          >
            English
          </Button>
          <Button
            aria-pressed={language === "ko"}
            disabled={interactionDisabled || onLanguageChange === undefined}
            onClick={() => onLanguageChange?.("ko")}
            variant={language === "ko" ? "primary" : "secondary"}
          >
            한국어
          </Button>
          {onFlagChange ? (
            <Button
              aria-pressed={question.flagged}
              disabled={interactionDisabled}
              onClick={() => onFlagChange(!question.flagged)}
              variant={question.flagged ? "primary" : "secondary"}
            >
              {question.flagged ? "Flag" : "Flag 없음"}
            </Button>
          ) : (
            <Badge tone={question.flagged ? "warning" : "neutral"}>
              {question.flagged ? "Flag" : "Flag 없음"}
            </Badge>
          )}
        </div>
      </div>

      <article className="rounded-xl border border-border bg-card p-6 shadow-card">
        <p className="whitespace-pre-wrap text-base font-medium leading-7 text-foreground">
          {localizedText(question.stem, language)}
        </p>
        <fieldset className="mt-6 grid gap-3" aria-describedby="required-choice-count">
          <legend className="font-bold">답변 선택</legend>
          <p id="required-choice-count" className="text-sm text-muted-foreground">
            {isMultipleChoice
              ? `정확히 ${question.requiredChoiceCount}개를 선택하세요. (${selectedCount}/${question.requiredChoiceCount} 선택)`
              : "정확히 1개를 선택하세요."}
          </p>
          {question.choices.map((choice) => {
            const selected = question.selectedChoiceIds.includes(choice.id);
            const correct = showReveal && question.correctChoiceIds.includes(choice.id);
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
                label={localizedText(choice.text, language)}
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
            className="mt-6 rounded-lg border border-success/30 bg-success-soft p-5"
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
            <SafeMarkdown
              className="mt-2"
              content={localizedText(question.explanation, language)}
            />
          </section>
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

      <QuestionNavigator
        items={[...navigatorItems]}
        onNavigate={onNavigate ? (_item, index) => onNavigate(index) : undefined}
      />
      <nav
        aria-label="이전 또는 다음 문항"
        className="flex flex-wrap justify-between gap-3"
      >
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
    </section>
  );
}
