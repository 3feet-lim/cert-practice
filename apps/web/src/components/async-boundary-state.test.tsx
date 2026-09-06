import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CertQuizRequestError } from "../api/query-result";
import { AsyncBoundary } from "./AsyncBoundary";
import {
  toMutationAsyncBoundaryState,
  toQueryAsyncBoundaryState,
} from "./async-boundary-state";

afterEach(cleanup);

const nextAction = { label: "학습 홈으로 이동", onAction: vi.fn() };

function boundaryOptions() {
  return {
    nextAction,
    retry: { onRetry: vi.fn() },
    isEmpty: (items: string[]) => items.length === 0,
    empty: {
      title: "결과가 없습니다.",
      message: "조건을 바꿔 다시 확인해 주세요.",
    },
  };
}

describe("async request state adapters", () => {
  it("maps independent query loading, empty, and success states", () => {
    const refetch = vi.fn();
    const options = {
      loadingLabel: "카탈로그를 불러오는 중",
      nextAction,
      isEmpty: (items: string[]) => items.length === 0,
      empty: {
        title: "카탈로그가 비어 있습니다.",
        message: "나중에 다시 확인해 주세요.",
      },
    };

    expect(
      toQueryAsyncBoundaryState(
        { isPending: true, isError: false, data: undefined, error: null, refetch },
        options,
      ),
    ).toEqual({ status: "loading", label: "카탈로그를 불러오는 중" });

    expect(
      toQueryAsyncBoundaryState(
        { isPending: false, isError: false, data: [], error: null, refetch },
        options,
      ),
    ).toMatchObject({ status: "empty", title: "카탈로그가 비어 있습니다." });

    expect(
      toQueryAsyncBoundaryState(
        { isPending: false, isError: false, data: ["AWS"], error: null, refetch },
        options,
      ),
    ).toEqual({ status: "success", data: ["AWS"] });
  });

  it("retries a retryable query error through refetch without exposing its next action", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    const state = toQueryAsyncBoundaryState(
      {
        isPending: false,
        isError: true,
        data: undefined,
        error: new CertQuizRequestError({
          code: "dependency-unavailable",
          message: "잠시 후 다시 시도해 주세요.",
          requestId: "async-boundary-test:retry",
          retryable: true,
          nextAction: "설정 화면을 확인하세요.",
        }),
        refetch,
      },
      {
        nextAction,
      },
    );

    render(<AsyncBoundary state={state}>{() => null}</AsyncBoundary>);

    expect(
      screen.queryByRole("button", { name: "설정 화면을 확인하세요." }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(refetch).toHaveBeenCalledOnce();
  });

  it("keeps draft input mounted and presents a non-retryable mutation next action", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const onNextAction = vi.fn();
    const state = toMutationAsyncBoundaryState(
      {
        isPending: false,
        isError: true,
        data: undefined,
        error: new CertQuizRequestError({
          code: "answer-locked",
          message: "이미 제출된 답안입니다.",
          requestId: "async-boundary-test:next-action",
          retryable: false,
          nextAction: "결과를 확인하세요.",
        }),
      },
      {
        ...boundaryOptions(),
        retry: { onRetry: retry },
        nextAction: { label: "학습 홈으로 이동", onAction: onNextAction },
      },
    );

    const { rerender } = render(
      <AsyncBoundary
        state={{ status: "loading" }}
        persistentContent={<input aria-label="답안" defaultValue="draft" />}
      >
        {(data: string[]) => <p>{data.join(",")}</p>}
      </AsyncBoundary>,
    );
    const input = screen.getByRole("textbox", { name: "답안" });
    await user.clear(input);
    await user.type(input, "보존할 답안");

    rerender(
      <AsyncBoundary
        state={state}
        persistentContent={<input aria-label="답안" defaultValue="draft" />}
      >
        {(data: string[]) => <p>{data.join(",")}</p>}
      </AsyncBoundary>,
    );

    expect(screen.getByRole("textbox", { name: "답안" })).toHaveValue("보존할 답안");
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "결과를 확인하세요." }));
    expect(onNextAction).toHaveBeenCalledOnce();
    expect(retry).not.toHaveBeenCalled();
  });
});
