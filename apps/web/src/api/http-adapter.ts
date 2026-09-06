import {
  errorEnvelopeSchema,
  healthSuccessEnvelopeSchema,
  type HealthDto,
} from "@cert-quiz/contracts";

import type { CertQuizApi, CertQuizApiError, CertQuizApiResult } from "./port";
import { createUnavailableCertQuizApi } from "./unavailable-adapter";

export type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpCertQuizApiOptions {
  /** Origin or base path of the Hono API, such as https://api.example.test. */
  baseUrl: string;
  fetch?: HttpFetch;
}

const apiErrorCodes = new Set<CertQuizApiError["code"]>([
  "authentication-invalid",
  "google-identity-missing",
  "approval-required",
  "admin-required",
  "ownership-denied",
  "not-found",
  "practice-result-expired",
  "validation-failed",
  "validation-required",
  "validation-expired",
  "invalid-choice-count",
  "invalid-scoring-config",
  "stale-version",
  "answer-locked",
  "content-changed",
  "token-used",
  "exam-expired",
  "exam-finalized",
  "pool-insufficient",
  "rate-limited",
  "dependency-unavailable",
  "transaction-conflict",
  "internal-error",
]);

function healthFailure(
  code: CertQuizApiError["code"],
  message: string,
  requestId: string,
  retryable: boolean,
): CertQuizApiResult<HealthDto> {
  return { ok: false, error: { code, message, requestId, retryable } };
}

function healthUrl(baseUrl: string): string {
  return new URL("/v1/health", baseUrl).toString();
}

/**
 * Real transport adapter. The application still selects its fixture-backed
 * provider by default; this adapter is opt-in until backend features arrive.
 */
export function createHttpCertQuizApi(options: HttpCertQuizApiOptions): CertQuizApi {
  const fallback = createUnavailableCertQuizApi();
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  return {
    ...fallback,
    getHealth: async (): Promise<CertQuizApiResult<HealthDto>> => {
      let response: Response;

      try {
        response = await fetchImplementation(healthUrl(options.baseUrl), {
          headers: { accept: "application/json" },
        });
      } catch {
        return healthFailure(
          "dependency-unavailable",
          "The CertQuiz health service is unavailable.",
          "http:health:network",
          true,
        );
      }

      const body: unknown = await response.json().catch(() => undefined);

      if (!response.ok) {
        const parsedError = errorEnvelopeSchema.safeParse(body);
        if (
          parsedError.success &&
          apiErrorCodes.has(parsedError.data.error.code as never)
        ) {
          return { ok: false, error: parsedError.data.error as CertQuizApiError };
        }

        return healthFailure(
          "dependency-unavailable",
          "The CertQuiz health service returned an unavailable response.",
          "http:health:unavailable-response",
          response.status >= 500,
        );
      }

      const parsed = healthSuccessEnvelopeSchema.safeParse(body);
      if (!parsed.success) {
        return healthFailure(
          "internal-error",
          "The CertQuiz health response failed shared schema validation.",
          "http:health:invalid-contract",
          false,
        );
      }

      return { ok: true, data: parsed.data.data, meta: parsed.data.meta };
    },
  };
}
