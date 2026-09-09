import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { DomainFailure } from "./errors.js";
import { Fraction } from "./fraction.js";
import { scoreAttempt, type QuestionForScoring, type ScoringMode } from "./scoring.js";

const PROPERTY_RUNS = 200;

type GeneratedQuestion = {
  correctMask: boolean[];
  selectedMask: boolean[];
};

const generatedQuestionArbitrary = fc
  .record({
    size: fc.integer({ min: 1, max: 8 }),
    correctMask: fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
    selectedMask: fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }),
  })
  .map(({ size, correctMask, selectedMask }): GeneratedQuestion => {
    const normalizedCorrect = Array.from(
      { length: size },
      (_, index) => correctMask[index % correctMask.length] ?? false,
    );
    if (!normalizedCorrect.some(Boolean)) normalizedCorrect[0] = true;
    return {
      correctMask: normalizedCorrect,
      selectedMask: Array.from(
        { length: size },
        (_, index) => selectedMask[index % selectedMask.length] ?? false,
      ),
    };
  });

function scoringQuestion(input: GeneratedQuestion, id: string): QuestionForScoring {
  const choiceIds = input.correctMask.map((_, index) => `${id}-choice-${index}`);
  const correctChoiceIds = choiceIds.filter((_, index) => input.correctMask[index]);
  const selectedChoiceIds = choiceIds.filter((_, index) => input.selectedMask[index]);
  return {
    id,
    choiceIds,
    correctChoiceIds,
    requiredChoiceCount: correctChoiceIds.length,
    selectedChoiceIds,
  };
}

function reduced(numerator: bigint, denominator: bigint): [bigint, bigint] {
  const gcd = (left: bigint, right: bigint): bigint => {
    let a = left < 0n ? -left : left;
    let b = right < 0n ? -right : right;
    while (b !== 0n) [a, b] = [b, a % b];
    return a;
  };
  const divisor = gcd(numerator, denominator);
  return [numerator / divisor, denominator / divisor];
}

function oracleQuestion(
  mode: ScoringMode,
  question: QuestionForScoring,
): [bigint, bigint] {
  const selected = new Set(question.selectedChoiceIds);
  const correct = new Set(question.correctChoiceIds);
  const exact =
    selected.size === correct.size && [...selected].every((id) => correct.has(id));
  if (mode === "all_or_nothing") return exact ? [1n, 1n] : [0n, 1n];
  if (selected.size !== question.requiredChoiceCount) return [0n, 1n];
  return reduced(
    BigInt([...selected].filter((id) => correct.has(id)).length),
    BigInt(correct.size),
  );
}

function add(
  [leftNumerator, leftDenominator]: [bigint, bigint],
  [rightNumerator, rightDenominator]: [bigint, bigint],
): [bigint, bigint] {
  return reduced(
    leftNumerator * rightDenominator + rightNumerator * leftDenominator,
    leftDenominator * rightDenominator,
  );
}

// Property 19: exact scoring agrees with an independent bigint rational oracle.
describe("Property 19: exact scoring semantics", () => {
  it("matches all-or-nothing and partial scores, totals, pass decisions, and Reference_1000", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<ScoringMode>("all_or_nothing", "partial"),
        fc.array(generatedQuestionArbitrary, { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 0, max: 100 }),
        (mode, generatedQuestions, threshold) => {
          const questions = generatedQuestions.map((question, index) =>
            scoringQuestion(question, `question-${index}`),
          );
          const actual = scoreAttempt({
            mode,
            passThreshold: Fraction.fromInteger(BigInt(threshold)),
            questions,
          });
          const expectedScores = questions.map((question) =>
            oracleQuestion(mode, question),
          );
          const expectedRaw = expectedScores.reduce(add, [0n, 1n]);
          const expectedAccuracy = reduced(
            expectedRaw[0] * 100n,
            expectedRaw[1] * BigInt(questions.length),
          );
          const expectedReference =
            (expectedAccuracy[0] * 10n * 2n + expectedAccuracy[1]) /
            (expectedAccuracy[1] * 2n);

          expect(
            actual.questions.map(({ earnedScore }) => [
              earnedScore.numerator,
              earnedScore.denominator,
            ]),
          ).toEqual(expectedScores);
          expect([actual.rawScore.numerator, actual.rawScore.denominator]).toEqual(
            expectedRaw,
          );
          expect([
            actual.accuracyRate.numerator,
            actual.accuracyRate.denominator,
          ]).toEqual(expectedAccuracy);
          expect(actual.passed).toBe(
            expectedAccuracy[0] >= BigInt(threshold) * expectedAccuracy[1],
          );
          expect(actual.reference1000Score).toBe(Number(expectedReference));
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});

// Property 20: display rounding never participates in exact pass decisions, and invalid inputs finalize nothing.
describe("Property 20: display/decision separation and invalid configuration", () => {
  it("uses exact comparisons even when two-place display values coincide", () => {
    const result = scoreAttempt({
      mode: "partial",
      passThreshold: Fraction.parseDecimal("66.667"),
      questions: [
        {
          id: "rounded-boundary",
          choiceIds: ["a", "b", "c", "d"],
          correctChoiceIds: ["a", "b", "c"],
          requiredChoiceCount: 3,
          selectedChoiceIds: ["a", "b", "d"],
        },
      ],
    });

    expect(result.accuracyRate.displayDecimal()).toBe("66.67");
    expect(result.passed).toBe(false);
  });

  it("rejects every generated invalid mode, threshold, or choice configuration before producing a score", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("unknown", "", "ALL_OR_NOTHING"),
        fc.integer({ min: -100, max: 200 }),
        fc.integer({ min: -2, max: 5 }),
        (invalidMode, threshold, requiredChoiceCount) => {
          const input = {
            mode: invalidMode,
            passThreshold: Fraction.fromInteger(BigInt(threshold)),
            questions: [
              {
                id: "invalid",
                choiceIds: ["a", "b"],
                correctChoiceIds: ["a"],
                requiredChoiceCount,
                selectedChoiceIds: [],
              },
            ],
          };
          expect(() => scoreAttempt(input)).toThrow(DomainFailure);
        },
      ),
      { numRuns: PROPERTY_RUNS },
    );
  });
});
