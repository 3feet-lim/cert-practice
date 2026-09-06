// Feature: cert-quiz-mvp, Property 9
import type { ActiveQuestion } from "@cert-quiz/contracts";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createCertQuizFixtures } from "../mocks/fixtures";
import { QuizQuestionPresenter } from "./QuizQuestionPresenter";
import { createQuizStore } from "./quiz-store";
import { QuizStoreProvider } from "./quiz-store-provider";

const PROPERTY_RUNS = 200;
const PROPERTY_SEED = 9062025;
const PROPERTY_PATH = "";

const fixtureQuestions = createCertQuizFixtures().practice.active.questions;
const MAX_QUESTION_COUNT = fixtureQuestions.length;
const MAX_SELECTION_SEED = Math.max(
  ...fixtureQuestions.map((question) => question.choices.length),
);

type NavigatorState = {
  questionCount: number;
  initialIndex: number;
  directIndex: number;
  selectionSeeds: number[];
  flags: boolean[];
};

const navigatorStateArbitrary = fc
  .record({
    questionCount: fc.integer({ min: 1, max: MAX_QUESTION_COUNT }),
    indexSeed: fc.integer({ min: 0, max: MAX_QUESTION_COUNT - 1 }),
    directIndexSeed: fc.integer({ min: 0, max: MAX_QUESTION_COUNT - 1 }),
    selectionSeeds: fc.array(fc.integer({ min: 0, max: MAX_SELECTION_SEED }), {
      minLength: MAX_QUESTION_COUNT,
      maxLength: MAX_QUESTION_COUNT,
    }),
    flags: fc.array(fc.boolean(), {
      minLength: MAX_QUESTION_COUNT,
      maxLength: MAX_QUESTION_COUNT,
    }),
  })
  .map(
    ({
      questionCount,
      indexSeed,
      directIndexSeed,
      selectionSeeds,
      flags,
    }): NavigatorState => ({
      questionCount,
      initialIndex: indexSeed % questionCount,
      directIndex: directIndexSeed % questionCount,
      selectionSeeds,
      flags,
    }),
  );

function navigatorName(
  question: ActiveQuestion,
  current: boolean,
  flagged: boolean,
): string {
  const state = current
    ? "현재 문항"
    : question.selectedChoiceIds.length === question.requiredChoiceCount
      ? "응답 완료"
      : "미응답";
  return `${question.displayNumber}번 문항, ${state}${flagged ? ", 플래그됨" : ""}`;
}

// Seed and empty replay path make any generated failure reproducible with Vitest output.
describe("Property 9: navigator boundaries and state classification", () => {
  it("lists every question, bounds movement, and classifies current, answered, and flagged states", () => {
    fc.assert(
      fc.property(navigatorStateArbitrary, (state) => {
        const fixtures = createCertQuizFixtures();
        const questions = fixtures.practice.active.questions
          .slice(0, state.questionCount)
          .map((question, index) => ({
            ...question,
            displayNumber: index + 1,
            selectedChoiceIds: question.choices
              .slice(
                0,
                (state.selectionSeeds[index] ?? 0) % (question.choices.length + 1),
              )
              .map((choice) => choice.id),
            flagged: state.flags[index] ?? false,
          }));
        const initialQuestion = questions[state.initialIndex];
        if (!initialQuestion) {
          throw new Error("Expected a generated current question.");
        }

        const store = createQuizStore();
        const sessionTarget = `practice:${fixtures.ids.practiceSessionId}` as const;
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
          const navigator = screen.getByRole("navigation", { name: "문항 탐색" });
          const navigatorButtons = within(navigator).getAllByRole("button");
          expect(navigatorButtons).toHaveLength(state.questionCount);

          for (const [index, button] of navigatorButtons.entries()) {
            const question = questions[index];
            if (!question) throw new Error("Expected a navigator question.");
            expect(button).toHaveTextContent(String(index + 1));
            expect(button).toHaveAccessibleName(
              navigatorName(
                question,
                index === state.initialIndex,
                state.flags[index] ?? false,
              ),
            );
            if (index === state.initialIndex) {
              expect(button).toHaveAttribute("aria-current", "page");
            } else {
              expect(button).not.toHaveAttribute("aria-current");
            }
          }

          const movement = screen.getByRole("navigation", {
            name: "이전 또는 다음 문항",
          });
          const previous = within(movement).getByRole("button", {
            name: "이전 문항",
          });
          const next = within(movement).getByRole("button", { name: "다음 문항" });

          fireEvent.click(navigatorButtons[0]!);
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(0);
          expect(previous).toBeDisabled();
          fireEvent.click(previous);
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(0);

          if (state.questionCount > 1) {
            expect(next).not.toBeDisabled();
            fireEvent.click(next);
            expect(store.getState().currentIndexBySession[sessionTarget]).toBe(1);
          } else {
            expect(next).toBeDisabled();
          }

          fireEvent.click(navigatorButtons[state.questionCount - 1]!);
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(
            state.questionCount - 1,
          );
          expect(next).toBeDisabled();
          fireEvent.click(next);
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(
            state.questionCount - 1,
          );

          if (state.questionCount > 1) {
            expect(previous).not.toBeDisabled();
            fireEvent.click(previous);
            expect(store.getState().currentIndexBySession[sessionTarget]).toBe(
              state.questionCount - 2,
            );
          }

          fireEvent.click(navigatorButtons[state.directIndex]!);
          expect(store.getState().currentIndexBySession[sessionTarget]).toBe(
            state.directIndex,
          );
          expect(navigatorButtons[state.directIndex]).toHaveAttribute(
            "aria-current",
            "page",
          );
        } finally {
          unmount();
          cleanup();
        }
      }),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED, path: PROPERTY_PATH },
    );
  }, 30_000);
});
