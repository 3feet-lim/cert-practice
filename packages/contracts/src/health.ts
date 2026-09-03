import { z } from "zod";

/** Shared bootstrap contract implemented by both mock and future real APIs. */
export const healthDtoSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("cert-quiz-api"),
    contractVersion: z.literal("v1"),
  })
  .strict();

export type HealthDto = z.infer<typeof healthDtoSchema>;
