import type { ActiveQuestion, Uuid } from "@cert-quiz/contracts";
import { useEffect } from "react";

import type { QuestionNavigatorItem } from "../components/StaticPresentation";
import { QuestionPresenter } from "./QuestionPresenter";
import {
  type QuizQuestionTarget,
  type QuizTarget,
  useQuizStore,
  useQuizStoreApi,
} from "./quiz-store";

export interface QuizQuestionPresenterProps {
  sessionTarget: QuizTarget;
  questions: readonly ActiveQuestion[];
  initialIndex: number;
  onAnswerChange?: (questionId: Uuid, selectedChoiceIds: Uuid[]) => void;
  onFlagChange?: (questionId: Uuid, flagged: boolean) => void;
  onNavigate?: (currentIndex: number) => void;
  onSubmit?: (questionId: Uuid, selectedChoiceIds: Uuid[]) => void;
  submitPending?: boolean;
  interactionDisabled?: boolean;
}

function clampIndex(index: number, questionCount: number): number {
  return Math.min(Math.max(index, 0), questionCount - 1);
}

function questionTarget(
  sessionTarget: QuizTarget,
  questionId: Uuid,
): QuizQuestionTarget {
  return `${sessionTarget}:${questionId}`;
}

function nextSelection(
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

function navigatorItems(
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

/**
 * Store-backed adapter for the common presenter. API persistence remains with
 * each mode page; this layer only preserves interaction state across questions.
 */
export function QuizQuestionPresenter({
  sessionTarget,
  questions,
  initialIndex,
  onAnswerChange,
  onFlagChange,
  onNavigate,
  onSubmit,
  submitPending,
  interactionDisabled = false,
}: QuizQuestionPresenterProps) {
  const quizStore = useQuizStoreApi();
  const storedIndex = useQuizStore(
    (state) => state.currentIndexBySession[sessionTarget],
  );
  const language = useQuizStore(
    (state) => state.languageBySession[sessionTarget] ?? "en",
  );
  const drafts = useQuizStore((state) => state.draftChoiceIdsByQuestion);

  useEffect(() => {
    quizStore.getState().hydrateSession(sessionTarget, initialIndex);
  }, [initialIndex, quizStore, sessionTarget]);

  if (questions.length === 0) return null;

  const currentIndex = clampIndex(storedIndex ?? initialIndex, questions.length);
  const question = questions[currentIndex];
  if (!question) return null;

  const target = questionTarget(sessionTarget, question.id);
  const selectedChoiceIds = drafts[target] ?? question.selectedChoiceIds;
  const presentedQuestion: ActiveQuestion = { ...question, selectedChoiceIds };
  const items = navigatorItems(sessionTarget, questions, currentIndex, drafts);

  const selectChoice = (choiceId: Uuid) => {
    const next = nextSelection(question, selectedChoiceIds, choiceId);
    if (
      next.length === selectedChoiceIds.length &&
      next.every((selectedId, index) => selectedId === selectedChoiceIds[index])
    ) {
      return;
    }
    quizStore.getState().setDraftChoiceIds(target, next);
    onAnswerChange?.(question.id, next);
  };

  const navigate = (nextIndex: number) => {
    const boundedIndex = clampIndex(nextIndex, questions.length);
    quizStore.getState().setCurrentIndex(sessionTarget, boundedIndex);
    onNavigate?.(boundedIndex);
  };

  return (
    <QuestionPresenter
      language={language}
      navigatorItems={items}
      nextDisabled={currentIndex === questions.length - 1}
      interactionDisabled={interactionDisabled}
      onChoiceChange={interactionDisabled ? undefined : selectChoice}
      onFlagChange={
        !interactionDisabled && onFlagChange
          ? (flagged) => onFlagChange(question.id, flagged)
          : undefined
      }
      onLanguageChange={
        interactionDisabled
          ? undefined
          : (nextLanguage) =>
              quizStore.getState().setLanguage(sessionTarget, nextLanguage)
      }
      onNavigate={interactionDisabled ? undefined : navigate}
      onSubmit={
        !interactionDisabled &&
        onSubmit &&
        !("kind" in question && question.kind === "practice-submitted")
          ? () => onSubmit(question.id, selectedChoiceIds)
          : undefined
      }
      previousDisabled={interactionDisabled || currentIndex === 0}
      submitPending={submitPending || interactionDisabled}
      question={presentedQuestion}
      totalQuestions={questions.length}
    />
  );
}
