// Feature: cert-quiz-mvp, Property 9
import type { ActiveQuestion } from "@cert-quiz/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createCertQuizFixtures } from "../mocks/fixtures";
import { clampQuestionIndex, createQuestionNavigatorItems } from "./quiz-presentation";
import { createQuizStore, type QuizTarget } from "./quiz-store";

const PROPERTY_RUNS = 200;
const PROPERTY_SEED = 9062025;
const PROPERTY_PATH = "";

const fixtures = createCertQuizFixtures();
const fixtureQuestions = fixtures.practice.active.questions;
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

function expectedNavigatorState(
  question: ActiveQuestion,
  current: boolean,
): "current" | "answered" | "unanswered" {
  if (current) return "current";
  return question.selectedChoiceIds.length === question.requiredChoiceCount
    ? "answered"
    : "unanswered";
}

// Property 9 checks the same production navigation helpers used by the
// presenter. Button semantics are covered separately by component tests.
describe("Property 9: navigator boundaries and state classification", () => {
  it("lists every question, bounds movement, and classifies current, answered, and flagged states", () => {
    fc.assert(
      fc.property(navigatorStateArbitrary, (state) => {
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
        const store = createQuizStore();
        const sessionTarget =
          `practice:${fixtures.ids.practiceSessionId}` as QuizTarget;
        store.getState().hydrateSession(sessionTarget, state.initialIndex);

        const assertNavigator = (currentIndex: number) => {
          const items = createQuestionNavigatorItems(
            sessionTarget,
            questions,
            currentIndex,
            store.getState().draftChoiceIdsByQuestion,
          );
          expect(items).toHaveLength(state.questionCount);
          for (const [index, item] of items.entries()) {
            const question = questions[index];
            if (!question) throw new Error("Expected a navigator question.");
            expect(item).toMatchObject({
              number: index + 1,
              flagged: state.flags[index] ?? false,
              state: expectedNavigatorState(question, index === currentIndex),
            });
          }
        };

        let currentIndex = clampQuestionIndex(state.initialIndex, questions.length);
        assertNavigator(currentIndex);

        currentIndex = clampQuestionIndex(-1, questions.length);
        store.getState().setCurrentIndex(sessionTarget, currentIndex);
        expect(store.getState().currentIndexBySession[sessionTarget]).toBe(0);
        assertNavigator(currentIndex);

        currentIndex = clampQuestionIndex(currentIndex + 1, questions.length);
        store.getState().setCurrentIndex(sessionTarget, currentIndex);
        expect(currentIndex).toBe(Math.min(1, state.questionCount - 1));
        assertNavigator(currentIndex);

        currentIndex = clampQuestionIndex(questions.length, questions.length);
        store.getState().setCurrentIndex(sessionTarget, currentIndex);
        expect(currentIndex).toBe(state.questionCount - 1);
        assertNavigator(currentIndex);

        currentIndex = clampQuestionIndex(currentIndex - 1, questions.length);
        store.getState().setCurrentIndex(sessionTarget, currentIndex);
        expect(currentIndex).toBe(Math.max(0, state.questionCount - 2));
        assertNavigator(currentIndex);

        currentIndex = clampQuestionIndex(state.directIndex, questions.length);
        store.getState().setCurrentIndex(sessionTarget, currentIndex);
        expect(store.getState().currentIndexBySession[sessionTarget]).toBe(
          state.directIndex,
        );
        assertNavigator(currentIndex);
      }),
      { numRuns: PROPERTY_RUNS, seed: PROPERTY_SEED, path: PROPERTY_PATH },
    );
  });
});
