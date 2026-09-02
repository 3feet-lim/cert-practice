import { z } from "zod";

import { decimalStringSchema, uuidSchema } from "./common.js";

export const scoringModeSchema = z.enum(["all_or_nothing", "partial"]);

export const domainCatalogDtoSchema = z
  .object({
    id: uuidSchema,
    name: z.string().min(1).max(200),
    weightPercent: decimalStringSchema,
    questionCount: z.number().int().nonnegative(),
    allocatedQuestionCount: z.number().int().nonnegative(),
  })
  .strict();

export const certificationCatalogDtoSchema = z
  .object({
    id: uuidSchema,
    code: z.string().trim().min(1).max(100),
    name: z.string().trim().min(1).max(300),
    totalQuestions: z.number().int().positive(),
    timeLimitMinutes: z.number().int().positive(),
    passThreshold: decimalStringSchema,
    scoringMode: scoringModeSchema,
    domains: z.array(domainCatalogDtoSchema).min(1),
  })
  .strict();

export const providerCatalogDtoSchema = z
  .object({
    id: uuidSchema,
    name: z.string().trim().min(1).max(200),
    logoUrl: z.url().nullable(),
    certifications: z.array(certificationCatalogDtoSchema).min(1),
  })
  .strict();

export const invalidCertificationDataErrorSchema = z
  .object({
    kind: z.literal("invalid-certification"),
    certificationId: z.string().min(1),
    reason: z.string().min(1).max(500),
  })
  .strict();

export const insufficientDomainDataErrorSchema = z
  .object({
    kind: z.literal("insufficient-domain"),
    certificationId: z.string().min(1),
    domainName: z.string().min(1),
    availableQuestionCount: z.number().int().nonnegative(),
    requiredQuestionCount: z.number().int().nonnegative(),
  })
  .strict();

export const catalogDataErrorSchema = z.discriminatedUnion("kind", [
  invalidCertificationDataErrorSchema,
  insufficientDomainDataErrorSchema,
]);

export const catalogDtoSchema = z
  .object({
    providers: z.array(providerCatalogDtoSchema),
    dataErrors: z.array(catalogDataErrorSchema),
  })
  .strict();

export type ScoringMode = z.infer<typeof scoringModeSchema>;
export type DomainCatalogDto = z.infer<typeof domainCatalogDtoSchema>;
export type CertificationCatalogDto = z.infer<typeof certificationCatalogDtoSchema>;
export type ProviderCatalogDto = z.infer<typeof providerCatalogDtoSchema>;
export type CatalogDataError = z.infer<typeof catalogDataErrorSchema>;
export type CatalogDto = z.infer<typeof catalogDtoSchema>;
