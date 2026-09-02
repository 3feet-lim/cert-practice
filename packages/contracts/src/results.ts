import { z } from "zod";

import { decimalStringSchema, utcTimestampSchema, uuidSchema } from "./common.js";
import { scoringModeSchema } from "./catalog.js";
import { reviewQuestionSchema } from "./question-projections.js";

export const certificationSnapshotDtoSchema = z
  .object({
    code: z.string().min(1),
    name: z.string().min(1),
    scoringMode: scoringModeSchema,
    passThreshold: decimalStringSchema,
  })
  .strict();

export const domainPerformanceDtoSchema = z
  .object({
    domainName: z.string().min(1),
    questionCount: z.number().int().nonnegative(),
    earnedScore: decimalStringSchema,
    accuracyRate: decimalStringSchema,
  })
  .strict();

export const scoreSummaryDtoSchema = z
  .object({
    rawScore: decimalStringSchema,
    accuracyRate: decimalStringSchema,
  })
  .strict();

export const practiceResultDtoSchema = z
  .object({
    kind: z.literal("practice-result"),
    resultId: uuidSchema,
    certification: certificationSnapshotDtoSchema,
    score: scoreSummaryDtoSchema,
    domains: z.array(domainPerformanceDtoSchema),
    questions: z.array(reviewQuestionSchema).min(1),
    completedAt: utcTimestampSchema,
    expiresAt: utcTimestampSchema,
  })
  .strict();

export const examResultDtoSchema = z
  .object({
    kind: z.literal("exam-result"),
    attemptId: uuidSchema,
    examSessionId: uuidSchema,
    certification: certificationSnapshotDtoSchema,
    score: scoreSummaryDtoSchema,
    reference1000Score: z.number().int().min(0).max(1000),
    passed: z.boolean(),
    domains: z.array(domainPerformanceDtoSchema),
    questions: z.array(reviewQuestionSchema).min(1),
    startedAt: utcTimestampSchema,
    expiresAt: utcTimestampSchema,
    submittedAt: utcTimestampSchema,
    submissionReason: z.enum(["manual", "expired"]),
  })
  .strict();

export type CertificationSnapshotDto = z.infer<typeof certificationSnapshotDtoSchema>;
export type DomainPerformanceDto = z.infer<typeof domainPerformanceDtoSchema>;
export type ScoreSummaryDto = z.infer<typeof scoreSummaryDtoSchema>;
export type PracticeResultDto = z.infer<typeof practiceResultDtoSchema>;
export type ExamResultDto = z.infer<typeof examResultDtoSchema>;
