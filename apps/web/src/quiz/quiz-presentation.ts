import type { ActiveQuestion, LanguageMode, Uuid } from "@cert-quiz/contracts";

import type { QuestionNavigatorItem } from "../components/StaticPresentation";
import type { QuizQuestionTarget, QuizTarget } from "./quiz-store";

export function localizedQuestionText(
  value: { en: string; ko: string | null },
  language: LanguageMode,
): string {
  return language === "ko" && value.ko !== null ? value.ko : value.en;
}

export function clampQuestionIndex(index: number, questionCount: number): number {
  return Math.min(Math.max(index, 0), questionCount - 1);
}

export function questionTarget(
  sessionTarget: QuizTarget,
  questionId: Uuid,
): QuizQuestionTarget {
  return `${sessionTarget}:${questionId}`;
}

export function nextSelectedChoiceIds(
  question: ActiveQuestion,
  selectedChoiceIds: readonly Uuid[],
  choiceId: Uuid,
): Uuid[] {
  if (question.requiredChoiceCount === 1) return [choiceId];
  if (selectedChoiceIds.includes(choiceId)) {
    return selectedChoiceIds.filter((selectedId) => selectedId !== choiceId);
  }
  return selectedChoiceIds.length < question.requiredChoiceCount
    ? [...selectedChoiceIds, choiceId]
    : [...selectedChoiceIds];
}

export function createQuestionNavigatorItems(
  sessionTarget: QuizTarget,
  questions: readonly ActiveQuestion[],
  currentIndex: number,
  drafts: Record<QuizQuestionTarget, Uuid[]>,
): QuestionNavigatorItem[] {
  return questions.map((question, index) => {
    const selectedChoiceIds =
      drafts[questionTarget(sessionTarget, question.id)] ?? question.selectedChoiceIds;
    return {
      number: question.displayNumber,
      href: `#question-${question.displayNumber}`,
      state:
        index === currentIndex
          ? "current"
          : selectedChoiceIds.length === question.requiredChoiceCount
            ? "answered"
            : "unanswered",
      flagged: question.flagged,
    };
  });
}
