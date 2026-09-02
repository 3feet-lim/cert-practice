import fc from "fast-check";
import { describe, expect, expectTypeOf, it } from "vitest";

import * as contracts from "../src/index.js";

const IDS = {
  user: "00000000-0000-4000-8000-000000000001",
  provider: "00000000-0000-4000-8000-000000000002",
  certification: "00000000-0000-4000-8000-000000000003",
  domain: "00000000-0000-4000-8000-000000000004",
  question: "00000000-0000-4000-8000-000000000005",
  choice: "00000000-0000-4000-8000-000000000006",
  choiceTwo: "00000000-0000-4000-8000-000000000007",
  practice: "00000000-0000-4000-8000-000000000008",
  exam: "00000000-0000-4000-8000-000000000009",
  attempt: "00000000-0000-4000-8000-00000000000a",
  result: "00000000-0000-4000-8000-00000000000b",
  validation: "00000000-0000-4000-8000-00000000000c",
  revision: "00000000-0000-4000-8000-00000000000d",
} as const;

const timestamp = "2026-03-23T12:34:56.000Z";
const localizedText = { en: "English text", ko: "한국어 텍스트" } as const;
const choices = [
  { id: IDS.choice, text: localizedText },
  { id: IDS.choiceTwo, text: { en: "Second choice", ko: "두 번째 선지" } },
];
const publicQuestion = {
  id: IDS.question,
  displayNumber: 1,
  domainName: "SDLC Automation",
  stem: localizedText,
  choices,
  requiredChoiceCount: 1,
  selectedChoiceIds: [IDS.choice],
  flagged: false,
  translationStatus: "translated" as const,
};
const reviewFields = {
  correctChoiceIds: [IDS.choice],
  isCorrect: true,
  earnedScore: "1",
  explanation: localizedText,
};
const reviewQuestion = { kind: "review" as const, ...publicQuestion, ...reviewFields };
const certificationSnapshot = {
  code: "DOP-C02",
  name: "AWS Certified DevOps Engineer – Professional",
  scoringMode: "all_or_nothing" as const,
  passThreshold: "75",
};
const domainPerformance = {
  domainName: "SDLC Automation",
  questionCount: 1,
  earnedScore: "1",
  accuracyRate: "100",
};

function expectParses(
  schema: { parse: (value: unknown) => unknown },
  value: unknown,
): void {
  expect(() => schema.parse(value)).not.toThrow();
}

describe("transport primitives and envelopes", () => {
  it("accepts canonical UUID, UTC timestamp, decimal, request ID, and State_Version values", () => {
    expect(contracts.uuidSchema.parse(IDS.user)).toBe(IDS.user);
    expect(contracts.utcTimestampSchema.parse(timestamp)).toBe(timestamp);
    expect(contracts.decimalStringSchema.parse("66.6666666666666667")).toBe(
      "66.6666666666666667",
    );
    expect(contracts.requestIdSchema.parse("api-gw:req_123.abc")).toBe(
      "api-gw:req_123.abc",
    );
    expect(contracts.stateVersionSchema.parse(0)).toBe(0);
    expect(contracts.retryableSchema.parse(true)).toBe(true);
  });

  it("rejects non-UTC, non-canonical decimal, unsafe version, and unknown envelope fields", () => {
    expect(
      contracts.utcTimestampSchema.safeParse("2026-03-23T21:34:56+09:00").success,
    ).toBe(false);
    expect(contracts.decimalStringSchema.safeParse("01.20").success).toBe(false);
    expect(contracts.stateVersionSchema.safeParse(-1).success).toBe(false);
    expect(
      contracts.errorEnvelopeSchema.safeParse({
        error: {
          code: "dependency-unavailable",
          message: "Please retry.",
          requestId: "request-1",
          retryable: true,
          secret: "must-not-pass",
        },
      }).success,
    ).toBe(false);
  });

  it("parses success and safe error envelopes", () => {
    expectParses(contracts.successEnvelopeSchema(contracts.approvalStatusDtoSchema), {
      data: { approvalStatus: "pending" },
      meta: { requestId: "request-2", serverNow: timestamp },
    });
    expectParses(contracts.errorEnvelopeSchema, {
      error: {
        code: "validation-failed",
        message: "Fix the highlighted input.",
        requestId: "request-3",
        retryable: false,
        nextAction: "Edit the input and submit again.",
        details: [{ path: ["content", 1], reason: "Required value is missing." }],
      },
    });
  });
});

describe("auth, approval, and catalog DTOs", () => {
  it("parses pending/approved user contracts and an empty pending list", () => {
    expectParses(contracts.approvalStatusDtoSchema, { approvalStatus: "pending" });
    expectParses(contracts.currentUserDtoSchema, {
      id: IDS.user,
      displayName: "Learner",
      email: "learner@example.com",
      role: "user",
      approvalStatus: "approved",
      scorePublic: false,
      stateVersion: 0,
    });
    expectParses(contracts.updateScoreVisibilityRequestSchema, {
      scorePublic: true,
      expectedVersion: 0,
    });
    expectParses(contracts.pendingUsersDtoSchema, { users: [] });
    expectParses(contracts.approveUserResponseSchema, {
      userId: IDS.user,
      approvalStatus: "approved",
    });
  });

  it("parses provider-grouped catalog data and safe invalid-data details", () => {
    expectParses(contracts.catalogDtoSchema, {
      providers: [
        {
          id: IDS.provider,
          name: "AWS",
          logoUrl: null,
          certifications: [
            {
              id: IDS.certification,
              code: "DOP-C02",
              name: certificationSnapshot.name,
              totalQuestions: 75,
              timeLimitMinutes: 180,
              passThreshold: "75",
              scoringMode: "all_or_nothing",
              domains: [
                {
                  id: IDS.domain,
                  name: "SDLC Automation",
                  weightPercent: "22",
                  questionCount: 20,
                  allocatedQuestionCount: 17,
                },
              ],
            },
          ],
        },
      ],
      dataErrors: [
        {
          kind: "insufficient-domain",
          certificationId: IDS.certification,
          domainName: "Security",
          availableQuestionCount: 1,
          requiredQuestionCount: 13,
        },
      ],
    });
  });
});

describe("strict question projections", () => {
  it("keeps reveal fields out of pre-reveal TypeScript types", () => {
    expectTypeOf<contracts.PracticeUnsubmittedQuestion>().not.toHaveProperty(
      "correctChoiceIds",
    );
    expectTypeOf<contracts.PracticeUnsubmittedQuestion>().not.toHaveProperty(
      "isCorrect",
    );
    expectTypeOf<contracts.PracticeUnsubmittedQuestion>().not.toHaveProperty(
      "earnedScore",
    );
    expectTypeOf<contracts.PracticeUnsubmittedQuestion>().not.toHaveProperty(
      "explanation",
    );
    expectTypeOf<contracts.ExamActiveQuestion>().not.toHaveProperty("correctChoiceIds");
    expectTypeOf<contracts.ExamActiveQuestion>().not.toHaveProperty("isCorrect");
    expectTypeOf<contracts.ExamActiveQuestion>().not.toHaveProperty("earnedScore");
    expectTypeOf<contracts.ExamActiveQuestion>().not.toHaveProperty("explanation");
  });

  it("parses all four distinct projection variants", () => {
    expectParses(contracts.practiceUnsubmittedQuestionSchema, {
      kind: "practice-unsubmitted",
      ...publicQuestion,
    });
    expectParses(contracts.practiceSubmittedQuestionSchema, {
      kind: "practice-submitted",
      ...publicQuestion,
      ...reviewFields,
    });
    expectParses(contracts.examActiveQuestionSchema, {
      kind: "exam-active",
      ...publicQuestion,
    });
    expectParses(contracts.reviewQuestionSchema, reviewQuestion);
  });

  it("rejects reveal fields in pre-reveal JSON", () => {
    for (const schema of [
      contracts.practiceUnsubmittedQuestionSchema,
      contracts.examActiveQuestionSchema,
    ]) {
      for (const [field, value] of Object.entries(reviewFields)) {
        const kind =
          schema === contracts.examActiveQuestionSchema
            ? "exam-active"
            : "practice-unsubmitted";
        expect(
          schema.safeParse({ kind, ...publicQuestion, [field]: value }).success,
        ).toBe(false);
      }
    }
  });

  // **Validates: Requirements 8.9, 10.7**
  it("rejects every generated pre-reveal payload containing a reveal field", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("correctChoiceIds", "isCorrect", "earnedScore", "explanation"),
        fc.jsonValue(),
        fc.constantFrom("practice-unsubmitted", "exam-active"),
        (field, value, kind) => {
          const schema =
            kind === "practice-unsubmitted"
              ? contracts.practiceUnsubmittedQuestionSchema
              : contracts.examActiveQuestionSchema;
          expect(
            schema.safeParse({ kind, ...publicQuestion, [field]: value }).success,
          ).toBe(false);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("practice and exam DTOs", () => {
  it("parses practice start, active session, state, and submitted question contracts", () => {
    expectParses(contracts.startPracticeResponseSchema, {
      kind: "resume-or-replace-required",
      session: {
        practiceSessionId: IDS.practice,
        certificationId: IDS.certification,
        certificationCode: "DOP-C02",
        currentQuestionNumber: 1,
        totalQuestions: 75,
        stateVersion: 2,
        updatedAt: timestamp,
      },
      allowedActions: ["resume", "replace"],
    });
    expectParses(contracts.practiceSessionDtoSchema, {
      practiceSessionId: IDS.practice,
      certificationId: IDS.certification,
      certificationCode: "DOP-C02",
      certificationName: certificationSnapshot.name,
      currentIndex: 0,
      stateVersion: 2,
      questions: [{ kind: "practice-unsubmitted", ...publicQuestion }],
    });
    expectParses(contracts.patchPracticeStateRequestSchema, {
      expectedVersion: 2,
      flag: { questionId: IDS.question, flagged: true },
    });
    expectParses(contracts.submitPracticeQuestionResponseSchema, {
      practiceSessionId: IDS.practice,
      stateVersion: 3,
      question: { kind: "practice-submitted", ...publicQuestion, ...reviewFields },
      completedPracticeResultId: IDS.result,
    });
  });

  it("parses active/finalized exam, state, preview, and submission contracts", () => {
    expectParses(contracts.startExamRequestSchema, { idempotencyKey: "exam-start-1" });
    expectParses(contracts.examActiveSessionDtoSchema, {
      kind: "exam-active-session",
      examSessionId: IDS.exam,
      certificationId: IDS.certification,
      certificationCode: "DOP-C02",
      certificationName: certificationSnapshot.name,
      currentIndex: 0,
      stateVersion: 1,
      startedAt: timestamp,
      expiresAt: "2026-03-23T15:34:56.000Z",
      serverNow: timestamp,
      remainingSeconds: 10_800,
      questions: [{ kind: "exam-active", ...publicQuestion }],
    });
    expectParses(contracts.getExamResponseSchema, {
      kind: "exam-finalized",
      examSessionId: IDS.exam,
      attemptId: IDS.attempt,
    });
    expectParses(contracts.patchExamStateRequestSchema, {
      expectedVersion: 1,
      answer: { questionId: IDS.question, selectedChoiceIds: [IDS.choice] },
    });
    expectParses(contracts.submissionPreviewDtoSchema, {
      examSessionId: IDS.exam,
      unansweredQuestionCount: 74,
      flaggedQuestionCount: 1,
      stateVersion: 1,
    });
  });
});

describe("result, history, and leaderboard DTOs", () => {
  const examResult = {
    kind: "exam-result" as const,
    attemptId: IDS.attempt,
    examSessionId: IDS.exam,
    certification: certificationSnapshot,
    score: { rawScore: "1", accuracyRate: "100" },
    reference1000Score: 1000,
    passed: true,
    domains: [domainPerformance],
    questions: [reviewQuestion],
    startedAt: timestamp,
    expiresAt: "2026-03-23T15:34:56.000Z",
    submittedAt: "2026-03-23T13:34:56.000Z",
    submissionReason: "manual" as const,
  };

  it("parses complete practice and exam review results", () => {
    expectParses(contracts.practiceResultDtoSchema, {
      kind: "practice-result",
      resultId: IDS.result,
      certification: certificationSnapshot,
      score: { rawScore: "1", accuracyRate: "100" },
      domains: [domainPerformance],
      questions: [reviewQuestion],
      completedAt: timestamp,
      expiresAt: "2026-03-30T12:34:56.000Z",
    });
    expectParses(contracts.examResultDtoSchema, examResult);
    expectParses(contracts.submitExamResponseSchema, examResult);
  });

  it("parses empty and populated history/trend DTOs", () => {
    expectParses(contracts.historyPageDtoSchema, { attempts: [], nextCursor: null });
    expectParses(contracts.historyTrendsDtoSchema, {
      certifications: [
        {
          certificationId: IDS.certification,
          certificationCode: "DOP-C02",
          certificationName: certificationSnapshot.name,
          attemptCount: 1,
          points: [
            { attemptId: IDS.attempt, accuracyRate: "100", submittedAt: timestamp },
          ],
        },
      ],
    });
  });

  it("parses public leaderboard entries without private identity fields", () => {
    const leaderboard = {
      certificationId: IDS.certification,
      certificationCode: "DOP-C02",
      certificationName: certificationSnapshot.name,
      entries: [
        {
          rank: 1,
          userId: IDS.user,
          displayName: "Learner",
          accuracyRate: "100",
          rawScore: "75",
          attemptId: IDS.attempt,
          submittedAt: timestamp,
          isCurrentUser: true,
        },
      ],
    };
    expectParses(contracts.leaderboardDtoSchema, leaderboard);
    expect(
      contracts.leaderboardDtoSchema.safeParse({
        ...leaderboard,
        email: "private@example.com",
      }).success,
    ).toBe(false);
  });
});

describe("admin import DTOs", () => {
  const content = JSON.stringify({ provider: { id: "aws", name: "AWS" } });
  const available = { status: "available" as const, value: 1 };

  it("parses strict import documents and dry-run requests", () => {
    expectParses(contracts.importDocumentSchema, {
      provider: { id: "aws", name: "AWS" },
      certification: {
        id: "dop-c02",
        code: "DOP-C02",
        name: certificationSnapshot.name,
        totalQuestions: 75,
        timeLimitMinutes: 180,
        passThreshold: "75",
        scoringMode: "all_or_nothing",
        domains: [{ id: "sdlc", name: "SDLC Automation", weightPercent: "100" }],
        questions: [
          {
            id: "q1",
            domainId: "sdlc",
            stemEn: "Question",
            explanationEn: "Explanation",
            requiredChoiceCount: 1,
            correctChoiceIds: ["a"],
            choices: [{ id: "a", textEn: "Answer" }],
          },
        ],
      },
    });
    expectParses(contracts.dryRunImportRequestSchema, { content });
  });

  it("requires commit credentials only for a successful dry run", () => {
    expectParses(contracts.dryRunImportResponseSchema, {
      valid: true,
      summary: {
        totalQuestions: available,
        domainQuestionCounts: { sdlc: available },
        translationStatusCounts: {
          translated: available,
          enOnly: { status: "available", value: 0 },
        },
        errorCount: 0,
      },
      errors: [],
      validationId: IDS.validation,
      commitToken: "a".repeat(64),
      expiresAt: timestamp,
    });
    expect(
      contracts.dryRunImportResponseSchema.safeParse({
        valid: true,
        summary: {
          totalQuestions: available,
          domainQuestionCounts: {},
          translationStatusCounts: { translated: available, enOnly: available },
          errorCount: 0,
        },
        errors: [],
      }).success,
    ).toBe(false);
  });

  it("parses commit requests and responses", () => {
    expectParses(contracts.commitImportRequestSchema, {
      validationId: IDS.validation,
      commitToken: "b".repeat(64),
      content,
    });
    expectParses(contracts.commitImportResponseSchema, {
      validationId: IDS.validation,
      certificationId: IDS.certification,
      activatedRevisionId: IDS.revision,
      committedAt: timestamp,
    });
  });
});
