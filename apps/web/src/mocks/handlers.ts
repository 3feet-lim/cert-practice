import { HttpResponse, http, type HttpHandler } from "msw";

import type { CertQuizFixtures } from "./fixtures";

export type FixtureActor = "unauthenticated" | "pending" | "approved" | "admin";

export interface CertQuizFixtureScenario {
  actor?: FixtureActor;
  catalog?: "empty" | "valid" | "invalid";
  practice?: "active" | "submitted";
  exam?: "active" | "expired" | "finalized";
  history?: "empty" | "populated";
  leaderboard?: "empty" | "tied";
  pendingUsers?: "empty" | "populated";
  dryRun?: "valid" | "invalid";
}

function success(data: unknown, fixtures: CertQuizFixtures, requestId: string) {
  return HttpResponse.json({
    data,
    meta: { requestId, serverNow: fixtures.clock.iso() },
  });
}

function failure(
  status: 401 | 403 | 404,
  code: "authentication-invalid" | "approval-required" | "admin-required" | "not-found",
  message: string,
  requestId: string,
) {
  return HttpResponse.json(
    {
      error: {
        code,
        message,
        requestId,
        retryable: false,
        nextAction:
          status === 401
            ? "Sign in with Google and retry."
            : status === 403
              ? "Use an account with the required access."
              : "Return to the previous screen and refresh.",
      },
    },
    { status },
  );
}

function approvedGuard(
  actor: FixtureActor,
  requestId: string,
): ReturnType<typeof failure> | undefined {
  if (actor === "unauthenticated") {
    return failure(
      401,
      "authentication-invalid",
      "Authentication is required.",
      requestId,
    );
  }
  if (actor === "pending") {
    return failure(
      403,
      "approval-required",
      "Account approval is required.",
      requestId,
    );
  }
  return undefined;
}

function adminGuard(
  actor: FixtureActor,
  requestId: string,
): ReturnType<typeof failure> | undefined {
  const approvalFailure = approvedGuard(actor, requestId);
  if (approvalFailure !== undefined) {
    return approvalFailure;
  }
  if (actor !== "admin") {
    return failure(
      403,
      "admin-required",
      "Administrator access is required.",
      requestId,
    );
  }
  return undefined;
}

/**
 * Static success corpus for UI development. Stateful transitions, latency,
 * rollback, stale writes, and idempotency scenarios intentionally belong to
 * task 1.6 rather than these read-only fixture handlers.
 */
export function createCertQuizFixtureHandlers(
  fixtures: CertQuizFixtures,
  scenario: CertQuizFixtureScenario = {},
): HttpHandler[] {
  const actor = scenario.actor ?? "approved";
  const catalog = scenario.catalog ?? "valid";
  const practice = scenario.practice ?? "active";
  const exam = scenario.exam ?? "active";
  const history = scenario.history ?? "populated";
  const leaderboard = scenario.leaderboard ?? "tied";
  const pendingUsers = scenario.pendingUsers ?? "populated";
  const dryRun = scenario.dryRun ?? "valid";

  const withApproved = (
    requestId: string,
    response: () => ReturnType<typeof success>,
  ) => approvedGuard(actor, requestId) ?? response();
  const withAdmin = (requestId: string, response: () => ReturnType<typeof success>) =>
    adminGuard(actor, requestId) ?? response();

  return [
    http.get("*/v1/health", () => success(fixtures.health, fixtures, "fixture:health")),
    http.get("*/v1/me/approval", () => {
      const requestId = "fixture:me-approval";
      if (actor === "unauthenticated") {
        return failure(
          401,
          "authentication-invalid",
          "Authentication is required.",
          requestId,
        );
      }
      const approval =
        actor === "pending"
          ? fixtures.auth.pending.approval
          : actor === "admin"
            ? fixtures.auth.admin.approval
            : fixtures.auth.approved.approval;
      return success(approval, fixtures, requestId);
    }),
    http.get("*/v1/me", () => {
      const requestId = "fixture:me";
      return withApproved(requestId, () =>
        success(
          actor === "admin" ? fixtures.auth.admin.user : fixtures.auth.approved.user,
          fixtures,
          requestId,
        ),
      );
    }),
    http.get("*/v1/catalog", () => {
      const requestId = "fixture:catalog";
      return withApproved(requestId, () =>
        success(fixtures.catalog[catalog], fixtures, requestId),
      );
    }),
    http.get("*/v1/practice-sessions/active", () => {
      const requestId = "fixture:active-practice";
      return withApproved(requestId, () =>
        success(fixtures.practice.activeSessions, fixtures, requestId),
      );
    }),
    http.post("*/v1/practice/:practiceSessionId/resume", ({ params }) => {
      const requestId = "fixture:practice-resume";
      return withApproved(requestId, () =>
        params.practiceSessionId === fixtures.ids.practiceSessionId
          ? success(fixtures.practice[practice], fixtures, requestId)
          : failure(404, "not-found", "Practice session was not found.", requestId),
      );
    }),
    http.get("*/v1/practice-results/:resultId", ({ params }) => {
      const requestId = "fixture:practice-result";
      return withApproved(requestId, () =>
        params.resultId === fixtures.ids.practiceResultId
          ? success(fixtures.practice.immutableResult, fixtures, requestId)
          : failure(404, "not-found", "Practice result was not found.", requestId),
      );
    }),
    http.get("*/v1/exams/:examSessionId", ({ params }) => {
      const requestId = "fixture:exam";
      return withApproved(requestId, () => {
        const selectedExam = fixtures.exam[exam];
        return params.examSessionId === selectedExam.examSessionId
          ? success(selectedExam, fixtures, requestId)
          : failure(404, "not-found", "Exam session was not found.", requestId);
      });
    }),
    http.get("*/v1/attempts/:attemptId", ({ params }) => {
      const requestId = "fixture:attempt";
      return withApproved(requestId, () =>
        params.attemptId === fixtures.ids.attemptId
          ? success(fixtures.exam.immutableResult, fixtures, requestId)
          : failure(404, "not-found", "Attempt was not found.", requestId),
      );
    }),
    http.get("*/v1/history", () => {
      const requestId = "fixture:history";
      return withApproved(requestId, () =>
        success(fixtures.history[history], fixtures, requestId),
      );
    }),
    http.get("*/v1/history/trends", () => {
      const requestId = "fixture:history-trends";
      return withApproved(requestId, () =>
        success(
          history === "empty" ? fixtures.history.emptyTrends : fixtures.history.trends,
          fixtures,
          requestId,
        ),
      );
    }),
    http.get("*/v1/leaderboards/:certificationId", ({ params }) => {
      const requestId = "fixture:leaderboard";
      return withApproved(requestId, () =>
        params.certificationId === fixtures.ids.certificationId
          ? success(fixtures.leaderboard[leaderboard], fixtures, requestId)
          : failure(404, "not-found", "Certification was not found.", requestId),
      );
    }),
    http.get("*/v1/admin/pending-users", () => {
      const requestId = "fixture:pending-users";
      return withAdmin(requestId, () =>
        success(
          pendingUsers === "empty"
            ? fixtures.admin.emptyPendingUsers
            : fixtures.admin.pendingUsers,
          fixtures,
          requestId,
        ),
      );
    }),
    http.post("*/v1/admin/imports/dry-run", () => {
      const requestId = "fixture:import-dry-run";
      return withAdmin(requestId, () =>
        success(
          dryRun === "valid"
            ? fixtures.import.dryRunValid
            : fixtures.import.dryRunInvalid,
          fixtures,
          requestId,
        ),
      );
    }),
    http.post("*/v1/admin/imports/commit", () => {
      const requestId = "fixture:import-commit";
      return withAdmin(requestId, () =>
        success(fixtures.import.commitResponse, fixtures, requestId),
      );
    }),
  ];
}
