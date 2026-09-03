import {
  activePracticeSessionsDtoSchema,
  approvalStatusDtoSchema,
  catalogDtoSchema,
  currentUserDtoSchema,
  dryRunImportResponseSchema,
  examActiveSessionDtoSchema,
  examResultDtoSchema,
  getExamResponseSchema,
  historyPageDtoSchema,
  historyTrendsDtoSchema,
  leaderboardDtoSchema,
  pendingUsersDtoSchema,
  practiceResultDtoSchema,
  practiceSessionDtoSchema,
  submissionPreviewDtoSchema,
  transportErrorSchema,
  type TransportError,
} from "@cert-quiz/contracts";

import { createCertQuizFixtures } from "./fixtures";

export interface StaticEmptyCopy {
  title: string;
  message: string;
  nextAction: string;
}

export type StaticScreenFixture<Data> =
  | Readonly<{ state: "success"; data: Data }>
  | Readonly<
      {
        state: "empty";
        title: string;
        message: string;
        nextAction: string;
      } & ({ data: Data } | { data?: never })
    >
  | Readonly<
      {
        state: "error";
        error: TransportError;
        preservedInput?: string;
      } & ({ data: Data } | { data?: never })
    >;

type Parser<Output> = { parse(value: unknown): Output };

function validated<Output>(schema: Parser<Output>, value: unknown): Output {
  return schema.parse(value);
}

function deepFreeze<Value>(value: Value): Value {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nestedValue of Object.values(value)) {
      deepFreeze(nestedValue);
    }
    Object.freeze(value);
  }
  return value;
}

function success<Data>(data: Data): StaticScreenFixture<Data> {
  return { state: "success", data };
}

function empty<Data>(copy: StaticEmptyCopy, data: Data): StaticScreenFixture<Data>;
function empty(copy: StaticEmptyCopy): StaticScreenFixture<never>;
function empty<Data>(
  copy: StaticEmptyCopy,
  data?: Data,
): StaticScreenFixture<Data> | StaticScreenFixture<never> {
  return data === undefined ? { state: "empty", ...copy } : { state: "empty", ...copy, data };
}

function previewError(
  code: string,
  message: string,
  requestId: string,
  retryable: boolean,
  nextAction: string,
): TransportError {
  return validated(transportErrorSchema, {
    code,
    message,
    requestId,
    retryable,
    nextAction,
  });
}

/**
 * Creates the read-only fixture model used by static pages and the future screen
 * gallery. Every transport-shaped value is parsed by its shared contract schema.
 * This module intentionally has no API port, MSW, timer, mutation, or mock state
 * machine dependency.
 */
export function createCertQuizStaticPreviewFixtures() {
  const source = createCertQuizFixtures();

  const approvalPending = validated(
    approvalStatusDtoSchema,
    source.auth.pending.approval,
  );
  const approvalApproved = validated(
    approvalStatusDtoSchema,
    source.auth.approved.approval,
  );
  const approvedUser = validated(currentUserDtoSchema, source.auth.approved.user);
  const adminUser = validated(currentUserDtoSchema, source.auth.admin.user);

  const catalogSuccess = validated(catalogDtoSchema, source.catalog.valid);
  const catalogEmpty = validated(catalogDtoSchema, source.catalog.empty);
  const catalogInvalid = validated(catalogDtoSchema, source.catalog.invalid);

  const practiceActiveSessions = validated(
    activePracticeSessionsDtoSchema,
    source.practice.activeSessions,
  );
  const practiceNoActiveSessions = validated(activePracticeSessionsDtoSchema, {
    sessions: [],
  });
  const practiceActive = validated(practiceSessionDtoSchema, source.practice.active);
  const practiceSubmitted = validated(
    practiceSessionDtoSchema,
    source.practice.submitted,
  );

  const examActive = validated(examActiveSessionDtoSchema, source.exam.active);
  const examExpired = validated(examActiveSessionDtoSchema, source.exam.expired);
  const examFinalized = validated(getExamResponseSchema, source.exam.finalized);
  const submissionPreview = validated(submissionPreviewDtoSchema, {
    examSessionId: examActive.examSessionId,
    unansweredQuestionCount: examActive.questions.filter(
      ({ selectedChoiceIds }) => selectedChoiceIds.length === 0,
    ).length,
    flaggedQuestionCount: examActive.questions.filter(({ flagged }) => flagged).length,
    stateVersion: examActive.stateVersion,
  });

  const practiceResult = validated(
    practiceResultDtoSchema,
    source.practice.immutableResult,
  );
  const examResult = validated(examResultDtoSchema, source.exam.immutableResult);

  const historyPopulated = validated(
    historyPageDtoSchema,
    source.history.populated,
  );
  const historyEmpty = validated(historyPageDtoSchema, source.history.empty);
  const historyTrends = validated(historyTrendsDtoSchema, source.history.trends);
  const historyEmptyTrends = validated(
    historyTrendsDtoSchema,
    source.history.emptyTrends,
  );

  const leaderboardPopulated = validated(
    leaderboardDtoSchema,
    source.leaderboard.tied,
  );
  const leaderboardEmpty = validated(
    leaderboardDtoSchema,
    source.leaderboard.empty,
  );

  const pendingUsers = validated(pendingUsersDtoSchema, source.admin.pendingUsers);
  const noPendingUsers = validated(
    pendingUsersDtoSchema,
    source.admin.emptyPendingUsers,
  );
  const validImport = validated(
    dryRunImportResponseSchema,
    source.import.dryRunValid,
  );
  const invalidImport = validated(
    dryRunImportResponseSchema,
    source.import.dryRunInvalid,
  );

  const errors = {
    callback: previewError(
      "authentication-invalid",
      "Google sign-in could not be completed.",
      "preview:auth:callback",
      false,
      "Return to the login screen and sign in again.",
    ),
    catalog: previewError(
      "catalog-data-invalid",
      "No certification can be displayed because the catalog data is invalid.",
      "preview:catalog:error",
      false,
      "Ask an administrator to correct the certification data.",
    ),
    practice: previewError(
      "dependency-unavailable",
      "The practice session could not be loaded.",
      "preview:practice:error",
      true,
      "Try loading the practice session again.",
    ),
    exam: previewError(
      "dependency-unavailable",
      "The exam session could not be loaded.",
      "preview:exam:error",
      true,
      "Try loading the exam session again.",
    ),
    result: previewError(
      "practice-result-expired",
      "This practice result is no longer available.",
      "preview:result:expired",
      false,
      "Return to the certification page and start a new practice session.",
    ),
    history: previewError(
      "dependency-unavailable",
      "Attempt history could not be loaded.",
      "preview:history:error",
      true,
      "Try loading attempt history again.",
    ),
    leaderboard: previewError(
      "dependency-unavailable",
      "The leaderboard could not be loaded.",
      "preview:leaderboard:error",
      true,
      "Try loading the leaderboard again.",
    ),
    pendingUsers: previewError(
      "dependency-unavailable",
      "Pending users could not be loaded.",
      "preview:admin:users:error",
      true,
      "Try loading pending users again.",
    ),
    importValidation: previewError(
      "validation-failed",
      "The selected JSON file has validation errors.",
      "preview:admin:import:error",
      false,
      "Correct the listed fields and validate the file again.",
    ),
  } as const;

  return deepFreeze({
    fixed: {
      seed: source.seed,
      serverNow: source.exam.active.serverNow,
      ids: source.ids,
    },
    actors: {
      unauthenticated: empty(
        {
          title: "Sign in required",
          message: "No authenticated user session is available.",
          nextAction: "Continue with Google sign-in.",
        },
        source.auth.unauthenticated,
      ),
      pending: success({
        kind: source.auth.pending.kind,
        approval: approvalPending,
      }),
      approved: success({
        kind: source.auth.approved.kind,
        approval: approvalApproved,
        user: approvedUser,
      }),
      admin: success({
        kind: source.auth.admin.kind,
        approval: validated(
          approvalStatusDtoSchema,
          source.auth.admin.approval,
        ),
        user: adminUser,
      }),
      callbackError: { state: "error", error: errors.callback },
    },
    catalog: {
      success: success(catalogSuccess),
      empty: empty(
        {
          title: "No certifications available",
          message: "There are no certifications available for practice or exams.",
          nextAction: "Refresh the catalog later.",
        },
        catalogEmpty,
      ),
      error: { state: "error", data: catalogInvalid, error: errors.catalog },
    },
    practice: {
      success: success({
        activeSessions: practiceActiveSessions,
        session: practiceActive,
      }),
      submittedFeedback: success(practiceSubmitted),
      empty: empty(
        {
          title: "No active practice session",
          message: "You have no practice session to resume.",
          nextAction: "Choose a certification and start practice.",
        },
        practiceNoActiveSessions,
      ),
      error: { state: "error", error: errors.practice },
    },
    exam: {
      success: success({ session: examActive, submissionPreview }),
      expired: success(examExpired),
      finalized: success(examFinalized),
      empty: empty({
        title: "No exam in progress",
        message: "Start a mock exam from a certification page.",
        nextAction: "Choose a certification.",
      }),
      error: { state: "error", error: errors.exam },
    },
    results: {
      success: success({ practice: practiceResult, exam: examResult }),
      empty: empty({
        title: "No result selected",
        message: "Select a completed attempt to review its result.",
        nextAction: "Open attempt history.",
      }),
      error: { state: "error", error: errors.result },
    },
    history: {
      success: success({ page: historyPopulated, trends: historyTrends }),
      empty: empty(
        {
          title: "No exam attempts yet",
          message: "Practice results are not included in exam history.",
          nextAction: "Start a mock exam to create your first attempt.",
        },
        { page: historyEmpty, trends: historyEmptyTrends },
      ),
      error: { state: "error", error: errors.history },
    },
    leaderboard: {
      success: success(leaderboardPopulated),
      empty: empty(
        {
          title: "No public scores yet",
          message: "No eligible public attempt exists for this certification.",
          nextAction: "Return after users publish completed exam scores.",
        },
        leaderboardEmpty,
      ),
      error: { state: "error", error: errors.leaderboard },
    },
    admin: {
      users: {
        success: success(pendingUsers),
        empty: empty(
          {
            title: "No users awaiting approval",
            message: "Every current user has already been reviewed.",
            nextAction: "Refresh when a new user signs in.",
          },
          noPendingUsers,
        ),
        error: { state: "error", error: errors.pendingUsers },
      },
      import: {
        success: success(validImport),
        empty: empty({
          title: "No JSON file selected",
          message: "Select a certification JSON file to see its validation summary.",
          nextAction: "Choose a JSON file.",
        }),
        error: {
          state: "error",
          data: invalidImport,
          error: errors.importValidation,
          preservedInput: source.import.invalidContent,
        },
      },
    },
  });
}

export const CERT_QUIZ_STATIC_PREVIEW_FIXTURES =
  createCertQuizStaticPreviewFixtures();

export type CertQuizStaticPreviewFixtures = ReturnType<
  typeof createCertQuizStaticPreviewFixtures
>;
