import {
  examActiveQuestionSchema,
  practiceSubmittedQuestionSchema,
  practiceUnsubmittedQuestionSchema,
  reviewQuestionSchema,
  type ExamActiveQuestion,
  type LocalizedMarkdown,
  type LocalizedText,
  type PracticeSubmittedQuestion,
  type PracticeUnsubmittedQuestion,
  type ReviewQuestion,
  type Uuid,
} from "@cert-quiz/contracts";

export type SnapshotChoice = {
  id: Uuid;
  text: LocalizedText;
};

export type QuestionSnapshot = {
  id: Uuid;
  displayNumber: number;
  domainName: string;
  stem: LocalizedText;
  choices: readonly SnapshotChoice[];
  requiredChoiceCount: number;
  selectedChoiceIds: readonly Uuid[];
  flagged: boolean;
  translationStatus: "translated" | "en_only";
  correctChoiceIds: readonly Uuid[];
  isCorrect: boolean;
  earnedScore: string;
  explanation: LocalizedMarkdown;
};

function publicQuestion(snapshot: QuestionSnapshot) {
  return {
    id: snapshot.id,
    displayNumber: snapshot.displayNumber,
    domainName: snapshot.domainName,
    stem: snapshot.stem,
    choices: [...snapshot.choices],
    requiredChoiceCount: snapshot.requiredChoiceCount,
    selectedChoiceIds: [...snapshot.selectedChoiceIds],
    flagged: snapshot.flagged,
    translationStatus: snapshot.translationStatus,
  };
}

function revealedQuestion(snapshot: QuestionSnapshot) {
  return {
    ...publicQuestion(snapshot),
    correctChoiceIds: [...snapshot.correctChoiceIds],
    isCorrect: snapshot.isCorrect,
    earnedScore: snapshot.earnedScore,
    explanation: snapshot.explanation,
  };
}

export function projectPracticeUnsubmitted(
  snapshot: QuestionSnapshot,
): PracticeUnsubmittedQuestion {
  return practiceUnsubmittedQuestionSchema.parse({
    kind: "practice-unsubmitted",
    ...publicQuestion(snapshot),
  });
}

export function projectPracticeSubmitted(
  snapshot: QuestionSnapshot,
): PracticeSubmittedQuestion {
  return practiceSubmittedQuestionSchema.parse({
    kind: "practice-submitted",
    ...revealedQuestion(snapshot),
  });
}

export function projectExamActive(snapshot: QuestionSnapshot): ExamActiveQuestion {
  return examActiveQuestionSchema.parse({
    kind: "exam-active",
    ...publicQuestion(snapshot),
  });
}

export function projectReview(snapshot: QuestionSnapshot): ReviewQuestion {
  return reviewQuestionSchema.parse({ kind: "review", ...revealedQuestion(snapshot) });
}
