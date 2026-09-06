import type { ActiveQuestion, LanguageMode, Uuid } from "@cert-quiz/contracts";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createCertQuizFixtures } from "../mocks/fixtures";
import { QuizQuestionPresenter } from "./QuizQuestionPresenter";
import { createQuizStore, type QuizQuestionTarget } from "./quiz-store";
import { QuizStoreProvider } from "./quiz-store-provider";

const PROPERTY_RUNS = 200;
const PROPERTY_SEED = 8052008;
const PROPERTY_PATH = "";

type InputMode = "single" | "multiple";

type PresenterState = {
  inputMode: InputMode;
  initialIndex: number;
  language: LanguageMode;
  selectionChoiceIndexes: number[];
  flagged: boolean;
};

function localizedText(
  value: { en: string; ko: string | null },
  language: LanguageMode,
): string {
  return language === "ko" && value.ko !== null ? value.ko : value.en;
}

function oppositeLanguage(language: LanguageMode): LanguageMode {
  return language === "en" ? "ko" : "en";
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

function assertLocalizedQuestion(question: ActiveQuestion, language: LanguageMode) {
  expect(screen.getByText(localizedText(question.stem, language))).toBeVisible();
  for (const choice of question.choices) {
    expect(screen.getByText(localizedText(choice.text, language))).toBeVisible();
  }

  if (question.kind === "practice-submitted") {
    expect(screen.getByRole("heading", { name: "제출 결과" })).toBeVisible();
    expect(
      screen.getByText(localizedText(question.explanation, language)),
    ).toBeVisible();
  }

  if (language === "ko" && question.translationStatus === "en_only") {
    expect(screen.getByRole("status")).toHaveTextContent(
      "한국어 번역이 없어 영어로 표시합니다.",
    );
  } else {
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  }
}

function navigatorName(question: ActiveQuestion, flagged: boolean): RegExp {
  return new RegExp(
    `^${question.displayNumber}번 문항, 현재 문항${flagged ? ", 플래그됨" : ""}$`,
  );
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

describe("Property 8: question input and language state preservation", () => {
  it("keeps capped selections and localized content while language, position, flag, and reveal state change", () => {
    fc.assert(
      fc.property(presenterStateArbitrary, (state: PresenterState) => {
        const fixtures = createCertQuizFixtures();
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
        if (!submittedQuestion || !selectionQuestion || !englishOnlyQuestion) {
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
        const sessionTarget = `practice:${fixtures.ids.practiceSessionId}` as const;
        const selectionTarget =
          `${sessionTarget}:${activeSelectionQuestion.id}` as QuizQuestionTarget;
        const { unmount } = render(
          <QuizStoreProvider store={store}>
            <QuizQuestionPresenter
              initialIndex={state.initialIndex}
              questions={questions}
              sessionTarget={sessionTarget}
            />
          </QuizStoreProvider>,
        );

        try {
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(
            state.initialIndex,
          );
          assertLocalizedQuestion(initialQuestion, "en");

          fireEvent.click(
            screen.getByRole("button", {
              name: state.language === "en" ? "English" : "한국어",
            }),
          );
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(
            state.initialIndex,
          );
          assertLocalizedQuestion(initialQuestion, state.language);

          fireEvent.click(
            screen.getByRole("button", {
              name: new RegExp(`^${activeSelectionQuestion.displayNumber}번 문항`),
            }),
          );
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(0);
          let expectedSelection: Uuid[] = [];
          const inputRole =
            activeSelectionQuestion.requiredChoiceCount === 1 ? "radio" : "checkbox";
          for (const choiceIndex of state.selectionChoiceIndexes) {
            const choice = activeSelectionQuestion.choices[choiceIndex];
            if (!choice) throw new Error("Expected a generated choice index in range.");
            fireEvent.click(screen.getAllByRole(inputRole)[choiceIndex]!);
            expectedSelection = nextSelection(
              activeSelectionQuestion,
              expectedSelection,
              choice.id,
            );
            expect(expectedSelection.length).toBeLessThanOrEqual(
              activeSelectionQuestion.requiredChoiceCount,
            );
            expect(store.getState().draftChoiceIdsByQuestion[selectionTarget]).toEqual(
              expectedSelection,
            );
            screen.getAllByRole(inputRole).forEach((input, index) => {
              const renderedChoice = activeSelectionQuestion.choices[index];
              if (expectedSelection.includes(renderedChoice?.id ?? "")) {
                expect(input).toBeChecked();
              } else {
                expect(input).not.toBeChecked();
              }
            });
          }

          const switchedLanguage = oppositeLanguage(state.language);
          fireEvent.click(
            screen.getByRole("button", {
              name: switchedLanguage === "en" ? "English" : "한국어",
            }),
          );
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(0);
          expect(store.getState().draftChoiceIdsByQuestion[selectionTarget]).toEqual(
            expectedSelection,
          );
          assertLocalizedQuestion(activeSelectionQuestion, switchedLanguage);

          fireEvent.click(
            screen.getByRole("button", {
              name: new RegExp(`^${activeEnglishOnlyQuestion.displayNumber}번 문항`),
            }),
          );
          fireEvent.click(screen.getByRole("button", { name: "한국어" }));
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(1);
          expect(store.getState().draftChoiceIdsByQuestion[selectionTarget]).toEqual(
            expectedSelection,
          );
          assertLocalizedQuestion(activeEnglishOnlyQuestion, "ko");

          fireEvent.click(
            screen.getByRole("button", {
              name: new RegExp(`^${activeSubmittedQuestion.displayNumber}번 문항`),
            }),
          );
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(2);
          assertLocalizedQuestion(activeSubmittedQuestion, "ko");
          expect(
            screen.getByRole("button", {
              name: navigatorName(activeSubmittedQuestion, state.flagged),
            }),
          ).toHaveAttribute("aria-current", "page");

          fireEvent.click(screen.getByRole("button", { name: "English" }));
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(2);
          expect(store.getState().draftChoiceIdsByQuestion[selectionTarget]).toEqual(
            expectedSelection,
          );
          assertLocalizedQuestion(activeSubmittedQuestion, "en");

          fireEvent.click(
            screen.getByRole("button", {
              name: new RegExp(`^${activeSelectionQuestion.displayNumber}번 문항`),
            }),
          );
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(0);
          expect(store.getState().draftChoiceIdsByQuestion[selectionTarget]).toEqual(
            expectedSelection,
          );
          expect(
            screen.getByRole("button", {
              name: navigatorName(activeSelectionQuestion, state.flagged),
            }),
          ).toHaveAttribute("aria-current", "page");
        } finally {
          unmount();
          cleanup();
        }
      }),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED, path: PROPERTY_PATH },
    );
  }, 120_000);
});
