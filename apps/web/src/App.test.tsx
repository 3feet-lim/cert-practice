import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CertForgeCompositionRoot } from "./app/CertForgeCompositionRoot";
import { createMockCertForgeApi } from "./api/mock-adapter";
import { App } from "./App";

function renderApp(api = createMockCertForgeApi()) {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <CertForgeCompositionRoot api={api}>
        <App />
      </CertForgeCompositionRoot>
    </MemoryRouter>,
  );
}

describe("App bootstrap", () => {
  it("renders the approved mock actor's catalog at the protected app route", async () => {
    renderApp();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "학습 홈",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Approved Learner")).toBeVisible();
    expect(await screen.findByRole("link", { name: "학습 모드 선택" })).toBeVisible();
  });

  it("does not make the catalog route depend on the optional mock health payload", async () => {
    renderApp(
      createMockCertForgeApi({
        healthPayload: {
          status: "ok",
          service: "cert-forge-api",
          contractVersion: "v1",
          unexpected: "field",
        },
      }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "학습 홈",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
