import { z } from "zod";

import { decimalStringSchema, utcTimestampSchema, uuidSchema } from "./common.js";

export const historyCursorSchema = z.string().min(1).max(500);

export const attemptSummaryDtoSchema = z
  .object({
    attemptId: uuidSchema,
    certificationCode: z.string().min(1),
    certificationName: z.string().min(1),
    rawScore: decimalStringSchema,
    accuracyRate: decimalStringSchema,
    reference1000Score: z.number().int().min(0).max(1000),
    passed: z.boolean(),
    submittedAt: utcTimestampSchema,
  })
  .strict();

export const historyPageDtoSchema = z
  .object({
    attempts: z.array(attemptSummaryDtoSchema),
    nextCursor: historyCursorSchema.nullable(),
  })
  .strict();

export const trendPointDtoSchema = z
  .object({
    attemptId: uuidSchema,
    accuracyRate: decimalStringSchema,
    submittedAt: utcTimestampSchema,
  })
  .strict();

export const certificationTrendDtoSchema = z
  .object({
    certificationId: uuidSchema,
    certificationCode: z.string().min(1),
    certificationName: z.string().min(1),
    attemptCount: z.number().int().nonnegative(),
    points: z.array(trendPointDtoSchema),
  })
  .strict();

export const historyTrendsDtoSchema = z
  .object({
    certifications: z.array(certificationTrendDtoSchema),
  })
  .strict();

export type HistoryCursor = z.infer<typeof historyCursorSchema>;
export type AttemptSummaryDto = z.infer<typeof attemptSummaryDtoSchema>;
export type HistoryPageDto = z.infer<typeof historyPageDtoSchema>;
export type TrendPointDto = z.infer<typeof trendPointDtoSchema>;
export type CertificationTrendDto = z.infer<typeof certificationTrendDtoSchema>;
export type HistoryTrendsDto = z.infer<typeof historyTrendsDtoSchema>;
