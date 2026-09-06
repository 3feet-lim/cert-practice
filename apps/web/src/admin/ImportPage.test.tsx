import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { createMockCertQuizApi } from "../api/mock-adapter";
import type { CertQuizApi } from "../api/port";
import { CertQuizCompositionRoot } from "../app/CertQuizCompositionRoot";
import { ImportPage } from "./ImportPage";

const validContent = '{"provider":{"id":"aws"}}';

afterEach(cleanup);

function importFile(name: string, content = validContent): File {
  return new File([content], name, { type: "application/json" });
}

function renderImportPage(
  api: CertQuizApi = createMockCertQuizApi({ authActor: "admin" }),
) {
  return render(
    <CertQuizCompositionRoot api={api}>
      <ImportPage />
    </CertQuizCompositionRoot>,
  );
}

async function selectAndValidate(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.upload(screen.getByLabelText("JSON 문제 은행 파일 선택"), file);
  await screen.findByText(file.name);
  await user.click(screen.getByRole("button", { name: "Dry-run 검증" }));
  await screen.findAllByText("검증 통과");
}

describe("ImportPage", () => {
  it("keeps a successful validation token in page memory until a confirmed commit", async () => {
    const user = userEvent.setup();
    renderImportPage();

    await selectAndValidate(user, importFile("catalog.json"));
    expect(screen.queryByText("mock-commit-token")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "임포트 확정" }));
    expect(await screen.findByRole("dialog")).toHaveTextContent("catalog.json");
    await user.click(screen.getByRole("button", { name: "교체 확정" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "문제 은행을 교체했습니다",
    );
    expect(
      screen.queryByRole("button", { name: "임포트 확정" }),
    ).not.toBeInTheDocument();
  });

  it("discards commit credentials when selected content changes and requires another dry run", async () => {
    const user = userEvent.setup();
    renderImportPage();

    await selectAndValidate(user, importFile("catalog.json"));
    expect(screen.getByRole("button", { name: "임포트 확정" })).toBeEnabled();

    await user.upload(
      screen.getByLabelText("JSON 문제 은행 파일 선택"),
      importFile("catalog-updated.json", '{"provider":{"id":"updated"}}'),
    );

    await screen.findByText("catalog-updated.json");
    expect(
      screen.queryByRole("button", { name: "임포트 확정" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Dry-run 검증" })).toBeEnabled();
  });

  it("surfaces a safe replay error and requires revalidation while preserving the selected file", async () => {
    const user = userEvent.setup();
    const mockApi = createMockCertQuizApi({ authActor: "admin" });
    const api: CertQuizApi = {
      ...mockApi,
      commitImport: async () => ({
        ok: false,
        error: {
          code: "token-used",
          message: "This validation token has already been used.",
          requestId: "import-page:token-used",
          retryable: false,
          nextAction: "Validate the selected file again before committing.",
        },
      }),
    };
    renderImportPage(api);

    await selectAndValidate(user, importFile("replay.json"));
    await user.click(screen.getByRole("button", { name: "임포트 확정" }));
    await user.click(await screen.findByRole("button", { name: "교체 확정" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This validation token has already been used.",
    );
    expect(screen.getByText("선택한 파일을 다시 검증한 후 확정하세요.")).toBeVisible();
    expect(screen.getByText("replay.json")).toBeVisible();
    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: "임포트 확정" }),
      ).not.toBeInTheDocument();
    });
  });
});
