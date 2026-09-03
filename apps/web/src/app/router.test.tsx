import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { createMockCertQuizApi, type MockAuthActor } from "../api/mock-adapter";
import type { CertQuizApi } from "../api/port";
import { App } from "../App";
import { CertQuizCompositionRoot } from "./CertQuizCompositionRoot";

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
  options: { actor?: MockAuthActor; api?: CertQuizApi } = {},
) {
  const api = options.api ?? createMockCertQuizApi({ authActor: options.actor });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CertQuizCompositionRoot api={api}>
        <App />
        <LocationProbe />
      </CertQuizCompositionRoot>
    </MemoryRouter>,
  );
}

describe("application route hierarchy", () => {
  it.each([
    ["/app/certifications/cert-1", "S3", "학습 모드 선택"],
    ["/app/practice/session-1", "S4", "연습 모드"],
    ["/app/exams/session-1", "S5", "모의고사"],
    ["/app/practice-results/result-1", "S6", "연습 결과"],
    ["/app/attempts/attempt-1", "S7", "모의고사 결과"],
    ["/app/history", "S8", "모의고사 이력"],
    ["/app/leaderboards/cert-1", "S9", "리더보드"],
  ])("renders approved route %s", async (path, screenId, title) => {
    renderRoute(path);

    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    expect(document.querySelector(`[data-screen="${screenId}"]`)).not.toBeNull();
  });

  it.each([
    ["/app/admin/users", "승인 대기 사용자"],
    ["/app/admin/import", "문제 은행 임포트"],
  ])("renders admin route %s for an admin actor", async (path, title) => {
    renderRoute(path, { actor: "admin" });

    expect(await screen.findByRole("heading", { name: title })).toBeVisible();
    expect(screen.getByRole("heading", { name: "관리자 콘솔" })).toBeVisible();
  });

  it("preserves an approved destination while sending unauthenticated users to login", async () => {
    renderRoute("/app/history?period=recent#trend", { actor: "unauthenticated" });

    expect(
      await screen.findByRole("heading", { name: "Google 계정으로 로그인" }),
    ).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent(
      "/login?returnTo=%2Fapp%2Fhistory%3Fperiod%3Drecent%23trend",
    );
    expect(screen.getByRole("link", { name: "Google 로그인 계속하기" })).toHaveAttribute(
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
    expect(screen.getByTestId("location")).toHaveTextContent("/pending");
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
    renderRoute(
      "/auth/callback?returnTo=https%3A%2F%2Fevil.example%2Fapp",
      { actor: "approved" },
    );

    expect(
      await screen.findByRole("heading", {
        name: "클라우드 자격증 연습을 시작하세요.",
      }),
    ).toBeVisible();
    expect(screen.getByTestId("location")).toHaveTextContent("/app");
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
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Return to an approved route.",
    );
  });
});
