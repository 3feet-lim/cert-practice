import { CERT_QUIZ_STATIC_PREVIEW_FIXTURES } from "../mocks/static-preview-fixtures";

const examSuccessFixture = CERT_QUIZ_STATIC_PREVIEW_FIXTURES.exam.success;
const importSuccessFixture = CERT_QUIZ_STATIC_PREVIEW_FIXTURES.admin.import.success;

if (
  examSuccessFixture.state !== "success" ||
  examSuccessFixture.data === undefined ||
  importSuccessFixture.state !== "success" ||
  importSuccessFixture.data === undefined
) {
  throw new Error("Static success fixtures must include read-only preview data.");
}

const presentationFixtures = Object.freeze({
  loading: Object.freeze({
    state: "loading" as const,
    title: "Loading preview",
    message: "This deterministic preview represents content while it is loading.",
  }),
  examPreview: Object.freeze({
    state: "success" as const,
    data: examSuccessFixture.data.submissionPreview,
  }),
  examFinalized: CERT_QUIZ_STATIC_PREVIEW_FIXTURES.exam.finalized,
  leaderboardPrivate: Object.freeze({
    state: "success" as const,
    data: Object.freeze({
      scorePublic: false,
      message: "Your score is private and is not included in the leaderboard.",
    }),
  }),
  importValidating: Object.freeze({
    state: "loading" as const,
    title: "Validating JSON file",
    message:
      "The selected read-only fixture is being presented in its validating state.",
  }),
  importCommit: Object.freeze({
    state: "success" as const,
    data: Object.freeze({
      dialog: "commit-confirmation",
      validation: importSuccessFixture.data,
    }),
  }),
  importCompleted: Object.freeze({
    state: "success" as const,
    data: Object.freeze({
      message: "The validated catalog revision has been activated.",
    }),
  }),
  importTokenExpired: Object.freeze({
    state: "error" as const,
    message: "The commit token expired or was already used; validate the file again.",
  }),
});

/**
 * Read-only values available to the static route skeleton. This registry imports
 * no API port, query cache, store, MSW handler, timer, or mutation implementation.
 */
export const STATIC_PREVIEW_FIXTURES = Object.freeze({
  "actors.unauthenticated": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.actors.unauthenticated,
  "actors.callbackError": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.actors.callbackError,
  "actors.pending": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.actors.pending,
  "catalog.success": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.catalog.success,
  "catalog.empty": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.catalog.empty,
  "catalog.error": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.catalog.error,
  "practice.success": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.practice.success,
  "practice.submittedFeedback":
    CERT_QUIZ_STATIC_PREVIEW_FIXTURES.practice.submittedFeedback,
  "practice.error": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.practice.error,
  "exam.success": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.exam.success,
  "exam.expired": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.exam.expired,
  "exam.error": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.exam.error,
  "results.success": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.results.success,
  "results.empty": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.results.empty,
  "results.error": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.results.error,
  "history.success": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.history.success,
  "history.empty": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.history.empty,
  "history.error": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.history.error,
  "leaderboard.success": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.leaderboard.success,
  "leaderboard.empty": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.leaderboard.empty,
  "leaderboard.error": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.leaderboard.error,
  "admin.users.success": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.admin.users.success,
  "admin.users.empty": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.admin.users.empty,
  "admin.users.error": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.admin.users.error,
  "admin.import.success": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.admin.import.success,
  "admin.import.empty": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.admin.import.empty,
  "admin.import.error": CERT_QUIZ_STATIC_PREVIEW_FIXTURES.admin.import.error,
  "presentation.loading": presentationFixtures.loading,
  "presentation.examPreview": presentationFixtures.examPreview,
  "presentation.examFinalized": presentationFixtures.examFinalized,
  "presentation.leaderboardPrivate": presentationFixtures.leaderboardPrivate,
  "presentation.importValidating": presentationFixtures.importValidating,
  "presentation.importCommit": presentationFixtures.importCommit,
  "presentation.importCompleted": presentationFixtures.importCompleted,
  "presentation.importTokenExpired": presentationFixtures.importTokenExpired,
});

export type StaticPreviewFixtureKey = keyof typeof STATIC_PREVIEW_FIXTURES;

export function getStaticPreviewFixture(key: StaticPreviewFixtureKey): unknown {
  return STATIC_PREVIEW_FIXTURES[key];
}
