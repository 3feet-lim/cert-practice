import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  it("uses the mock API health contract to render validated workspace readiness", async () => {
    renderApp();

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "클라우드 자격증 연습을 시작하세요.",
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Mock health contract 연결 완료")).toBeVisible();
    expect(
      screen.getByText("workspace · bundle · schema validation (v1)"),
    ).toBeVisible();
  });

  it("shows a safe schema-validation failure and retries the same mock adapter", async () => {
    const user = userEvent.setup();
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

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The bootstrap health response failed schema validation.",
    );
    await user.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(await screen.findByRole("alert")).toBeVisible();
  });
});
