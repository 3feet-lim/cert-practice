import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { CertQuizCompositionRoot } from "./app/CertQuizCompositionRoot";
import { createMockCertQuizApi } from "./api/mock-adapter";
import { App } from "./App";

function renderApp(api = createMockCertQuizApi()) {
  return render(
    <MemoryRouter initialEntries={["/app"]}>
      <CertQuizCompositionRoot api={api}>
        <App />
      </CertQuizCompositionRoot>
    </MemoryRouter>,
  );
}

describe("App bootstrap", () => {
  it("renders the approved mock actor's catalog at the protected app route", async () => {
    renderApp();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "클라우드 자격증 연습을 시작하세요.",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Approved Learner")).toBeVisible();
    expect(await screen.findByRole("link", { name: "학습 모드 선택" })).toBeVisible();
  });

  it("does not make the catalog route depend on the optional mock health payload", async () => {
    renderApp(
      createMockCertQuizApi({
        healthPayload: {
          status: "ok",
          service: "cert-quiz-api",
          contractVersion: "v1",
          unexpected: "field",
        },
      }),
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "클라우드 자격증 연습을 시작하세요.",
      }),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
