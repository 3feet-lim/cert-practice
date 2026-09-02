import { z } from "zod";

export type JsonValue =
  null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export const uuidSchema = z.uuid();
export const requestIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/, "Invalid request ID");
export const retryableSchema = z.boolean();
export const utcTimestampSchema = z.iso
  .datetime({ offset: false })
  .refine((value) => value.endsWith("Z"), "Timestamp must use UTC Z notation");
export const decimalStringSchema = z
  .string()
  .regex(/^(?:0|-?[1-9]\d*)(?:\.\d*[1-9])?$/, "Expected a canonical decimal string");
export const stateVersionSchema = z.number().int().nonnegative().safe();

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

export const responseMetaSchema = z
  .object({
    requestId: requestIdSchema,
    serverNow: utcTimestampSchema.optional(),
  })
  .strict();

export const successEnvelopeSchema = <Schema extends z.ZodType>(dataSchema: Schema) =>
  z
    .object({
      data: dataSchema,
      meta: responseMetaSchema.optional(),
    })
    .strict();

export type SuccessEnvelope<Data> = {
  data: Data;
  meta?: z.infer<typeof responseMetaSchema>;
};

export const errorDetailSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number().int().nonnegative()])),
    reason: z.string().min(1).max(500),
    identifier: z.string().min(1).max(200).optional(),
    actual: jsonValueSchema.optional(),
    expected: jsonValueSchema.optional(),
  })
  .strict();

export const transportErrorSchema = z
  .object({
    code: z.string().regex(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/),
    message: z.string().min(1).max(500),
    requestId: requestIdSchema,
    retryable: retryableSchema,
    nextAction: z.string().min(1).max(500).optional(),
    details: z.array(errorDetailSchema).optional(),
  })
  .strict();

export const errorEnvelopeSchema = z
  .object({
    error: transportErrorSchema,
  })
  .strict();

export type Uuid = z.infer<typeof uuidSchema>;
export type RequestId = z.infer<typeof requestIdSchema>;
export type Retryability = z.infer<typeof retryableSchema>;
export type UtcTimestamp = z.infer<typeof utcTimestampSchema>;
export type DecimalString = z.infer<typeof decimalStringSchema>;
export type StateVersion = z.infer<typeof stateVersionSchema>;
export type ResponseMeta = z.infer<typeof responseMetaSchema>;
export type ErrorDetail = z.infer<typeof errorDetailSchema>;
export type TransportError = z.infer<typeof transportErrorSchema>;
export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
