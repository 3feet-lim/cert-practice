import type {
  CommitImportRequest,
  DryRunImportRequest,
  PatchExamStateRequest,
  PatchPracticeStateRequest,
  SubmitPracticeQuestionRequest,
} from "@cert-quiz/contracts";
import { delay, http, HttpResponse, type HttpHandler } from "msw";

import {
  createCertQuizMockStateMachine,
  MOCK_IDS,
  MockStateError,
  type CertQuizMockStateMachine,
} from "./state-machine";

/**
 * These scenarios model UI-development behavior only. Passing them is not
 * evidence of backend persistence, authentication, authorization, atomicity,
 * concurrency, server-time accuracy, or security guarantees.
 */

export const MOCK_API_BASE_URL = "http://localhost/v1";

export const MOCK_SCENARIOS = [
  "default",
  "loading-delay",
  "empty",
  "retryable-error",
  "non-retryable-error",
  "stale-version",
  "save-rollback",
  "owner-denial",
  "role-denial",
  "import-validation-errors",
  "token-expired",
  "token-reused",
  "duplicate-submission",
  "idempotent-result",
] as const;

export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export type CreateMockScenarioHandlersOptions = {
  scenario?: MockScenario;
  state?: CertQuizMockStateMachine;
  delayMs?: number;
};

type OperationKind = "query" | "save" | "owner" | "admin" | "submit";

type MockErrorBody = {
  error: {
    code: string;
    message: string;
    requestId: string;
    retryable: boolean;
    nextAction: string;
    details?: MockStateError["details"];
  };
};

const invalidImportResponse = {
  valid: false,
  summary: {
    totalQuestions: { status: "available" as const, value: 2 },
    domainQuestionCounts: {
      sdlc: { status: "available" as const, value: 1 },
      missing: {
        status: "unavailable" as const,
        reason: "Domain reference is invalid.",
      },
    },
    translationStatusCounts: {
      translated: { status: "available" as const, value: 1 },
      enOnly: { status: "available" as const, value: 1 },
    },
    errorCount: 2,
  },
  errors: [
    {
      code: "duplicate-question-id",
      path: ["certification", "questions", 1, "id"],
      message: "Question ID q-duplicate is duplicated.",
      relatedIdentifiers: ["q-duplicate"],
    },
    {
      code: "unknown-domain",
      path: ["certification", "questions", 1, "domainId"],
      message: "Domain missing-domain does not exist.",
      relatedIdentifiers: ["q-duplicate", "missing-domain"],
    },
  ],
};

function parameter(value: string | readonly string[] | undefined): string {
  if (typeof value === "string") {
    return value;
  }
  return value?.[0] ?? "";
}

function actorId(request: Request): string {
  return request.headers.get("x-mock-user-id") ?? MOCK_IDS.user;
}

function actorRole(request: Request): string {
  return request.headers.get("x-mock-role") ?? "admin";
}

export function createMockScenarioHandlers(
  options: CreateMockScenarioHandlersOptions = {},
): { handlers: HttpHandler[]; state: CertQuizMockStateMachine } {
  const scenario = options.scenario ?? "default";
  const state = options.state ?? createCertQuizMockStateMachine();
  const loadingDelayMs = options.delayMs ?? 250;
  let sequence = 0;
  const nextRequestId = () => `msw-ui-${scenario}-${++sequence}`;

  const errorResponse = (
    status: number,
    code: string,
    message: string,
    retryable: boolean,
    nextAction: string,
    details?: MockStateError["details"],
  ) =>
    HttpResponse.json<MockErrorBody>(
      {
        error: {
          code,
          message,
          requestId: nextRequestId(),
          retryable,
          nextAction,
          ...(details ? { details } : {}),
        },
      },
      { status },
    );

  const execute = async <Data>(
    kind: OperationKind,
    request: Request,
    work: () => Data,
  ) => {
    if (scenario === "loading-delay") {
      await delay(loadingDelayMs);
    }
    if (scenario === "duplicate-submission" && kind === "submit") {
      await delay(Math.min(loadingDelayMs, 25));
    }
    if (scenario === "retryable-error") {
      return errorResponse(
        503,
        "dependency-unavailable",
        "The service is temporarily unavailable.",
        true,
        "Retry this request.",
      );
    }
    if (scenario === "non-retryable-error") {
      return errorResponse(
        422,
        "validation-failed",
        "The request cannot be completed with the current input.",
        false,
        "Correct the input before trying again.",
      );
    }
    if (
      scenario === "owner-denial" &&
      (kind === "owner" || kind === "save" || kind === "submit")
    ) {
      return errorResponse(
        403,
        "ownership-denied",
        "You cannot access this resource.",
        false,
        "Return to your own sessions.",
      );
    }
    if (
      (scenario === "role-denial" && kind === "admin") ||
      (kind === "admin" && actorRole(request) !== "admin")
    ) {
      return errorResponse(
        403,
        "admin-required",
        "Administrator access is required.",
        false,
        "Return to the learner area.",
      );
    }
    if (scenario === "stale-version" && kind === "save") {
      return errorResponse(
        409,
        "stale-version",
        "Refresh the latest state before saving again.",
        false,
        "Reload the session and reapply the change.",
      );
    }
    if (scenario === "save-rollback" && kind === "save") {
      return errorResponse(
        503,
        "transaction-conflict",
        "The change was not saved.",
        true,
        "Retry after the UI restores the previous value.",
      );
    }

    try {
      return HttpResponse.json({
        data: work(),
        meta: { requestId: nextRequestId(), serverNow: state.now() },
      });
    } catch (error) {
      if (error instanceof MockStateError) {
        return errorResponse(
          error.status,
          error.code,
          error.message,
          false,
          error.code === "stale-version"
            ? "Reload the latest state."
            : "Follow the displayed recovery action.",
          error.details,
        );
      }
      throw error;
    }
  };

  return {
    state,
    handlers: [
      http.get("*/v1/catalog", ({ request }) =>
        execute("query", request, () =>
          scenario === "empty"
            ? { providers: [], dataErrors: [] }
            : {
                providers: [
                  {
                    id: "00000000-0000-4000-8000-000000000201",
                    name: "AWS",
                    logoUrl: null,
                    certifications: [
                      {
                        id: MOCK_IDS.certification,
                        code: "DOP-C02",
                        name: "AWS Certified DevOps Engineer – Professional",
                        totalQuestions: 75,
                        timeLimitMinutes: 180,
                        passThreshold: "75",
                        scoringMode: "all_or_nothing" as const,
                        domains: [
                          {
                            id: "00000000-0000-4000-8000-000000000202",
                            name: "SDLC Automation",
                            weightPercent: "100",
                            questionCount: 75,
                            allocatedQuestionCount: 75,
                          },
                        ],
                      },
                    ],
                  },
                ],
                dataErrors: [],
              },
        ),
      ),
      http.post("*/v1/practice/:practiceSessionId/resume", ({ params, request }) =>
        execute("owner", request, () =>
          state.getPracticeSession(
            parameter(params.practiceSessionId),
            actorId(request),
          ),
        ),
      ),
      http.patch(
        "*/v1/practice/:practiceSessionId/state",
        async ({ params, request }) => {
          const body = (await request.json()) as PatchPracticeStateRequest;
          return execute("save", request, () =>
            state.patchPractice(
              parameter(params.practiceSessionId),
              actorId(request),
              body,
            ),
          );
        },
      ),
      http.post(
        "*/v1/practice/:practiceSessionId/questions/:questionId/submit",
        async ({ params, request }) => {
          const body = (await request.json()) as SubmitPracticeQuestionRequest;
          return execute("submit", request, () =>
            state.submitPracticeQuestion(
              parameter(params.practiceSessionId),
              parameter(params.questionId),
              actorId(request),
              body,
            ),
          );
        },
      ),
      http.get("*/v1/exams/:examSessionId", ({ params, request }) =>
        execute("owner", request, () =>
          state.getExam(parameter(params.examSessionId), actorId(request)),
        ),
      ),
      http.patch("*/v1/exams/:examSessionId/state", async ({ params, request }) => {
        const body = (await request.json()) as PatchExamStateRequest;
        return execute("save", request, () =>
          state.patchExam(parameter(params.examSessionId), actorId(request), body),
        );
      }),
      http.post("*/v1/exams/:examSessionId/submission-preview", ({ params, request }) =>
        execute("owner", request, () =>
          state.getExamSubmissionPreview(
            parameter(params.examSessionId),
            actorId(request),
          ),
        ),
      ),
      http.post("*/v1/exams/:examSessionId/submit", ({ params, request }) =>
        execute("submit", request, () =>
          state.submitExam(parameter(params.examSessionId), actorId(request)),
        ),
      ),
      http.get("*/v1/admin/pending-users", ({ request }) =>
        execute("admin", request, () =>
          scenario === "empty"
            ? { users: [] }
            : {
                users: [
                  {
                    id: MOCK_IDS.otherUser,
                    displayName: "Pending User",
                    email: "pending@example.com",
                    firstLoginAt: "2026-03-23T11:00:00.000Z",
                  },
                ],
              },
        ),
      ),
      http.post("*/v1/admin/imports/dry-run", async ({ request }) => {
        const body = (await request.json()) as DryRunImportRequest;
        return execute("admin", request, () =>
          scenario === "import-validation-errors"
            ? invalidImportResponse
            : state.createImportValidation(body.content, actorId(request)),
        );
      }),
      http.post("*/v1/admin/imports/commit", async ({ request }) => {
        const body = (await request.json()) as CommitImportRequest;
        return execute("admin", request, () => {
          if (scenario === "token-expired") {
            throw new MockStateError(
              "validation-expired",
              "This validation has expired.",
            );
          }
          if (scenario === "token-reused") {
            throw new MockStateError(
              "token-used",
              "This validation token has already been used.",
            );
          }
          return state.commitImport(body, actorId(request));
        });
      }),
    ],
  };
}
