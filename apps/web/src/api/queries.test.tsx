import type { UpdateScoreVisibilityResponse } from "@cert-forge/contracts";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CertForgeCompositionRoot } from "../app/CertForgeCompositionRoot";
import { createCertForgeQueryClient } from "../app/query-client";
import { createMockCertForgeApi } from "./mock-adapter";
import type { CertForgeApiResult } from "./port";
import { useCurrentUserQuery, useScoreVisibilityMutation } from "./queries";

afterEach(cleanup);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function VisibilityProbe() {
  const currentUser = useCurrentUserQuery();
  const visibility = useScoreVisibilityMutation();
  if (!currentUser.data) return <p>loading</p>;

  return (
    <>
      <p>{currentUser.data.scorePublic ? "public" : "private"}</p>
      <button type="button" onClick={() => visibility.mutate({ scorePublic: false })}>
        make-private
      </button>
    </>
  );
}

describe("useScoreVisibilityMutation", () => {
  it("rolls the current-user cache back when the visibility save is rejected", async () => {
    const response = deferred<CertForgeApiResult<UpdateScoreVisibilityResponse>>();
    const mockApi = createMockCertForgeApi();
    const updateScoreVisibility = vi.fn(() => response.promise);
    const api = { ...mockApi, updateScoreVisibility };
    const queryClient: QueryClient = createCertForgeQueryClient();
    const user = userEvent.setup();

    render(
      <CertForgeCompositionRoot api={api} queryClient={queryClient}>
        <VisibilityProbe />
      </CertForgeCompositionRoot>,
    );

    expect(await screen.findByText("public")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "make-private" }));
    await waitFor(() => expect(screen.getByText("private")).toBeVisible());
    response.resolve({
      ok: false,
      error: {
        code: "stale-version",
        message: "Version changed.",
        requestId: "test:stale-version",
        retryable: false,
        nextAction: "Refresh and try again.",
      },
    });
    await waitFor(() => expect(screen.getByText("public")).toBeVisible());
    expect(updateScoreVisibility).toHaveBeenCalledWith({
      scorePublic: false,
      expectedVersion: 3,
    });
  });
});
