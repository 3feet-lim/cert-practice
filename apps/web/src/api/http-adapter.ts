import {
  activePracticeSessionsDtoSchema,
  approvalStatusDtoSchema,
  approveUserResponseSchema,
  catalogDtoSchema,
  commitImportResponseSchema,
  currentUserDtoSchema,
  dryRunImportResponseSchema,
  errorEnvelopeSchema,
  examResultDtoSchema,
  examStateResponseSchema,
  getExamResponseSchema,
  healthSuccessEnvelopeSchema,
  historyPageDtoSchema,
  historyTrendsDtoSchema,
  leaderboardDtoSchema,
  pendingUsersDtoSchema,
  practiceResultDtoSchema,
  practiceSessionDtoSchema,
  practiceStateResponseSchema,
  requestIdSchema,
  startExamResponseSchema,
  startPracticeResponseSchema,
  submissionPreviewDtoSchema,
  submitPracticeQuestionResponseSchema,
  successEnvelopeSchema,
  updateScoreVisibilityResponseSchema,
  type ResponseMeta,
} from "@cert-quiz/contracts";

import type {
  CertQuizApi,
  CertQuizApiError,
  CertQuizApiResult,
  GetHistoryInput,
} from "./port";

export type HttpFetch = (input: string, init?: RequestInit) => Promise<Response>;
export type BearerTokenProvider = () => string | undefined | Promise<string | undefined>;

export interface HttpCertQuizApiOptions {
  /** Origin or base path of the Hono API, such as https://api.example.test. */
  baseUrl: string;
  fetch?: HttpFetch;
  /** Returns the current Cognito access token without persisting it in the adapter. */
  getBearerToken?: BearerTokenProvider;
}

type SuccessEnvelope<Data> = { data: Data; meta?: ResponseMeta };
type SuccessEnvelopeSchema<Data> = {
  safeParse(input: unknown): {
    success: boolean;
    data?: SuccessEnvelope<Data>;
  };
};

type HttpRequest = {
  operation: string;
  path: string;
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
  idempotencyKey?: string;
};

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

function adapterFailure<Output>(
  code: CertQuizApiError["code"],
  message: string,
  requestId: string,
  retryable: boolean,
): CertQuizApiResult<Output> {
  return { ok: false, error: { code, message, requestId, retryable } };
}

function apiUrl(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

function routeId(value: string): string {
  return encodeURIComponent(value);
}

function requestIdFrom(response: Response, fallback: string): string {
  const value = response.headers.get("x-request-id");
  return requestIdSchema.safeParse(value).success ? value! : fallback;
}

function unavailableFailure<Output>(
  operation: string,
  response: Response,
): CertQuizApiResult<Output> {
  return adapterFailure(
    "dependency-unavailable",
    operation === "health"
      ? "The CertQuiz health service returned an unavailable response."
      : "The CertQuiz API returned an unavailable response.",
    requestIdFrom(response, `http:${operation}:unavailable-response`),
    response.status === 429 || response.status >= 500,
  );
}

function contractFailure<Output>(operation: string): CertQuizApiResult<Output> {
  return adapterFailure(
    "internal-error",
    operation === "health"
      ? "The CertQuiz health response failed shared schema validation."
      : "The CertQuiz API response failed shared schema validation.",
    `http:${operation}:invalid-contract`,
    false,
  );
}

/**
 * Real transport adapter for the complete CertQuizApi surface. It parses all
 * successful payloads and expected errors against shared strict contracts.
 */
export function createHttpCertQuizApi(options: HttpCertQuizApiOptions): CertQuizApi {
  const fetchImplementation = options.fetch ?? globalThis.fetch;

  const request = async <Output>(
    request: HttpRequest,
    schema: SuccessEnvelopeSchema<Output>,
  ): Promise<CertQuizApiResult<Output>> => {
    let token: string | undefined;
    try {
      token = await options.getBearerToken?.();
    } catch {
      return adapterFailure(
        "dependency-unavailable",
        "The CertQuiz authentication token is unavailable.",
        `http:${request.operation}:token`,
        true,
      );
    }

    const hasBody = request.body !== undefined;
    const headers: Record<string, string> = { accept: "application/json" };
    if (hasBody) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    if (request.idempotencyKey) headers["idempotency-key"] = request.idempotencyKey;

    let response: Response;
    try {
      response = await fetchImplementation(apiUrl(options.baseUrl, request.path), {
        ...(request.method ? { method: request.method } : {}),
        headers,
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
      });
    } catch {
      return adapterFailure(
        "dependency-unavailable",
        request.operation === "health"
          ? "The CertQuiz health service is unavailable."
          : "The CertQuiz API is unavailable.",
        `http:${request.operation}:network`,
        true,
      );
    }

    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const parsedError = errorEnvelopeSchema.safeParse(body);
      if (parsedError.success && apiErrorCodes.has(parsedError.data.error.code as never)) {
        return { ok: false, error: parsedError.data.error as CertQuizApiError };
      }
      return unavailableFailure(request.operation, response);
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success || !parsed.data) return contractFailure(request.operation);
    return { ok: true, data: parsed.data.data, meta: parsed.data.meta };
  };

  const postEmpty = <Output>(
    operation: string,
    path: string,
    schema: SuccessEnvelopeSchema<Output>,
  ) => request({ operation, path, method: "POST", body: {} }, schema);

  return {
    getHealth: () => request({ operation: "health", path: "/v1/health" }, healthSuccessEnvelopeSchema),
    getApprovalStatus: () =>
      request({ operation: "approval", path: "/v1/me/approval" }, successEnvelopeSchema(approvalStatusDtoSchema)),
    getCurrentUser: () => request({ operation: "current-user", path: "/v1/me" }, successEnvelopeSchema(currentUserDtoSchema)),
    getCatalog: () => request({ operation: "catalog", path: "/v1/catalog" }, successEnvelopeSchema(catalogDtoSchema)),
    listActivePracticeSessions: () =>
      request(
        { operation: "active-practice", path: "/v1/practice/active" },
        successEnvelopeSchema(activePracticeSessionsDtoSchema),
      ),
    startPractice: ({ certificationId }) =>
      request(
        {
          operation: "start-practice",
          path: `/v1/certifications/${routeId(certificationId)}/practice/start`,
          method: "POST",
          body: {},
        },
        successEnvelopeSchema(startPracticeResponseSchema),
      ),
    resumePractice: ({ practiceSessionId }) =>
      request(
        {
          operation: "resume-practice",
          path: `/v1/practice/${routeId(practiceSessionId)}/resume`,
          method: "POST",
        },
        successEnvelopeSchema(practiceSessionDtoSchema),
      ),
    replacePractice: async ({ practiceSessionId, confirmationNonce }) => {
      const replaced = await request(
        {
          operation: "replace-practice",
          path: `/v1/practice/${routeId(practiceSessionId)}/replace`,
          method: "POST",
          body: { confirmationNonce },
        },
        successEnvelopeSchema(startPracticeResponseSchema),
      );
      if (!replaced.ok) return replaced;
      if (replaced.data.kind !== "created") return contractFailure("replace-practice");
      return request(
        {
          operation: "resume-replaced-practice",
          path: `/v1/practice/${routeId(replaced.data.practiceSessionId)}/resume`,
          method: "POST",
        },
        successEnvelopeSchema(practiceSessionDtoSchema),
      );
    },
    patchPracticeState: ({ practiceSessionId, ...body }) =>
      request(
        {
          operation: "patch-practice",
          path: `/v1/practice/${routeId(practiceSessionId)}/state`,
          method: "PATCH",
          body,
        },
        successEnvelopeSchema(practiceStateResponseSchema),
      ),
    submitPracticeQuestion: ({ practiceSessionId, questionId, ...body }) =>
      request(
        {
          operation: "submit-practice",
          path: `/v1/practice/${routeId(practiceSessionId)}/questions/${routeId(questionId)}/submit`,
          method: "POST",
          body,
        },
        successEnvelopeSchema(submitPracticeQuestionResponseSchema),
      ),
    startExam: ({ certificationId, idempotencyKey }) =>
      request(
        {
          operation: "start-exam",
          path: `/v1/certifications/${routeId(certificationId)}/exams`,
          method: "POST",
          body: { idempotencyKey },
          idempotencyKey,
        },
        successEnvelopeSchema(startExamResponseSchema),
      ),
    getExam: ({ examSessionId }) =>
      request(
        { operation: "get-exam", path: `/v1/exams/${routeId(examSessionId)}` },
        successEnvelopeSchema(getExamResponseSchema),
      ),
    patchExamState: ({ examSessionId, ...body }) =>
      request(
        {
          operation: "patch-exam",
          path: `/v1/exams/${routeId(examSessionId)}/state`,
          method: "PATCH",
          body,
        },
        successEnvelopeSchema(examStateResponseSchema),
      ),
    getExamSubmissionPreview: ({ examSessionId }) =>
      postEmpty(
        "exam-submission-preview",
        `/v1/exams/${routeId(examSessionId)}/submission-preview`,
        successEnvelopeSchema(submissionPreviewDtoSchema),
      ),
    submitExam: ({ examSessionId }) =>
      postEmpty(
        "submit-exam",
        `/v1/exams/${routeId(examSessionId)}/submit`,
        successEnvelopeSchema(examResultDtoSchema),
      ),
    getPracticeResult: ({ resultId }) =>
      request(
        { operation: "practice-result", path: `/v1/practice-results/${routeId(resultId)}` },
        successEnvelopeSchema(practiceResultDtoSchema),
      ),
    getAttempt: ({ attemptId }) =>
      request(
        { operation: "attempt", path: `/v1/attempts/${routeId(attemptId)}` },
        successEnvelopeSchema(examResultDtoSchema),
      ),
    getHistory: ({ cursor }: GetHistoryInput) => {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      return request(
        { operation: "history", path: `/v1/history${query}` },
        successEnvelopeSchema(historyPageDtoSchema),
      );
    },
    getHistoryTrends: () =>
      request(
        { operation: "history-trends", path: "/v1/history/trends" },
        successEnvelopeSchema(historyTrendsDtoSchema),
      ),
    updateScoreVisibility: (body) =>
      request(
        { operation: "score-visibility", path: "/v1/me/score-visibility", method: "PATCH", body },
        successEnvelopeSchema(updateScoreVisibilityResponseSchema),
      ),
    getLeaderboard: ({ certificationId }) =>
      request(
        { operation: "leaderboard", path: `/v1/leaderboards/${routeId(certificationId)}` },
        successEnvelopeSchema(leaderboardDtoSchema),
      ),
    getPendingUsers: () =>
      request(
        { operation: "pending-users", path: "/v1/admin/pending-users" },
        successEnvelopeSchema(pendingUsersDtoSchema),
      ),
    approveUser: ({ userId }) =>
      request(
        {
          operation: "approve-user",
          path: `/v1/admin/users/${routeId(userId)}/approve`,
          method: "POST",
          body: {},
        },
        successEnvelopeSchema(approveUserResponseSchema),
      ),
    dryRunImport: (body) =>
      request(
        { operation: "dry-run-import", path: "/v1/admin/imports/dry-run", method: "POST", body },
        successEnvelopeSchema(dryRunImportResponseSchema),
      ),
    commitImport: (body) =>
      request(
        { operation: "commit-import", path: "/v1/admin/imports/commit", method: "POST", body },
        successEnvelopeSchema(commitImportResponseSchema),
      ),
  };
}
