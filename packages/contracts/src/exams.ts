import { z } from "zod";

import { stateVersionSchema, utcTimestampSchema, uuidSchema } from "./common.js";
import { examActiveQuestionSchema } from "./question-projections.js";
import { examResultDtoSchema } from "./results.js";

export const startExamRequestSchema = z
  .object({
    idempotencyKey: z.string().min(1).max(200),
  })
  .strict();

export const startExamResponseSchema = z
  .object({
    examSessionId: uuidSchema,
    stateVersion: stateVersionSchema,
    startedAt: utcTimestampSchema,
    expiresAt: utcTimestampSchema,
    serverNow: utcTimestampSchema,
  })
  .strict();

export const examActiveSessionDtoSchema = z
  .object({
    kind: z.literal("exam-active-session"),
    examSessionId: uuidSchema,
    certificationId: uuidSchema,
    certificationCode: z.string().min(1),
    certificationName: z.string().min(1),
    currentIndex: z.number().int().nonnegative(),
    stateVersion: stateVersionSchema,
    startedAt: utcTimestampSchema,
    expiresAt: utcTimestampSchema,
    serverNow: utcTimestampSchema,
    remainingSeconds: z.number().int().nonnegative(),
    questions: z.array(examActiveQuestionSchema).min(1),
  })
  .strict();

export const examFinalizedRedirectDtoSchema = z
  .object({
    kind: z.literal("exam-finalized"),
    examSessionId: uuidSchema,
    attemptId: uuidSchema,
  })
  .strict();

export const getExamResponseSchema = z.discriminatedUnion("kind", [
  examActiveSessionDtoSchema,
  examFinalizedRedirectDtoSchema,
]);

export const examAnswerChangeSchema = z
  .object({
    questionId: uuidSchema,
    selectedChoiceIds: z.array(uuidSchema),
  })
  .strict();

export const examFlagChangeSchema = z
  .object({
    questionId: uuidSchema,
    flagged: z.boolean(),
  })
  .strict();

export const patchExamStateRequestSchema = z
  .object({
    expectedVersion: stateVersionSchema,
    answer: examAnswerChangeSchema.optional(),
    flag: examFlagChangeSchema.optional(),
    currentIndex: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    ({ answer, flag, currentIndex }) =>
      answer !== undefined || flag !== undefined || currentIndex !== undefined,
    "At least one exam state change is required",
  );

export const examStateResponseSchema = z
  .object({
    examSessionId: uuidSchema,
    stateVersion: stateVersionSchema,
    currentIndex: z.number().int().nonnegative(),
    serverNow: utcTimestampSchema,
    remainingSeconds: z.number().int().nonnegative(),
  })
  .strict();

export const submissionPreviewDtoSchema = z
  .object({
    examSessionId: uuidSchema,
    unansweredQuestionCount: z.number().int().nonnegative(),
    flaggedQuestionCount: z.number().int().nonnegative(),
    stateVersion: stateVersionSchema,
  })
  .strict();

export const submitExamRequestSchema = z.object({}).strict();
export const submitExamResponseSchema = examResultDtoSchema;

export type StartExamRequest = z.infer<typeof startExamRequestSchema>;
export type StartExamResponse = z.infer<typeof startExamResponseSchema>;
export type ExamActiveSessionDto = z.infer<typeof examActiveSessionDtoSchema>;
export type ExamFinalizedRedirectDto = z.infer<typeof examFinalizedRedirectDtoSchema>;
export type GetExamResponse = z.infer<typeof getExamResponseSchema>;
export type PatchExamStateRequest = z.infer<typeof patchExamStateRequestSchema>;
export type ExamStateResponse = z.infer<typeof examStateResponseSchema>;
export type SubmissionPreviewDto = z.infer<typeof submissionPreviewDtoSchema>;
export type SubmitExamRequest = z.infer<typeof submitExamRequestSchema>;
export type SubmitExamResponse = z.infer<typeof submitExamResponseSchema>;
