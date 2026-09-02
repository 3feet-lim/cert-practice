import { z } from "zod";

import { decimalStringSchema, uuidSchema } from "./common.js";

export const languageModeSchema = z.enum(["en", "ko"]);
export const translationStatusSchema = z.enum(["translated", "en_only"]);

export const localizedTextSchema = z
  .object({
    en: z.string().min(1),
    ko: z.string().min(1).nullable(),
  })
  .strict();

export const localizedMarkdownSchema = localizedTextSchema;

export const publicChoiceSchema = z
  .object({
    id: uuidSchema,
    text: localizedTextSchema,
  })
  .strict();

const questionPublicShape = {
  id: uuidSchema,
  displayNumber: z.number().int().positive(),
  domainName: z.string().min(1).max(200),
  stem: localizedTextSchema,
  choices: z.array(publicChoiceSchema).min(1),
  requiredChoiceCount: z.number().int().positive(),
  selectedChoiceIds: z.array(uuidSchema),
  flagged: z.boolean(),
  translationStatus: translationStatusSchema,
};

export const practiceUnsubmittedQuestionSchema = z
  .object({
    kind: z.literal("practice-unsubmitted"),
    ...questionPublicShape,
  })
  .strict();

export const practiceSubmittedQuestionSchema = z
  .object({
    kind: z.literal("practice-submitted"),
    ...questionPublicShape,
    correctChoiceIds: z.array(uuidSchema).min(1),
    isCorrect: z.boolean(),
    earnedScore: decimalStringSchema,
    explanation: localizedMarkdownSchema,
  })
  .strict();

export const examActiveQuestionSchema = z
  .object({
    kind: z.literal("exam-active"),
    ...questionPublicShape,
  })
  .strict();

export const reviewQuestionSchema = z
  .object({
    kind: z.literal("review"),
    ...questionPublicShape,
    correctChoiceIds: z.array(uuidSchema).min(1),
    isCorrect: z.boolean(),
    earnedScore: decimalStringSchema,
    explanation: localizedMarkdownSchema,
  })
  .strict();

export const practiceQuestionSchema = z.discriminatedUnion("kind", [
  practiceUnsubmittedQuestionSchema,
  practiceSubmittedQuestionSchema,
]);

export const activeQuestionSchema = z.discriminatedUnion("kind", [
  practiceUnsubmittedQuestionSchema,
  practiceSubmittedQuestionSchema,
  examActiveQuestionSchema,
]);

export type LanguageMode = z.infer<typeof languageModeSchema>;
export type TranslationStatus = z.infer<typeof translationStatusSchema>;
export type LocalizedText = z.infer<typeof localizedTextSchema>;
export type LocalizedMarkdown = z.infer<typeof localizedMarkdownSchema>;
export type PublicChoice = z.infer<typeof publicChoiceSchema>;
export type PracticeUnsubmittedQuestion = z.infer<
  typeof practiceUnsubmittedQuestionSchema
>;
export type PracticeSubmittedQuestion = z.infer<typeof practiceSubmittedQuestionSchema>;
export type ExamActiveQuestion = z.infer<typeof examActiveQuestionSchema>;
export type ReviewQuestion = z.infer<typeof reviewQuestionSchema>;
export type PracticeQuestion = z.infer<typeof practiceQuestionSchema>;
export type ActiveQuestion = z.infer<typeof activeQuestionSchema>;
