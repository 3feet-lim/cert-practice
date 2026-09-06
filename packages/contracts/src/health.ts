import { z } from "zod";

import { successEnvelopeSchema } from "./common.js";

/** Shared bootstrap contract implemented by both mock and future real APIs. */
export const healthDtoSchema = z
  .object({
    status: z.literal("ok"),
    service: z.literal("cert-quiz-api"),
    contractVersion: z.literal("v1"),
  })
  .strict();

/** Strict HTTP transport envelope for the public bootstrap endpoint. */
export const healthSuccessEnvelopeSchema = successEnvelopeSchema(healthDtoSchema);

export type HealthDto = z.infer<typeof healthDtoSchema>;
export type HealthSuccessEnvelope = z.infer<typeof healthSuccessEnvelopeSchema>;
