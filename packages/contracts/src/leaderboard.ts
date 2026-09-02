import { z } from "zod";

import { decimalStringSchema, utcTimestampSchema, uuidSchema } from "./common.js";

export const leaderboardEntryDtoSchema = z
  .object({
    rank: z.number().int().positive(),
    userId: uuidSchema,
    displayName: z.string().min(1).max(200),
    accuracyRate: decimalStringSchema,
    rawScore: decimalStringSchema,
    attemptId: uuidSchema,
    submittedAt: utcTimestampSchema,
    isCurrentUser: z.boolean(),
  })
  .strict();

export const leaderboardDtoSchema = z
  .object({
    certificationId: uuidSchema,
    certificationCode: z.string().min(1),
    certificationName: z.string().min(1),
    entries: z.array(leaderboardEntryDtoSchema),
  })
  .strict();

export type LeaderboardEntryDto = z.infer<typeof leaderboardEntryDtoSchema>;
export type LeaderboardDto = z.infer<typeof leaderboardDtoSchema>;
