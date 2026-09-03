import { z } from "zod";

import { stateVersionSchema, utcTimestampSchema, uuidSchema } from "./common.js";
import {
  practiceQuestionSchema,
  practiceSubmittedQuestionSchema,
} from "./question-projections.js";

export const practiceSessionSummarySchema = z
  .object({
    practiceSessionId: uuidSchema,
    certificationId: uuidSchema,
    certificationCode: z.string().min(1),
    currentQuestionNumber: z.number().int().positive(),
    totalQuestions: z.number().int().positive(),
    stateVersion: stateVersionSchema,
    updatedAt: utcTimestampSchema,
  })
  .strict();

export const activePracticeSessionsDtoSchema = z
  .object({
    sessions: z.array(practiceSessionSummarySchema),
  })
  .strict();

export const startPracticeRequestSchema = z.object({}).strict();

export const practiceCreatedSchema = z
  .object({
    kind: z.literal("created"),
    practiceSessionId: uuidSchema,
    stateVersion: stateVersionSchema,
  })
  .strict();

export const practiceResumeOrReplaceRequiredSchema = z
  .object({
    kind: z.literal("resume-or-replace-required"),
    session: practiceSessionSummarySchema,
    allowedActions: z.tuple([z.literal("resume"), z.literal("replace")]),
  })
  .strict();

export const startPracticeResponseSchema = z.discriminatedUnion("kind", [
  practiceCreatedSchema,
  practiceResumeOrReplaceRequiredSchema,
]);

export const practiceSessionDtoSchema = z
  .object({
    practiceSessionId: uuidSchema,
    certificationId: uuidSchema,
    certificationCode: z.string().min(1),
    certificationName: z.string().min(1),
    currentIndex: z.number().int().nonnegative(),
    stateVersion: stateVersionSchema,
    questions: z.array(practiceQuestionSchema).min(1),
  })
  .strict();

export const replacePracticeRequestSchema = z
  .object({
    confirmationNonce: z.string().min(1).max(300),
  })
  .strict();

export const practiceAnswerChangeSchema = z
  .object({
    questionId: uuidSchema,
    selectedChoiceIds: z.array(uuidSchema),
  })
  .strict();

export const practiceFlagChangeSchema = z
  .object({
    questionId: uuidSchema,
    flagged: z.boolean(),
  })
  .strict();

export const patchPracticeStateRequestSchema = z
  .object({
    expectedVersion: stateVersionSchema,
    answer: practiceAnswerChangeSchema.optional(),
    flag: practiceFlagChangeSchema.optional(),
    currentIndex: z.number().int().nonnegative().optional(),
  })
  .strict()
  .refine(
    ({ answer, flag, currentIndex }) =>
      answer !== undefined || flag !== undefined || currentIndex !== undefined,
    "At least one practice state change is required",
  );

export const practiceStateResponseSchema = z
  .object({
    practiceSessionId: uuidSchema,
    stateVersion: stateVersionSchema,
    currentIndex: z.number().int().nonnegative(),
  })
  .strict();

export const submitPracticeQuestionRequestSchema = z
  .object({
    expectedVersion: stateVersionSchema,
    selectedChoiceIds: z.array(uuidSchema),
  })
  .strict();

export const submitPracticeQuestionResponseSchema = z
  .object({
    practiceSessionId: uuidSchema,
    stateVersion: stateVersionSchema,
    question: practiceSubmittedQuestionSchema,
    completedPracticeResultId: uuidSchema.optional(),
  })
  .strict();

export type PracticeSessionSummary = z.infer<typeof practiceSessionSummarySchema>;
export type ActivePracticeSessionsDto = z.infer<typeof activePracticeSessionsDtoSchema>;
export type StartPracticeRequest = z.infer<typeof startPracticeRequestSchema>;
export type StartPracticeResponse = z.infer<typeof startPracticeResponseSchema>;
export type PracticeSessionDto = z.infer<typeof practiceSessionDtoSchema>;
export type ReplacePracticeRequest = z.infer<typeof replacePracticeRequestSchema>;
export type PatchPracticeStateRequest = z.infer<typeof patchPracticeStateRequestSchema>;
export type PracticeStateResponse = z.infer<typeof practiceStateResponseSchema>;
export type SubmitPracticeQuestionRequest = z.infer<
  typeof submitPracticeQuestionRequestSchema
>;
export type SubmitPracticeQuestionResponse = z.infer<
  typeof submitPracticeQuestionResponseSchema
>;
