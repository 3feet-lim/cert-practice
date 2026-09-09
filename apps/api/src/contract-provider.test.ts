import {
  examActiveQuestionSchema,
  practiceSubmittedQuestionSchema,
  practiceUnsubmittedQuestionSchema,
  reviewQuestionSchema,
  type Uuid,
} from "@cert-quiz/contracts";
import {
  projectExamActive,
  projectPracticeSubmitted,
  projectPracticeUnsubmitted,
  projectReview,
  type QuestionSnapshot,
} from "@cert-quiz/domain";
import { describe, expect, it } from "vitest";

const id = (value: string) => value as Uuid;
const snapshot: QuestionSnapshot = {
  id: id("11111111-1111-4111-8111-111111111111"),
  displayNumber: 1,
  domainName: "Delivery",
  stem: { en: "Question", ko: "문제" },
  choices: [
    {
      id: id("22222222-2222-4222-8222-222222222222"),
      text: { en: "Answer", ko: "답" },
    },
  ],
  requiredChoiceCount: 1,
  selectedChoiceIds: [id("22222222-2222-4222-8222-222222222222")],
  flagged: false,
  translationStatus: "translated",
  correctChoiceIds: [id("22222222-2222-4222-8222-222222222222")],
  isCorrect: true,
  earnedScore: "1",
  explanation: { en: "Explanation", ko: "해설" },
};

/** Locks backend provider DTOs to the four strict frontend contract shapes. */
describe("backend projection contract provider", () => {
  it("provides exactly the documented mode/reveal response matrix", () => {
    const matrix = [
      [projectPracticeUnsubmitted(snapshot), practiceUnsubmittedQuestionSchema],
      [projectPracticeSubmitted(snapshot), practiceSubmittedQuestionSchema],
      [projectExamActive(snapshot), examActiveQuestionSchema],
      [projectReview(snapshot), reviewQuestionSchema],
    ] as const;

    for (const [response, schema] of matrix) {
      expect(schema.parse(response)).toEqual(response);
    }

    for (const response of [
      projectPracticeUnsubmitted(snapshot),
      projectExamActive(snapshot),
    ]) {
      expect(response).not.toHaveProperty("correctChoiceIds");
      expect(response).not.toHaveProperty("isCorrect");
      expect(response).not.toHaveProperty("earnedScore");
      expect(response).not.toHaveProperty("explanation");
    }
  });
});
