import type { ActiveQuestion, LanguageMode, Uuid } from "@cert-quiz/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createCertQuizFixtures } from "../mocks/fixtures";
import {
  createQuestionNavigatorItems,
  localizedQuestionText,
  nextSelectedChoiceIds,
} from "./quiz-presentation";
import {
  createQuizStore,
  type QuizQuestionTarget,
  type QuizTarget,
} from "./quiz-store";

const PROPERTY_RUNS = 200;
const PROPERTY_SEED = 8052008;
const PROPERTY_PATH = "";
const fixtures = createCertQuizFixtures();

type InputMode = "single" | "multiple";

type PresenterState = {
  inputMode: InputMode;
  initialIndex: number;
  language: LanguageMode;
  selectionChoiceIndexes: number[];
  flagged: boolean;
};

function oppositeLanguage(language: LanguageMode): LanguageMode {
  return language === "en" ? "ko" : "en";
}

const presenterStateArbitrary = fc.record({
  inputMode: fc.constantFrom<InputMode>("single", "multiple"),
  initialIndex: fc.integer({ min: 0, max: 2 }),
  language: fc.constantFrom<LanguageMode>("en", "ko"),
  selectionChoiceIndexes: fc.array(fc.integer({ min: 0, max: 3 }), {
    minLength: 1,
    maxLength: 12,
  }),
  flagged: fc.boolean(),
});

// Property 8 checks the production interaction helpers directly. Presenter DOM
// semantics are covered separately by component tests.
describe("Property 8: question input and language state preservation", () => {
  it("keeps capped selections and localized content while language, position, flag, and reveal state change", () => {
    fc.assert(
      fc.property(presenterStateArbitrary, (state: PresenterState) => {
        const submittedQuestion = fixtures.practice.submitted.questions[0];
        const selectionQuestion = fixtures.practice.active.questions.find(
          (question) =>
            question.requiredChoiceCount === (state.inputMode === "single" ? 1 : 2) &&
            question.translationStatus === "translated" &&
            question.id !== submittedQuestion?.id,
        );
        const englishOnlyQuestion = fixtures.practice.active.questions.find(
          (question) =>
            question.translationStatus === "en_only" &&
            question.id !== submittedQuestion?.id &&
            question.id !== selectionQuestion?.id,
        );
        if (
          submittedQuestion?.kind !== "practice-submitted" ||
          !selectionQuestion ||
          !englishOnlyQuestion
        ) {
          throw new Error("Expected fixtures for Property 8 presenter coverage.");
        }

        const questions: readonly ActiveQuestion[] = [
          { ...selectionQuestion, selectedChoiceIds: [], flagged: state.flagged },
          {
            ...englishOnlyQuestion,
            selectedChoiceIds: [],
            flagged: !state.flagged,
          },
          { ...submittedQuestion, flagged: state.flagged },
        ];
        const initialQuestion = questions[state.initialIndex];
        const activeSelectionQuestion = questions[0];
        const activeEnglishOnlyQuestion = questions[1];
        const activeSubmittedQuestion = questions[2];
        if (
          !initialQuestion ||
          !activeSelectionQuestion ||
          !activeEnglishOnlyQuestion ||
          !activeSubmittedQuestion
        ) {
          throw new Error("Expected three presenter questions.");
        }

        const store = createQuizStore();
        const sessionTarget =
          `practice:${fixtures.ids.practiceSessionId}` as QuizTarget;
        const selectionTarget =
          `${sessionTarget}:${activeSelectionQuestion.id}` as QuizQuestionTarget;
        store.getState().hydrateSession(sessionTarget, state.initialIndex);
        store.getState().setLanguage(sessionTarget, state.language);

        expect(store.getState().currentIndexBySession[sessionTarget]).toBe(
          state.initialIndex,
        );
        expect(localizedQuestionText(initialQuestion.stem, state.language)).toBe(
          state.language === "ko" && initialQuestion.stem.ko !== null
            ? initialQuestion.stem.ko
            : initialQuestion.stem.en,
        );

        store.getState().setCurrentIndex(sessionTarget, 0);
        let expectedSelection: Uuid[] = [];
        for (const choiceIndex of state.selectionChoiceIndexes) {
          const choice = activeSelectionQuestion.choices[choiceIndex];
          if (!choice) throw new Error("Expected a generated choice index in range.");
          expectedSelection = nextSelectedChoiceIds(
            activeSelectionQuestion,
            expectedSelection,
            choice.id,
          );
          store.getState().setDraftChoiceIds(selectionTarget, expectedSelection);
          expect(expectedSelection.length).toBeLessThanOrEqual(
            activeSelectionQuestion.requiredChoiceCount,
          );
          expect(store.getState().draftChoiceIdsByQuestion[selectionTarget]).toEqual(
            expectedSelection,
          );
        }

        store.getState().setLanguage(sessionTarget, oppositeLanguage(state.language));
        expect(store.getState().currentIndexBySession[sessionTarget]).toBe(0);
        expect(store.getState().draftChoiceIdsByQuestion[selectionTarget]).toEqual(
          expectedSelection,
        );
        const nextLanguage = oppositeLanguage(state.language);
        expect(localizedQuestionText(activeSelectionQuestion.stem, nextLanguage)).toBe(
          nextLanguage === "ko" && activeSelectionQuestion.stem.ko !== null
            ? activeSelectionQuestion.stem.ko
            : activeSelectionQuestion.stem.en,
        );

        store.getState().setCurrentIndex(sessionTarget, 1);
        expect(localizedQuestionText(activeEnglishOnlyQuestion.stem, "ko")).toBe(
          activeEnglishOnlyQuestion.stem.en,
        );
        expect(store.getState().draftChoiceIdsByQuestion[selectionTarget]).toEqual(
          expectedSelection,
        );

        store.getState().setCurrentIndex(sessionTarget, 2);
        expect(localizedQuestionText(submittedQuestion.explanation, "ko")).toBe(
          submittedQuestion.explanation.ko ?? submittedQuestion.explanation.en,
        );

        const navigatorItems = createQuestionNavigatorItems(
          sessionTarget,
          questions,
          2,
          store.getState().draftChoiceIdsByQuestion,
        );
        expect(navigatorItems).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              state:
                expectedSelection.length === activeSelectionQuestion.requiredChoiceCount
                  ? "answered"
                  : "unanswered",
              flagged: state.flagged,
            }),
            expect.objectContaining({ state: "unanswered", flagged: !state.flagged }),
            expect.objectContaining({ state: "current", flagged: state.flagged }),
          ]),
        );
      }),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED, path: PROPERTY_PATH },
    );
  });
});
