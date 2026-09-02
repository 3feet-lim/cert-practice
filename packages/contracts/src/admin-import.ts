import { z } from "zod";

import { decimalStringSchema, utcTimestampSchema, uuidSchema } from "./common.js";
import { scoringModeSchema } from "./catalog.js";

const externalKeySchema = z.string().trim().min(1).max(200);
const requiredContentSchema = z.string().min(1);

export const importChoiceSchema = z
  .object({
    id: externalKeySchema,
    textEn: requiredContentSchema,
    textKo: requiredContentSchema.nullable().optional(),
  })
  .strict();

export const importQuestionSchema = z
  .object({
    id: externalKeySchema,
    domainId: externalKeySchema,
    stemEn: requiredContentSchema,
    stemKo: requiredContentSchema.nullable().optional(),
    explanationEn: requiredContentSchema,
    explanationKo: requiredContentSchema.nullable().optional(),
    requiredChoiceCount: z.number().int().positive(),
    correctChoiceIds: z.array(externalKeySchema).min(1),
    choices: z.array(importChoiceSchema).min(1).max(20),
  })
  .strict();

export const importDomainSchema = z
  .object({
    id: externalKeySchema,
    name: z.string().trim().min(1).max(200),
    weightPercent: decimalStringSchema,
  })
  .strict();

export const importCertificationSchema = z
  .object({
    id: externalKeySchema,
    code: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(300),
    totalQuestions: z.number().int().positive(),
    timeLimitMinutes: z.number().int().positive(),
    passThreshold: decimalStringSchema,
    scoringMode: scoringModeSchema,
    domains: z.array(importDomainSchema).min(1),
    questions: z.array(importQuestionSchema).max(10_000),
  })
  .strict();

export const importDocumentSchema = z
  .object({
    provider: z
      .object({
        id: externalKeySchema,
        name: z.string().trim().min(1).max(200),
        logoUrl: z.url().nullable().optional(),
      })
      .strict(),
    certification: importCertificationSchema,
  })
  .strict();

export const dryRunImportRequestSchema = z
  .object({
    content: z
      .string()
      .min(1)
      .max(10 * 1_048_576),
  })
  .strict();

export const availableSummaryValueSchema = z
  .object({
    status: z.literal("available"),
    value: z.number().int().nonnegative(),
  })
  .strict();

export const unavailableSummaryValueSchema = z
  .object({
    status: z.literal("unavailable"),
    reason: z.string().min(1).max(500),
  })
  .strict();

export const importSummaryValueSchema = z.discriminatedUnion("status", [
  availableSummaryValueSchema,
  unavailableSummaryValueSchema,
]);

export const importValidationErrorSchema = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
    message: z.string().min(1).max(500),
    relatedIdentifiers: z.array(z.string().min(1).max(200)),
  })
  .strict();

export const importValidationSummarySchema = z
  .object({
    totalQuestions: importSummaryValueSchema,
    domainQuestionCounts: z.record(z.string(), importSummaryValueSchema),
    translationStatusCounts: z
      .object({
        translated: importSummaryValueSchema,
        enOnly: importSummaryValueSchema,
      })
      .strict(),
    errorCount: z.number().int().nonnegative(),
  })
  .strict();

export const dryRunImportResponseSchema = z
  .object({
    valid: z.boolean(),
    summary: importValidationSummarySchema,
    errors: z.array(importValidationErrorSchema),
    validationId: uuidSchema.optional(),
    commitToken: z.string().min(32).max(500).optional(),
    expiresAt: utcTimestampSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasCommitFields =
      value.validationId !== undefined &&
      value.commitToken !== undefined &&
      value.expiresAt !== undefined;
    if (value.valid !== hasCommitFields) {
      context.addIssue({
        code: "custom",
        message: "Commit credentials must exist if and only if validation succeeds",
      });
    }
    if (value.valid !== (value.errors.length === 0)) {
      context.addIssue({
        code: "custom",
        message: "Validation success must agree with the error list",
      });
    }
  });

export const commitImportRequestSchema = z
  .object({
    validationId: uuidSchema,
    commitToken: z.string().min(32).max(500),
    content: z
      .string()
      .min(1)
      .max(10 * 1_048_576),
  })
  .strict();

export const commitImportResponseSchema = z
  .object({
    validationId: uuidSchema,
    certificationId: uuidSchema,
    activatedRevisionId: uuidSchema,
    committedAt: utcTimestampSchema,
  })
  .strict();

export type ImportChoice = z.infer<typeof importChoiceSchema>;
export type ImportQuestion = z.infer<typeof importQuestionSchema>;
export type ImportDomain = z.infer<typeof importDomainSchema>;
export type ImportCertification = z.infer<typeof importCertificationSchema>;
export type ImportDocument = z.infer<typeof importDocumentSchema>;
export type DryRunImportRequest = z.infer<typeof dryRunImportRequestSchema>;
export type ImportSummaryValue = z.infer<typeof importSummaryValueSchema>;
export type ImportValidationError = z.infer<typeof importValidationErrorSchema>;
export type ImportValidationSummary = z.infer<typeof importValidationSummarySchema>;
export type DryRunImportResponse = z.infer<typeof dryRunImportResponseSchema>;
export type CommitImportRequest = z.infer<typeof commitImportRequestSchema>;
export type CommitImportResponse = z.infer<typeof commitImportResponseSchema>;
