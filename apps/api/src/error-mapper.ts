import {
  errorEnvelopeSchema,
  type ErrorEnvelope,
  type RequestId,
} from "@cert-quiz/contracts";
import { isDomainFailure } from "@cert-quiz/domain";

export type HttpErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 422 | 500 | 503;

export type MappedHttpError = {
  status: HttpErrorStatus;
  body: ErrorEnvelope;
  headers?: Readonly<Record<string, string>>;
};

const messages = {
  unauthenticated: "Authentication is required.",
  "invalid-google-identity": "A valid Google identity is required.",
  "approval-required": "Account approval is required.",
  "admin-required": "Administrator approval is required.",
  "ownership-denied": "This action is not available.",
  forbidden: "This action is not available.",
  "not-found": "The requested resource was not found.",
  expired: "The requested resource has expired.",
  "validation-failed": "Correct the invalid input and try again.",
  "stale-version": "The resource changed. Refresh and retry.",
  conflict: "The requested operation conflicts with current state.",
  "invalid-scoring-configuration": "The scoring configuration is invalid.",
  "dependency-unavailable": "The service is temporarily unavailable. Please retry.",
  "submission-failed": "Submission could not be completed. Please retry.",
} as const;

const statuses = {
  unauthenticated: 401,
  "invalid-google-identity": 401,
  "approval-required": 403,
  "admin-required": 403,
  "ownership-denied": 403,
  forbidden: 404,
  "not-found": 404,
  expired: 410,
  "validation-failed": 400,
  "stale-version": 409,
  conflict: 409,
  "invalid-scoring-configuration": 422,
  "dependency-unavailable": 503,
  "submission-failed": 503,
} as const;

export function mapError(error: unknown, requestId: RequestId): MappedHttpError {
  if (isDomainFailure(error)) {
    const { code, details } = error.error;
    return {
      status: statuses[code],
      body: errorEnvelopeSchema.parse({
        error: {
          code,
          message: messages[code],
          requestId,
          retryable: code === "dependency-unavailable" || code === "submission-failed",
          ...(details === undefined ? {} : { details }),
        },
      }),
      ...(code === "unauthenticated" || code === "invalid-google-identity"
        ? { headers: { "WWW-Authenticate": "Bearer" } }
        : {}),
    };
  }

  return {
    status: 500,
    body: errorEnvelopeSchema.parse({
      error: {
        code: "dependency-unavailable",
        message: messages["dependency-unavailable"],
        requestId,
        retryable: true,
      },
    }),
  };
}
