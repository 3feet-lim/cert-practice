import type {
  ApprovalStatusDto,
  CatalogDto,
  CommitImportResponse,
  HealthDto,
} from "@cert-quiz/contracts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { CertQuizCompositionRoot } from "../app/CertQuizCompositionRoot";
import { createMockAuthController, createMockCertQuizApi } from "./mock-adapter";
import { createCertQuizFixtures } from "../mocks/fixtures";
import { useCertQuizApi } from "./useCertQuizApi";
import type { CertQuizApi, CertQuizApiResult, StartPracticeInput } from "./port";
import { createUnavailableCertQuizApi } from "./unavailable-adapter";

const certificationId = "00000000-0000-4000-8000-000000000003";

const operationNames = [
  "getHealth",
  "getApprovalStatus",
  "getCurrentUser",
  "getCatalog",
  "listActivePracticeSessions",
  "startPractice",
  "startExam",
  "resumePractice",
  "replacePractice",
  "patchPracticeState",
  "submitPracticeQuestion",
  "getExam",
  "patchExamState",
  "getExamSubmissionPreview",
  "submitExam",
  "getPracticeResult",
  "getAttempt",
  "getHistory",
  "getHistoryTrends",
  "updateScoreVisibility",
  "getLeaderboard",
  "getPendingUsers",
  "approveUser",
  "dryRunImport",
  "commitImport",
] as const satisfies ReadonlyArray<keyof CertQuizApi>;

function ApprovalProbe() {
  const api = useCertQuizApi();
  const [status, setStatus] = useState("unknown");

  const refresh = async () => {
    const result = await api.getApprovalStatus();
    setStatus(result.ok ? result.data.approvalStatus : result.error.code);
  };

  return <button onClick={() => void refresh()}>{status}</button>;
}

type HealthCallResult = Awaited<ReturnType<CertQuizApi["getHealth"]>>;
type CatalogCallResult = Awaited<ReturnType<CertQuizApi["getCatalog"]>>;
type ApprovalCallResult = Awaited<ReturnType<CertQuizApi["getApprovalStatus"]>>;
type CommitImportCallResult = Awaited<ReturnType<CertQuizApi["commitImport"]>>;

describe("CertQuizApi port", () => {
  it("types route parameters, request DTO fields, result data, and shared errors", () => {
    expectTypeOf<
      Parameters<CertQuizApi["startPractice"]>[0]
    >().toEqualTypeOf<StartPracticeInput>();
    expectTypeOf<StartPracticeInput>().toMatchTypeOf<{
      certificationId: string;
    }>();
    expectTypeOf<HealthCallResult>().toEqualTypeOf<CertQuizApiResult<HealthDto>>();
    expectTypeOf<CatalogCallResult>().toEqualTypeOf<CertQuizApiResult<CatalogDto>>();
    expectTypeOf<ApprovalCallResult>().toEqualTypeOf<
      CertQuizApiResult<ApprovalStatusDto>
    >();
    expectTypeOf<CommitImportCallResult>().toEqualTypeOf<
      CertQuizApiResult<CommitImportResponse>
    >();
  });

  it("provides every S1-S10 operation through the bootstrap fallback", async () => {
    const api = createUnavailableCertQuizApi();

    expect(Object.keys(api)).toEqual(operationNames);

    for (const operationName of operationNames) {
      const operation = api[operationName] as (
        input?: unknown,
      ) => Promise<CertQuizApiResult<unknown>>;
      await expect(operation()).resolves.toEqual({
        ok: false,
        error: {
          code: "dependency-unavailable",
          message: "The CertQuiz API adapter is not configured.",
          requestId: "frontend-api-not-configured",
          retryable: true,
          nextAction: "Configure a mock or HTTP adapter and retry.",
        },
      });
    }
  });

  it("exposes deterministic mock data for shared query hooks without HTTP", async () => {
    const api = createMockCertQuizApi();

    await expect(api.getCatalog()).resolves.toMatchObject({
      ok: true,
      data: { providers: [{ name: "AWS" }] },
      meta: { requestId: "mock:catalog:valid" },
    });
    await expect(api.listActivePracticeSessions()).resolves.toMatchObject({
      ok: true,
      data: { sessions: [{ currentQuestionNumber: 8 }] },
      meta: { requestId: "mock:practice:active" },
    });
    await expect(
      createMockCertQuizApi({ authActor: "pending" }).getCatalog(),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "approval-required", retryable: false },
    });
  });

  it("serves attempt-only history, server ranks, and versioned score visibility", async () => {
    const fixtures = createCertQuizFixtures();
    const api = createMockCertQuizApi();

    await expect(api.getHistory({})).resolves.toEqual({
      ok: true,
      data: fixtures.history.populated,
      meta: { requestId: "mock:history:attempts" },
    });
    await expect(api.getHistoryTrends()).resolves.toEqual({
      ok: true,
      data: fixtures.history.trends,
      meta: { requestId: "mock:history:trends" },
    });

    const initialLeaderboard = await api.getLeaderboard({
      certificationId: fixtures.ids.certificationId,
    });
    expect(initialLeaderboard).toMatchObject({
      ok: true,
      data: { entries: [{ rank: 1 }, { rank: 2 }, { rank: 2 }, { rank: 4 }] },
    });
    if (!initialLeaderboard.ok) return;
    expect(
      initialLeaderboard.data.entries.filter((entry) => entry.isCurrentUser),
    ).toHaveLength(1);

    const currentUser = await api.getCurrentUser();
    if (!currentUser.ok) return;
    await expect(
      api.updateScoreVisibility({
        scorePublic: false,
        expectedVersion: currentUser.data.stateVersion,
      }),
    ).resolves.toMatchObject({ ok: true, data: { scorePublic: false } });
    await expect(
      api.updateScoreVisibility({
        scorePublic: true,
        expectedVersion: currentUser.data.stateVersion,
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "stale-version" } });
    await expect(
      api.getLeaderboard({ certificationId: fixtures.ids.certificationId }),
    ).resolves.toMatchObject({
      ok: true,
      data: { entries: [{ rank: 1 }, { rank: 2 }, { rank: 4 }] },
    });
  });

  it("enforces the practice result 168-hour retention boundary at expiry", async () => {
    const fixtures = createCertQuizFixtures();
    let serverNow = Date.parse(fixtures.practice.immutableResult.expiresAt) - 1;
    const api = createMockCertQuizApi({ now: () => new Date(serverNow) });
    const session = await api.resumePractice({
      practiceSessionId: fixtures.ids.practiceSessionId,
    });
    if (!session.ok) throw new Error("Expected an approved practice session.");

    let expectedVersion = session.data.stateVersion;
    for (const question of fixtures.practice.immutableResult.questions) {
      const submitted = await api.submitPracticeQuestion({
        practiceSessionId: fixtures.ids.practiceSessionId,
        questionId: question.id,
        expectedVersion,
        selectedChoiceIds: [...question.correctChoiceIds],
      });
      if (!submitted.ok)
        throw new Error(`Expected practice submission: ${submitted.error.code}`);
      expectedVersion = submitted.data.stateVersion;
    }

    await expect(
      api.getPracticeResult({ resultId: fixtures.ids.practiceResultId }),
    ).resolves.toMatchObject({
      ok: true,
      data: { resultId: fixtures.ids.practiceResultId },
    });
    serverNow = Date.parse(fixtures.practice.immutableResult.expiresAt);
    await expect(
      api.getPracticeResult({ resultId: fixtures.ids.practiceResultId }),
    ).resolves.toMatchObject({ ok: false, error: { code: "practice-result-expired" } });
  });

  it("keeps mock practice state per instance until an explicit replacement", async () => {
    const api = createMockCertQuizApi();

    const initialSessions = await api.listActivePracticeSessions();
    expect(initialSessions).toMatchObject({
      ok: true,
      data: { sessions: [{ currentQuestionNumber: 8, stateVersion: 12 }] },
    });
    if (!initialSessions.ok) return;
    const initialSession = initialSessions.data.sessions[0];
    expect(initialSession).toBeDefined();
    if (!initialSession) return;

    await expect(api.startPractice({ certificationId })).resolves.toEqual({
      ok: true,
      data: {
        kind: "resume-or-replace-required",
        session: initialSession,
        allowedActions: ["resume", "replace"],
      },
      meta: { requestId: "mock:practice:start:active" },
    });
    await expect(api.listActivePracticeSessions()).resolves.toEqual(initialSessions);

    const resumed = await api.resumePractice({
      practiceSessionId: initialSession.practiceSessionId,
    });
    expect(resumed).toMatchObject({
      ok: true,
      data: { practiceSessionId: initialSession.practiceSessionId },
      meta: { requestId: "mock:practice:resume" },
    });
    await expect(api.listActivePracticeSessions()).resolves.toEqual(initialSessions);

    await expect(
      api.replacePractice({
        practiceSessionId: initialSession.practiceSessionId,
        confirmationNonce: "",
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "validation-failed", retryable: false },
    });
    await expect(api.listActivePracticeSessions()).resolves.toEqual(initialSessions);

    const replacement = await api.replacePractice({
      practiceSessionId: initialSession.practiceSessionId,
      confirmationNonce: "replace-active-practice",
    });
    expect(replacement).toMatchObject({
      ok: true,
      data: { currentIndex: 0, stateVersion: 1 },
      meta: { requestId: "mock:practice:replace" },
    });
    if (!replacement.ok) return;
    expect(replacement.data.practiceSessionId).not.toBe(
      initialSession.practiceSessionId,
    );

    await expect(api.listActivePracticeSessions()).resolves.toEqual({
      ok: true,
      data: {
        sessions: [
          expect.objectContaining({
            practiceSessionId: replacement.data.practiceSessionId,
            currentQuestionNumber: 1,
            stateVersion: 1,
          }),
        ],
      },
      meta: { requestId: "mock:practice:active" },
    });
    await expect(
      api.resumePractice({ practiceSessionId: replacement.data.practiceSessionId }),
    ).resolves.toMatchObject({
      ok: true,
      data: { practiceSessionId: replacement.data.practiceSessionId },
    });

    const untouchedApi = createMockCertQuizApi();
    await expect(untouchedApi.listActivePracticeSessions()).resolves.toEqual(
      initialSessions,
    );

    const firstExam = await api.startExam({
      certificationId,
      idempotencyKey: "start-exam",
    });
    const repeatedExam = await api.startExam({
      certificationId,
      idempotencyKey: "start-exam",
    });
    expect(firstExam).toEqual(repeatedExam);
    expect(firstExam).toMatchObject({
      ok: true,
      data: { stateVersion: 21 },
      meta: { requestId: "mock:exam:start" },
    });
  });

  it("guards mock practice and exam operations before mutating state", async () => {
    const authController = createMockAuthController();
    const api = createMockCertQuizApi({ authController });
    const activePracticeSessionId = createCertQuizFixtures().ids.practiceSessionId;

    await expect(api.startPractice({ certificationId })).resolves.toMatchObject({
      ok: false,
      error: { code: "authentication-invalid" },
    });
    await expect(
      api.resumePractice({ practiceSessionId: activePracticeSessionId }),
    ).resolves.toMatchObject({ ok: false, error: { code: "authentication-invalid" } });
    await expect(
      api.replacePractice({
        practiceSessionId: activePracticeSessionId,
        confirmationNonce: "replace-active-practice",
      }),
    ).resolves.toMatchObject({ ok: false, error: { code: "authentication-invalid" } });
    await expect(
      api.startExam({ certificationId, idempotencyKey: "start-exam" }),
    ).resolves.toMatchObject({ ok: false, error: { code: "authentication-invalid" } });

    authController.completeMockLogin();
    await expect(api.startPractice({ certificationId })).resolves.toMatchObject({
      ok: false,
      error: { code: "approval-required" },
    });

    authController.approve();
    await expect(
      api.resumePractice({ practiceSessionId: activePracticeSessionId }),
    ).resolves.toMatchObject({
      ok: true,
      data: { practiceSessionId: activePracticeSessionId, stateVersion: 12 },
    });
  });

  it("resolves the controller actor when each mock API request runs", async () => {
    const authController = createMockAuthController();
    const api = createMockCertQuizApi({ authController });

    await expect(api.getApprovalStatus()).resolves.toMatchObject({
      ok: false,
      error: { code: "authentication-invalid" },
    });

    authController.completeMockLogin();
    await expect(api.getApprovalStatus()).resolves.toMatchObject({
      ok: true,
      data: { approvalStatus: "pending" },
    });
    await expect(api.getCurrentUser()).resolves.toMatchObject({
      ok: false,
      error: { code: "approval-required" },
    });

    authController.approve();
    await expect(api.getApprovalStatus()).resolves.toMatchObject({
      ok: true,
      data: { approvalStatus: "approved" },
    });
    await expect(api.getCurrentUser()).resolves.toMatchObject({
      ok: true,
      data: { approvalStatus: "approved" },
    });
  });

  it("provides instance-scoped admin pending users with guarded idempotent approval", async () => {
    const fixtures = createCertQuizFixtures();
    const [firstPendingUser, secondPendingUser] = fixtures.admin.pendingUsers.users;
    if (!firstPendingUser || !secondPendingUser) {
      throw new Error("Expected deterministic pending user fixtures.");
    }
    const api = createMockCertQuizApi({ authActor: "admin" });

    await expect(api.getPendingUsers()).resolves.toEqual({
      ok: true,
      data: fixtures.admin.pendingUsers,
      meta: { requestId: "mock:admin:pending-users" },
    });
    const initialApproval = await api.approveUser({ userId: firstPendingUser.id });
    expect(initialApproval).toEqual({
      ok: true,
      data: { userId: firstPendingUser.id, approvalStatus: "approved" },
      meta: { requestId: "mock:admin:approve-user" },
    });
    await expect(api.approveUser({ userId: firstPendingUser.id })).resolves.toEqual(
      initialApproval,
    );
    await expect(api.getPendingUsers()).resolves.toEqual({
      ok: true,
      data: { users: [secondPendingUser] },
      meta: { requestId: "mock:admin:pending-users" },
    });
    await expect(
      api.approveUser({ userId: "00000000-0000-4000-8000-000000000000" }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "not-found", retryable: false },
    });
    await api.approveUser({ userId: secondPendingUser.id });
    await expect(api.getPendingUsers()).resolves.toEqual({
      ok: true,
      data: fixtures.admin.emptyPendingUsers,
      meta: { requestId: "mock:admin:pending-users" },
    });

    for (const actor of ["unauthenticated", "pending", "approved"] as const) {
      const guardedApi = createMockCertQuizApi({ authActor: actor });
      const expectedCode =
        actor === "unauthenticated"
          ? "authentication-invalid"
          : actor === "pending"
            ? "approval-required"
            : "admin-required";
      await expect(guardedApi.getPendingUsers()).resolves.toMatchObject({
        ok: false,
        error: { code: expectedCode, retryable: false },
      });
      await expect(
        guardedApi.approveUser({ userId: firstPendingUser.id }),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: expectedCode, retryable: false },
      });
    }
  });

  it("injects and replaces adapters only through the composition root", async () => {
    const user = userEvent.setup();
    const pending = vi.fn(async () => ({
      ok: true as const,
      data: { approvalStatus: "pending" as const },
    }));
    const approved = vi.fn(async () => ({
      ok: true as const,
      data: { approvalStatus: "approved" as const },
    }));
    const firstApi: CertQuizApi = {
      ...createUnavailableCertQuizApi(),
      getApprovalStatus: pending,
    };
    const secondApi: CertQuizApi = {
      ...createUnavailableCertQuizApi(),
      getApprovalStatus: approved,
    };

    const view = render(
      <CertQuizCompositionRoot api={firstApi}>
        <ApprovalProbe />
      </CertQuizCompositionRoot>,
    );

    await user.click(screen.getByRole("button", { name: "unknown" }));
    expect(await screen.findByRole("button", { name: "pending" })).toBeVisible();
    expect(pending).toHaveBeenCalledOnce();

    view.rerender(
      <CertQuizCompositionRoot api={secondApi}>
        <ApprovalProbe />
      </CertQuizCompositionRoot>,
    );
    await user.click(screen.getByRole("button", { name: "pending" }));
    expect(await screen.findByRole("button", { name: "approved" })).toBeVisible();
    expect(approved).toHaveBeenCalledOnce();
  });

  it("fails fast when a component bypasses the provider", () => {
    expect(() => render(<ApprovalProbe />)).toThrow(
      "useCertQuizApi must be used within CertQuizApiProvider",
    );
  });

  it("accepts certification IDs as transport-independent operation input", () => {
    const input: StartPracticeInput = { certificationId };
    expect(input).toEqual({ certificationId });
  });
});
