import { domainFailure } from "./errors.js";
import { Fraction } from "./fraction.js";

export type ScoringMode = "all_or_nothing" | "partial";

export type QuestionForScoring = {
  id: string;
  choiceIds: readonly string[];
  correctChoiceIds: readonly string[];
  requiredChoiceCount: number;
  selectedChoiceIds: readonly string[];
};

export type AttemptScoringInput = {
  mode: ScoringMode | string;
  passThreshold: Fraction;
  questions: readonly QuestionForScoring[];
};

export type ScoredQuestion = {
  questionId: string;
  earnedScore: Fraction;
  isCorrect: boolean;
};

export type AttemptScore = {
  questions: readonly ScoredQuestion[];
  rawScore: Fraction;
  accuracyRate: Fraction;
  passed: boolean;
  reference1000Score: number;
};

export function scoreQuestion(
  mode: ScoringMode,
  question: QuestionForScoring,
): ScoredQuestion {
  validateQuestion(question);
  const selected = new Set(question.selectedChoiceIds);
  const correct = new Set(question.correctChoiceIds);
  const exactMatch =
    selected.size === correct.size && [...selected].every((id) => correct.has(id));

  const earnedScore =
    mode === "all_or_nothing"
      ? Fraction.fromInteger(exactMatch ? 1n : 0n)
      : selected.size !== question.requiredChoiceCount
        ? Fraction.fromInteger(0n)
        : Fraction.of(
            BigInt([...selected].filter((id) => correct.has(id)).length),
            BigInt(correct.size),
          );

  return { questionId: question.id, earnedScore, isCorrect: exactMatch };
}

export function scoreAttempt(input: AttemptScoringInput): AttemptScore {
  validateAttemptInput(input);
  const mode = input.mode;
  if (mode !== "all_or_nothing" && mode !== "partial") {
    throw domainFailure("invalid-scoring-configuration", [
      {
        path: ["scoringMode"],
        reason: "Scoring mode must be all_or_nothing or partial.",
        actual: mode,
      },
    ]);
  }

  const questions = input.questions.map((question) => scoreQuestion(mode, question));
  const rawScore = questions.reduce(
    (total, question) => total.add(question.earnedScore),
    Fraction.fromInteger(0n),
  );
  const accuracyRate = rawScore
    .divide(Fraction.fromInteger(BigInt(input.questions.length)))
    .multiply(Fraction.fromInteger(100n));
  const reference1000 = accuracyRate
    .multiply(Fraction.fromInteger(10n))
    .add(Fraction.of(1n, 2n))
    .floor();

  return {
    questions,
    rawScore,
    accuracyRate,
    passed: accuracyRate.compare(input.passThreshold) >= 0,
    reference1000Score: Number(reference1000),
  };
}

function validateAttemptInput(input: AttemptScoringInput): void {
  if (input.questions.length === 0) {
    throw domainFailure("invalid-scoring-configuration", [
      { path: ["questions"], reason: "At least one question is required." },
    ]);
  }
  if (
    input.passThreshold.isNegative() ||
    input.passThreshold.compare(Fraction.of(100n)) > 0
  ) {
    throw domainFailure("invalid-scoring-configuration", [
      {
        path: ["passThreshold"],
        reason: "Pass threshold must be between 0 and 100 inclusive.",
      },
    ]);
  }
  for (const question of input.questions) validateQuestion(question);
}

function validateQuestion(question: QuestionForScoring): void {
  const choices = new Set(question.choiceIds);
  const correct = new Set(question.correctChoiceIds);
  const selected = new Set(question.selectedChoiceIds);
  const invalidCorrect = [...correct].find((id) => !choices.has(id));
  const invalidSelected = [...selected].find((id) => !choices.has(id));

  if (
    question.requiredChoiceCount < 1 ||
    question.requiredChoiceCount > choices.size ||
    choices.size !== question.choiceIds.length
  ) {
    throw invalidQuestion(
      question,
      "requiredChoiceCount",
      "Required choice count is outside the choice set.",
    );
  }
  if (
    correct.size === 0 ||
    correct.size !== question.correctChoiceIds.length ||
    invalidCorrect
  ) {
    throw invalidQuestion(
      question,
      "correctChoiceIds",
      "Correct choices must be a non-empty unique subset.",
      invalidCorrect,
    );
  }
  if (correct.size !== question.requiredChoiceCount) {
    throw invalidQuestion(
      question,
      "requiredChoiceCount",
      "Required choice count must equal the number of correct choices.",
    );
  }
  if (selected.size !== question.selectedChoiceIds.length || invalidSelected) {
    throw invalidQuestion(
      question,
      "selectedChoiceIds",
      "Selected choices must be a unique subset.",
      invalidSelected,
    );
  }
}

function invalidQuestion(
  question: QuestionForScoring,
  field: string,
  reason: string,
  invalidId?: string,
): never {
  throw domainFailure("invalid-scoring-configuration", [
    {
      path: ["questions", question.id, field],
      reason,
      identifier: invalidId ?? question.id,
    },
  ]);
}
