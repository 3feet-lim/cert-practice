import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockAuthController,
  createMockCertQuizApi,
  type MockAuthActor,
} from "../api/mock-adapter";
import type { MockAuthCallbackCapability } from "./mock-auth-capability";
import type { CertQuizApi } from "../api/port";
import { App } from "../App";
import { createQuizStore, type QuizQuestionTarget } from "../quiz/quiz-store";
import { createCertQuizFixtures } from "../mocks/fixtures";
import { MOCK_IDS } from "../mocks/state-machine";
import { CertQuizCompositionRoot } from "./CertQuizCompositionRoot";
import { createCertQuizQueryClient } from "./query-client";
import { certQuizQueryKeys } from "./query-keys";
const defaultFixtures = createCertQuizFixtures();
const { certificationId: defaultCertificationId } = defaultFixtures.ids;

afterEach(cleanup);
function LocationProbe() {
  const location = useLocation();
  return (
    <output data-testid="location">
      {location.pathname}
      {location.search}
      {location.hash}
    </output>
  );
}
function renderRoute(
  path: string,
  options: {
    actor?: MockAuthActor;
    api?: CertQuizApi;
    authCallbackCapability?: MockAuthCallbackCapability;
    queryClient?: ReturnType<typeof createCertQuizQueryClient>;
    quizStore?: ReturnType<typeof createQuizStore>;
  } = {},
) {
  const api = options.api ?? createMockCertQuizApi({ authActor: options.actor });
  const queryClient = options.queryClient ?? createCertQuizQueryClient();
  const quizStore = options.quizStore ?? createQuizStore();
  return {
    ...render(
      <MemoryRouter initialEntries={[path]}>
        <CertQuizCompositionRoot
          api={api}
          authCallbackCapability={options.authCallbackCapability}
          queryClient={queryClient}
          quizStore={quizStore}
        >
          <App />
          <LocationProbe />
        </CertQuizCompositionRoot>
      </MemoryRouter>,
    ),
    queryClient,
    quizStore,
  };
}
describe("application route hierarchy", () => {
  it.each([
    [`/app/certifications/${defaultCertificationId}`, "S3", "학습 모드 선택"],
    ["/app/practice/session-1", "S4", "연습 모드"],
    ["/app/exams/session-1", "S5", "모의고사"],
    [`/app/practice-results/${MOCK_IDS.practiceResult}`, "S6", "연습 결과"],
    [`/app/attempts/${MOCK_IDS.attempt}`, "S7", "모의고사 결과"],
    ["/app/history", "S8", "모의고사 이력"],
    [`/app/leaderboards/${defaultCertificationId}`, "S9", "리더보드"],
  ])("renders approved route %s", async (path, screenId, title) => {
    renderRoute(path, {
      api: createMockCertQuizApi({ e2eScenario: "completed-results" }),
    });
    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    if (["S3", "S4", "S5"].includes(screenId)) {
      expect(document.querySelector(`[data-screen="${screenId}"]`)).not.toBeNull();
    }
  });
  it("renders the runtime populated pending-user page for an admin actor", async () => {
    renderRoute("/app/admin/users", { actor: "admin" });

    expect(
      await screen.findByRole("heading", { name: "승인 대기 사용자" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "관리자 콘솔" })).toBeVisible();
    expect(screen.getByText("Pending One")).toBeVisible();
    expect(screen.getByText("Pending Two")).toBeVisible();
    expect(document.querySelector('[data-screen="ADMIN-USERS"]')).toBeNull();
  });
  it("renders the empty pending-user response as a successful state", async () => {
    const mockApi = createMockCertQuizApi({ authActor: "admin" });
    const api: CertQuizApi = {
      ...mockApi,
      getPendingUsers: async () => ({
        ok: true,
        data: { users: [] },
        meta: { requestId: "router:pending-users:empty" },
      }),
    };

    renderRoute("/app/admin/users", { api });
    expect(
      await screen.findByRole("heading", { name: "승인 대기 사용자가 없습니다" }),
    ).toBeVisible();
  });
  it("renders the pending-user loading and safe query-error states", async () => {
    let resolvePendingUsers: (() => void) | undefined;
    const pendingRequest = new Promise<void>((resolve) => {
      resolvePendingUsers = resolve;
    });
    const mockApi = createMockCertQuizApi({ authActor: "admin" });
    const loadingApi: CertQuizApi = {
      ...mockApi,
      getPendingUsers: async () => {
        await pendingRequest;
        return mockApi.getPendingUsers();
      },
    };

    const loadingView = renderRoute("/app/admin/users", { api: loadingApi });
    expect(
      await screen.findByText("승인 대기 사용자를 불러오는 중입니다."),
    ).toBeVisible();
    resolvePendingUsers?.();
    await screen.findByText("Pending One");
    loadingView.unmount();

    const errorApi: CertQuizApi = {
      ...mockApi,
      getPendingUsers: async () => ({
        ok: false,
        error: {
          code: "dependency-unavailable",
          message: "Pending users are temporarily unavailable.",
          requestId: "router:pending-users:error",
          retryable: true,
          nextAction: "Retry later.",
        },
      }),
    };
    renderRoute("/app/admin/users", { api: errorApi });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pending users are temporarily unavailable.",
    );
  });
  it("locks only the approving row and removes it after canonical approval", async () => {
    const user = userEvent.setup();
    const mockApi = createMockCertQuizApi({ authActor: "admin" });
    let releaseApproval: (() => void) | undefined;
    const approvalGate = new Promise<void>((resolve) => {
      releaseApproval = resolve;
    });
    const approveUser = vi.fn(
      async (input: Parameters<CertQuizApi["approveUser"]>[0]) => {
        await approvalGate;
        return mockApi.approveUser(input);
      },
    );
    const api: CertQuizApi = { ...mockApi, approveUser };

    renderRoute("/app/admin/users", { api });
    const firstApproval = await screen.findByRole("button", {
      name: "Pending One 승인",
    });
    const secondApproval = screen.getByRole("button", { name: "Pending Two 승인" });
    await user.click(firstApproval);
    expect(firstApproval).toBeDisabled();
    expect(secondApproval).toBeEnabled();

    releaseApproval?.();
    await waitFor(() => {
      expect(screen.queryByText("Pending One")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Pending Two")).toBeVisible();
  });
  it("keeps the row available and presents a safe approval error", async () => {
    const user = userEvent.setup();
    const mockApi = createMockCertQuizApi({ authActor: "admin" });
    const api: CertQuizApi = {
      ...mockApi,
      approveUser: async () => ({
        ok: false,
        error: {
          code: "dependency-unavailable",
          message: "Approval is temporarily unavailable.",
          requestId: "router:pending-users:approve-error",
          retryable: true,
          nextAction: "Retry later.",
        },
      }),
    };

    renderRoute("/app/admin/users", { api });
    const firstApproval = await screen.findByRole("button", {
      name: "Pending One 승인",
    });
    await user.click(firstApproval);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Approval is temporarily unavailable.",
    );
    expect(screen.getByText("Pending One")).toBeVisible();
    expect(firstApproval).toBeEnabled();
  });
  it("preserves an approved destination while sending unauthenticated users to login", async () => {
    renderRoute("/app/history?period=recent#trend", { actor: "unauthenticated" });
    expect(
      await screen.findByRole("heading", { name: "Google 계정으로 로그인" }),
    ).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/login?returnTo=%2Fapp%2Fhistory%3Fperiod%3Drecent%23trend",
    );
    expect(
      screen.getByRole("link", { name: "Google 로그인 계속하기" }),
    ).toHaveAttribute(
      "href",
      "/auth/callback?returnTo=%2Fapp%2Fhistory%3Fperiod%3Drecent%23trend",
    );
  });
  it("limits pending users to the approval status screen", async () => {
    renderRoute("/app/history", { actor: "pending" });
    expect(
      await screen.findByRole("heading", {
        name: "관리자 승인을 기다리고 있습니다.",
      }),
    ).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/pending?returnTo=%2Fapp%2Fhistory",
    );
  });
  it("restores the protected destination after mock approval refresh", async () => {
    const user = userEvent.setup();
    const authController = createMockAuthController();
    const mockApi = createMockCertQuizApi({ authController });
    const getApprovalStatus = vi.fn(mockApi.getApprovalStatus);
    const getCurrentUser = vi.fn(mockApi.getCurrentUser);
    const api: CertQuizApi = { ...mockApi, getApprovalStatus, getCurrentUser };

    renderRoute("/app/history?period=recent#trend", {
      api,
      authCallbackCapability: authController,
    });

    await user.click(
      await screen.findByRole("link", { name: "Google 로그인 계속하기" }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "관리자 승인을 기다리고 있습니다.",
      }),
    ).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/pending?returnTo=%2Fapp%2Fhistory%3Fperiod%3Drecent%23trend",
    );
    expect(getCurrentUser).not.toHaveBeenCalled();

    authController.approve();
    await user.click(screen.getByRole("button", { name: "승인 상태 새로고침" }));

    expect(await screen.findByRole("heading", { name: "모의고사 이력" })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent(
        "/app/history?period=recent#trend",
      );
    });
    expect(getApprovalStatus).toHaveBeenCalledTimes(3);
    expect(getCurrentUser).toHaveBeenCalledOnce();
  });
  it("renders canonical admin-required state instead of treating the UX guard as security", async () => {
    renderRoute("/app/admin/import", { actor: "approved" });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Administrator access is required.",
    );
    expect(screen.getByText("admin-required")).toBeVisible();
  });
  it("restores an allowlisted callback destination for an approved user", async () => {
    renderRoute("/auth/callback?returnTo=%2Fapp%2Fhistory", { actor: "approved" });
    expect(await screen.findByRole("heading", { name: "모의고사 이력" })).toBeVisible();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/app/history");
    });
  });
  it("rejects external callback destinations and falls back to the app home", async () => {
    renderRoute("/auth/callback?returnTo=https%3A%2F%2Fevil.example%2Fapp", {
      actor: "approved",
    });
    expect(
      await screen.findByRole("heading", {
        name: "클라우드 자격증 연습을 시작하세요.",
      }),
    ).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/app");
  });
  it("renders only the canonical callback error without query credentials", async () => {
    renderRoute(
      "/auth/callback?error=access_denied&code=oauth-code-secret&state=opaque-state&token=token-secret",
      { actor: "unauthenticated" },
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("로그인을 완료하지 못했습니다.");
    expect(alert).toHaveTextContent("로그인 화면에서 다시 시작하세요.");
    expect(alert).not.toHaveTextContent("access_denied");
    expect(alert).not.toHaveTextContent("oauth-code-secret");
    expect(alert).not.toHaveTextContent("opaque-state");
    expect(alert).not.toHaveTextContent("token-secret");
  });
  it("purges authenticated query data and transient quiz state before returning to login", async () => {
    const user = userEvent.setup();
    const fixtures = createCertQuizFixtures();
    const queryClient = createCertQuizQueryClient();
    const quizStore = createQuizStore();
    const questionId = fixtures.ids.questionIds[0];
    if (!questionId) throw new Error("Expected a deterministic question fixture.");
    const target =
      `practice:${fixtures.ids.practiceSessionId}:${questionId}` as QuizQuestionTarget;
    queryClient.setQueryData(certQuizQueryKeys.catalog(), fixtures.catalog.valid);
    quizStore
      .getState()
      .setCurrentIndex(`practice:${fixtures.ids.practiceSessionId}`, 4);
    quizStore.getState().setDraftChoiceIds(target, []);
    quizStore
      .getState()
      .openSubmissionDialog(`practice:${fixtures.ids.practiceSessionId}`);
    const view = renderRoute("/app", { queryClient, quizStore });
    expect(
      await screen.findByRole("heading", {
        name: "클라우드 자격증 연습을 시작하세요.",
      }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(
      await screen.findByRole("heading", { name: "Google 계정으로 로그인" }),
    ).toBeVisible();
    expect(
      queryClient.getQueryCache().findAll({ queryKey: certQuizQueryKeys.all }),
    ).toEqual([]);
    expect(quizStore.getState().currentIndexBySession).toEqual({});
    expect(quizStore.getState().draftChoiceIdsByQuestion).toEqual({});
    expect(quizStore.getState().submissionDialogTarget).toBeNull();
    view.unmount();
  });
  it("renders grouped catalog data and an independent active-practice link", async () => {
    renderRoute("/app");

    expect(await screen.findByRole("heading", { name: "AWS" })).toBeVisible();
    expect(screen.getByText("DOP-C02")).toBeVisible();
    expect(screen.getByRole("link", { name: "학습 모드 선택" })).toHaveAttribute(
      "href",
      `/app/certifications/${defaultCertificationId}`,
    );
    expect(screen.getByRole("region", { name: "이어 풀 수 있는 연습" })).toBeVisible();
  });

  it("renders a safe catalog error without treating an active session as catalog data", async () => {
    const api: CertQuizApi = {
      ...createMockCertQuizApi(),
      getCatalog: async () => ({
        ok: false,
        error: {
          code: "dependency-unavailable",
          message: "Catalog is temporarily unavailable.",
          requestId: "router:catalog:error",
          retryable: true,
          nextAction: "Retry later.",
        },
      }),
    };

    renderRoute("/app", { api });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Catalog is temporarily unavailable.",
    );
    expect(screen.queryByRole("heading", { name: "AWS" })).not.toBeInTheDocument();
  });

  it("renders the catalog empty state and keeps catalog content independent from active-session errors", async () => {
    const emptyView = renderRoute("/app", {
      api: createMockCertQuizApi({ catalog: "empty" }),
    });
    expect(
      await screen.findByRole("heading", { name: "학습 가능한 자격증이 없습니다." }),
    ).toBeVisible();
    emptyView.unmount();

    const mockApi = createMockCertQuizApi();
    const api: CertQuizApi = {
      ...mockApi,
      listActivePracticeSessions: async () => ({
        ok: false,
        error: {
          code: "dependency-unavailable",
          message: "Active sessions are temporarily unavailable.",
          requestId: "router:active-practice:error",
          retryable: true,
          nextAction: "Retry later.",
        },
      }),
    };
    const view = renderRoute("/app", { api });
    expect(await screen.findByRole("heading", { name: "AWS" })).toBeVisible();
    expect(
      screen.queryByRole("region", { name: "이어 풀 수 있는 연습" }),
    ).not.toBeInTheDocument();
    view.unmount();
  });

  it("keeps active practice unchanged until a resume or confirmed replacement is selected", async () => {
    const user = userEvent.setup();
    const mockApi = createMockCertQuizApi();
    const startPractice = vi.fn(mockApi.startPractice);
    const resumePractice = vi.fn(mockApi.resumePractice);
    const replacePractice = vi.fn(mockApi.replacePractice);
    const api: CertQuizApi = {
      ...mockApi,
      startPractice,
      resumePractice,
      replacePractice,
    };

    renderRoute(`/app/certifications/${defaultCertificationId}`, { api });
    await user.click(await screen.findByRole("button", { name: "연습 시작" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "진행 중인 연습이 있습니다",
    );
    expect(startPractice).toHaveBeenCalledOnce();
    expect(replacePractice).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(replacePractice).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "연습 시작" }));
    await user.click(await screen.findByRole("button", { name: "이어 풀기" }));
    expect(resumePractice).toHaveBeenCalledOnce();
    expect(replacePractice).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/app/practice/");
    });
  });

  it("replaces practice only after explicit confirmation and starts exams only after confirmation", async () => {
    const user = userEvent.setup();
    const mockApi = createMockCertQuizApi();
    const replacePractice = vi.fn(mockApi.replacePractice);
    const startExam = vi.fn(mockApi.startExam);
    const api: CertQuizApi = { ...mockApi, replacePractice, startExam };

    const replacementView = renderRoute(
      `/app/certifications/${defaultCertificationId}`,
      {
        api,
      },
    );
    await user.click(await screen.findByRole("button", { name: "연습 시작" }));
    expect(replacePractice).not.toHaveBeenCalled();
    await user.click(await screen.findByRole("button", { name: "기존 세션 교체" }));
    expect(replacePractice).toHaveBeenCalledOnce();
    expect(replacePractice.mock.calls[0]?.[0].confirmationNonce).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/app/practice/");
    });
    replacementView.unmount();

    const examView = renderRoute(`/app/certifications/${defaultCertificationId}`, {
      api,
    });
    await user.click(await screen.findByRole("button", { name: "모의고사 시작" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent(
      "모의고사를 시작할까요?",
    );
    expect(startExam).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(startExam).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "모의고사 시작" }));
    await user.click(await screen.findByRole("button", { name: "확인하고 시작" }));
    expect(startExam).toHaveBeenCalledOnce();
    expect(startExam.mock.calls[0]?.[0].idempotencyKey).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId("location")).toHaveTextContent("/app/exams/");
    });
    examView.unmount();
  });

  it("shows a safe unavailable state for an unknown certification", async () => {
    renderRoute("/app/certifications/00000000-0000-4000-8000-000000000000");
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "자격증을 찾을 수 없습니다.",
    );
  });

  it("uses the API port's canonical authorization error state", async () => {
    const api: CertQuizApi = {
      ...createMockCertQuizApi(),
      getApprovalStatus: async () => ({
        ok: false,
        error: {
          code: "admin-required",
          message: "Administrator access is required by the API.",
          requestId: "test:admin-required",
          retryable: false,
          nextAction: "Return to an approved route.",
        },
      }),
    };
    renderRoute("/app", { api });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Administrator access is required by the API.",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Return to an approved route.");
  });
});
