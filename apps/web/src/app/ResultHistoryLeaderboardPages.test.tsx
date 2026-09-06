import type { UpdateScoreVisibilityResponse } from "@cert-quiz/contracts";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockCertQuizApi } from "../api/mock-adapter";
import type { CertQuizApi, CertQuizApiResult } from "../api/port";
import { CertQuizCompositionRoot } from "./CertQuizCompositionRoot";
import {
  AttemptResultPage,
  HistoryPage,
  LeaderboardPage,
  PracticeResultPage,
} from "./ResultHistoryLeaderboardPages";
import { createCertQuizFixtures } from "../mocks/fixtures";

const fixtures = createCertQuizFixtures();

/** These tests exercise runtime route presenters against the deterministic mock port only. */
afterEach(cleanup);

function renderPage(path: string, api: CertQuizApi, element: ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CertQuizCompositionRoot api={api}>
        <Routes>
          <Route path="*" element={element} />
        </Routes>
      </CertQuizCompositionRoot>
    </MemoryRouter>,
  );
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("result, history, and leaderboard runtime pages", () => {
  it("formats exact result values only for display and presents the immutable review snapshot", async () => {
    const mockApi = createMockCertQuizApi();
    const api: CertQuizApi = {
      ...mockApi,
      getAttempt: async () => ({
        ok: true,
        data: fixtures.exam.immutableResult,
        meta: { requestId: "test:immutable-attempt" },
      }),
    };

    expect(Object.isFrozen(fixtures.exam.immutableResult)).toBe(true);
    renderPage(`/app/attempts/${fixtures.ids.attemptId}`, api, <AttemptResultPage />);

    expect(await screen.findByRole("heading", { name: "모의고사 결과" })).toBeVisible();
    expect(screen.getByRole("region", { name: "점수 요약" })).toHaveTextContent(
      "60.00/ 75",
    );
    expect(screen.getByRole("region", { name: "점수 요약" })).toHaveTextContent(
      "80.00%",
    );
    expect(screen.getByRole("heading", { name: "불변 응시 검토" })).toBeVisible();
    expect(screen.getByRole("table", { name: "문항 검토" })).toBeVisible();
    expect(
      screen.getByText("이 응시 당시의 문항 순서, 응답과 채점 결과를 표시합니다."),
    ).toBeVisible();
  });

  it("renders the canonical expired practice-result state", async () => {
    const mockApi = createMockCertQuizApi();
    const api: CertQuizApi = {
      ...mockApi,
      getPracticeResult: async () => ({
        ok: false,
        error: {
          code: "practice-result-expired",
          message: "Practice result is no longer available.",
          requestId: "test:practice-result-expired",
          retryable: false,
          nextAction: "Start a new practice session.",
        },
      }),
    };

    renderPage(
      `/app/practice-results/${fixtures.ids.practiceResultId}`,
      api,
      <PracticeResultPage />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Practice result is no longer available.",
    );
  });

  it("shows no history count or trend when the mock returns zero exam attempts", async () => {
    const mockApi = createMockCertQuizApi();
    const getHistory = vi.fn(async () => ({
      ok: true as const,
      data: fixtures.history.empty,
      meta: { requestId: "test:history:empty" },
    }));
    const api: CertQuizApi = {
      ...mockApi,
      getHistory,
      getHistoryTrends: async () => ({
        ok: true,
        data: fixtures.history.emptyTrends,
        meta: { requestId: "test:history:empty-trends" },
      }),
    };

    renderPage("/app/history", api, <HistoryPage />);

    expect(await screen.findByText("모의고사 응시 이력이 없습니다")).toBeVisible();
    expect(fixtures.history.empty.attempts).toHaveLength(0);
    expect(getHistory).toHaveBeenCalledWith({});
    expect(
      screen.queryByRole("table", { name: "모의고사 응시 이력" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: /정답률 추이/ })).not.toBeInTheDocument();
  });

  it("rolls visibility back and announces the rejected canonical save", async () => {
    const response = deferred<CertQuizApiResult<UpdateScoreVisibilityResponse>>();
    const mockApi = createMockCertQuizApi();
    const updateScoreVisibility = vi.fn(() => response.promise);
    const api: CertQuizApi = { ...mockApi, updateScoreVisibility };
    const user = userEvent.setup();

    renderPage(
      `/app/leaderboards/${fixtures.ids.certificationId}`,
      api,
      <LeaderboardPage />,
    );

    const checkbox = await screen.findByRole("checkbox", { name: "점수 공개" });
    expect(checkbox).toBeChecked();
    await user.click(checkbox);
    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("비공개 상태")).toBeVisible();

    response.resolve({
      ok: false,
      error: {
        code: "stale-version",
        message: "Visibility version changed.",
        requestId: "test:visibility:stale",
        retryable: false,
        nextAction: "Refresh and try again.",
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Visibility version changed.",
    );
    await waitFor(() => expect(checkbox).toBeChecked());
    expect(screen.queryByText("비공개 상태")).not.toBeInTheDocument();
    expect(updateScoreVisibility).toHaveBeenCalledWith({
      scorePublic: false,
      expectedVersion: 3,
    });
  });

  it("keeps server tie ranks, marks the current user, and removes only that user when private", async () => {
    const api = createMockCertQuizApi();
    const user = userEvent.setup();

    renderPage(
      `/app/leaderboards/${fixtures.ids.certificationId}`,
      api,
      <LeaderboardPage />,
    );

    const table = await screen.findByRole("table", { name: "공개 최고 성과 리더보드" });
    expect(within(table).getAllByText("2위")).toHaveLength(2);
    expect(within(table).getByText("4위")).toBeVisible();
    expect(within(table).getByText("나")).toBeVisible();
    expect(within(table).getByText("Approved Learner")).toBeVisible();

    await user.click(screen.getByRole("checkbox", { name: "점수 공개" }));

    expect(await screen.findByText("비공개 상태")).toBeVisible();
    await waitFor(() =>
      expect(within(table).queryByText("Approved Learner")).not.toBeInTheDocument(),
    );
    expect(within(table).queryByText("나")).not.toBeInTheDocument();
    expect(within(table).getAllByText("2위")).toHaveLength(1);
    expect(within(table).getByText("4위")).toBeVisible();
    expect(within(table).getByText("Tie Breaker")).toBeVisible();
  });
});
