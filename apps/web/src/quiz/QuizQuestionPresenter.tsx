import type { ActiveQuestion, Uuid } from "@cert-quiz/contracts";
import { useEffect, type ReactNode } from "react";

import { QuestionPresenter } from "./QuestionPresenter";
import { type QuizShortcutHandlers, useQuizShortcuts } from "./use-quiz-shortcuts";
import {
  clampQuestionIndex,
  createQuestionNavigatorItems,
  nextSelectedChoiceIds,
  questionTarget,
} from "./quiz-presentation";
import { type QuizTarget, useQuizStore, useQuizStoreApi } from "./quiz-store";

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
    (state) => state.languageBySession[sessionTarget] ?? "ko",
  );
  const drafts = useQuizStore((state) => state.draftChoiceIdsByQuestion);

  useEffect(() => {
    quizStore.getState().hydrateSession(sessionTarget, initialIndex);
  }, [initialIndex, quizStore, sessionTarget]);

  if (questions.length === 0) return null;

  const currentIndex = clampQuestionIndex(
    storedIndex ?? initialIndex,
    questions.length,
  );
  const question = questions[currentIndex];
  if (!question) return null;

  const target = questionTarget(sessionTarget, question.id);
  const selectedChoiceIds = drafts[target] ?? question.selectedChoiceIds;
  const presentedQuestion: ActiveQuestion = { ...question, selectedChoiceIds };
  const items = createQuestionNavigatorItems(
    sessionTarget,
    questions,
    currentIndex,
    drafts,
  );

  const selectChoice = (choiceId: Uuid) => {
    const next = nextSelectedChoiceIds(question, selectedChoiceIds, choiceId);
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
    const boundedIndex = clampQuestionIndex(nextIndex, questions.length);
    quizStore.getState().setCurrentIndex(sessionTarget, boundedIndex);
    onNavigate?.(boundedIndex);
  };

  const submitted = "kind" in question && question.kind === "practice-submitted";
  const canSubmit =
    !interactionDisabled &&
    onSubmit !== undefined &&
    !submitted &&
    !submitPending &&
    selectedChoiceIds.length === question.requiredChoiceCount;

  // Shortcuts live in a child component because this one returns early for empty sessions.
  return (
    <QuizShortcutBinding
      enabled={!interactionDisabled}
      handlers={{
        previous: currentIndex > 0 ? () => navigate(currentIndex - 1) : undefined,
        next:
          currentIndex < questions.length - 1
            ? () => navigate(currentIndex + 1)
            : undefined,
        choose: submitted
          ? undefined
          : (index) => {
              const choice = question.choices[index];
              if (choice) selectChoice(choice.id);
            },
        toggleFlag: onFlagChange
          ? () => onFlagChange(question.id, !question.flagged)
          : undefined,
        submit: canSubmit ? () => onSubmit(question.id, selectedChoiceIds) : undefined,
      }}
    >
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
        showShortcutHint={!interactionDisabled}
      />
    </QuizShortcutBinding>
  );
}

function QuizShortcutBinding({
  enabled,
  handlers,
  children,
}: {
  enabled: boolean;
  handlers: QuizShortcutHandlers;
  children: ReactNode;
}) {
  useQuizShortcuts(handlers, enabled);
  return <>{children}</>;
}
