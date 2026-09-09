import { describe, expect, it } from "vitest";

import {
  FixedClock,
  SequenceRandomSource,
  SequenceUuidFactory,
  hasExpired,
  isWithinHalfOpenInterval,
  projectExamActive,
  projectPracticeSubmitted,
  projectPracticeUnsubmitted,
  projectReview,
  remainingWholeSeconds,
  toCanonicalUtcTimestamp,
  type QuestionSnapshot,
} from "./index.js";

const SNAPSHOT: QuestionSnapshot = {
  id: "11111111-1111-4111-8111-111111111111",
  displayNumber: 1,
  domainName: "Delivery",
  stem: { en: "Question", ko: "문제" },
  choices: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      text: { en: "Correct", ko: "정답" },
    },
  ],
  requiredChoiceCount: 1,
  selectedChoiceIds: ["22222222-2222-4222-8222-222222222222"],
  flagged: false,
  translationStatus: "translated",
  correctChoiceIds: ["22222222-2222-4222-8222-222222222222"],
  isCorrect: true,
  earnedScore: "1",
  explanation: { en: "Explanation", ko: "해설" },
};

describe("domain time and deterministic ports", () => {
  it("uses UTC copies and [start, end) expiration boundaries", () => {
    const start = new Date("2026-01-01T00:00:00.000Z");
    const end = new Date("2026-01-08T00:00:00.000Z");
    const clock = new FixedClock(start);

    expect(toCanonicalUtcTimestamp(clock.now())).toBe("2026-01-01T00:00:00.000Z");
    expect(isWithinHalfOpenInterval(start, start, end)).toBe(true);
    expect(isWithinHalfOpenInterval(end, start, end)).toBe(false);
    expect(hasExpired(end, end)).toBe(true);
    expect(remainingWholeSeconds(new Date(end.getTime() - 1), end)).toBe(0);
    clock.advance(1_000);
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:01.000Z");
  });

  it("supplies deterministic bounded random and UUID ports", () => {
    const random = new SequenceRandomSource([0, 2]);
    const ids = new SequenceUuidFactory(["first", "second"]);

    expect(random.nextInt(3)).toBe(0);
    expect(random.nextInt(3)).toBe(2);
    expect(ids.next()).toBe("first");
    expect(ids.next()).toBe("second");
  });
});

describe("strict SnapshotProjector", () => {
  it("omits reveal fields before reveal and emits only the four shared contract shapes", () => {
    const unsubmitted = projectPracticeUnsubmitted(SNAPSHOT);
    const activeExam = projectExamActive(SNAPSHOT);
    const submitted = projectPracticeSubmitted(SNAPSHOT);
    const review = projectReview(SNAPSHOT);

    for (const value of [unsubmitted, activeExam]) {
      expect(value).not.toHaveProperty("correctChoiceIds");
      expect(value).not.toHaveProperty("isCorrect");
      expect(value).not.toHaveProperty("earnedScore");
      expect(value).not.toHaveProperty("explanation");
    }
    expect(submitted).toMatchObject({ kind: "practice-submitted", earnedScore: "1" });
    expect(review).toMatchObject({ kind: "review", earnedScore: "1" });
  });
});
