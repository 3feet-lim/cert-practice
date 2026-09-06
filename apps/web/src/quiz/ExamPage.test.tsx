import type { ExamStateResponse, SubmitExamResponse } from "@cert-quiz/contracts";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMockCertQuizApi } from "../api/mock-adapter";
import type { CertQuizApi, CertQuizApiResult } from "../api/port";
import { CertQuizCompositionRoot } from "../app/CertQuizCompositionRoot";
import { createCertQuizMockStateMachine, MOCK_IDS } from "../mocks/state-machine";
import { ExamPage } from "./ExamPage";
/**
 * These deterministic component tests cover the client/mock contract only. They do not
 * prove a real server clock, durable persistence, or concurrent finalization behavior.
 */
afterEach(cleanup);
function renderExam(api: CertQuizApi = createMockCertQuizApi()) {
  return render(
    <MemoryRouter initialEntries={[`/app/exams/${MOCK_IDS.exam}`]}>
      <CertQuizCompositionRoot api={api}>
        <Routes>
          <Route path="/app/exams/:sessionId" element={<ExamPage />} />
          <Route path="/app/attempts/:id" element={<h1>모의고사 결과</h1>} />
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
describe("ExamPage", () => {
  it("restores server state and presents authoritative preview counts before submitting", async () => {
    const mockApi = createMockCertQuizApi();
    const getExamSubmissionPreview = vi.fn(mockApi.getExamSubmissionPreview);
    const api: CertQuizApi = { ...mockApi, getExamSubmissionPreview };
    renderExam(api);
    const [answer] = await screen.findAllByRole("radio");
    if (!answer) throw new Error("Expected an exam answer choice.");
    await userEvent.setup().click(answer);
    await waitFor(async () => {
      const current = await api.getExam({ examSessionId: MOCK_IDS.exam });
      if (!current.ok || current.data.kind !== "exam-active-session") {
        throw new Error("Expected an active persisted exam.");
      }
      expect(current.data.questions[0]?.selectedChoiceIds).toEqual([
        answer.getAttribute("value"),
      ]);
    });
    await userEvent.setup().click(screen.getByRole("button", { name: "Flag 없음" }));
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "제출 미리보기" }));
    await waitFor(() =>
      expect(getExamSubmissionPreview).toHaveBeenCalledWith({
        examSessionId: MOCK_IDS.exam,
      }),
    );
    expect(await screen.findByText("미응답")).toBeVisible();
    expect(screen.getByText("1", { selector: "dd" })).toBeVisible();
    expect(screen.getByText("2", { selector: "dd" })).toBeVisible();
    await userEvent.setup().click(screen.getByRole("button", { name: "제출 확정" }));
    expect(await screen.findByRole("heading", { name: "모의고사 결과" })).toBeVisible();
  });
  it("never serializes or renders answers and explanations while an exam is active", async () => {
    const api = createMockCertQuizApi();
    const { container } = renderExam(api);
    const active = await api.getExam({ examSessionId: MOCK_IDS.exam });
    if (!active.ok || active.data.kind !== "exam-active-session") {
      throw new Error("Expected an active exam response.");
    }
    const serializedActiveProps = JSON.stringify(active.data);
    for (const privateField of [
      "correctChoiceIds",
      "isCorrect",
      "earnedScore",
      "explanation",
    ]) {
      expect(serializedActiveProps).not.toContain(privateField);
    }
    await screen.findAllByRole("radio");
    for (const privateField of [
      "correctChoiceIds",
      "isCorrect",
      "earnedScore",
      "explanation",
    ]) {
      expect(container.innerHTML).not.toContain(privateField);
    }
    expect(
      screen.queryByRole("heading", { name: "제출 결과" }),
    ).not.toBeInTheDocument();
  });
  it("rolls an optimistic exam flag change back and displays a stale-version error", async () => {
    const response = deferred<CertQuizApiResult<ExamStateResponse>>();
    const mockApi = createMockCertQuizApi();
    const patchExamState = vi.fn(() => response.promise);
    const api: CertQuizApi = { ...mockApi, patchExamState };
    renderExam(api);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Flag 없음" }));
    expect(screen.getByText("Flag")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "1번 문항, 현재 문항, 플래그됨" }),
    ).toBeVisible();
    expect(patchExamState).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 0 }),
    );
    response.resolve({
      ok: false,
      error: {
        code: "stale-version",
        message: "Refresh the latest exam state and try again.",
        requestId: "exam-page:stale-version",
        retryable: false,
        nextAction: "Refresh and retry.",
      },
    });
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Refresh the latest exam state and try again.",
    );
    expect(screen.getByRole("button", { name: "Flag 없음" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
  it("locks duplicate exam submission clicks until the canonical result returns", async () => {
    const response = deferred<CertQuizApiResult<SubmitExamResponse>>();
    const mockApi = createMockCertQuizApi();
    const submitExam = vi.fn(() => response.promise);
    const api: CertQuizApi = { ...mockApi, submitExam };
    const resultState = createCertQuizMockStateMachine();
    renderExam(api);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "제출 미리보기" }));
    const submit = await screen.findByRole("button", { name: "제출 확정" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(submitExam).toHaveBeenCalledOnce());
    expect(submit).toBeDisabled();
    expect(screen.getByRole("button", { name: "제출 중..." })).toBeDisabled();
    response.resolve({
      ok: true,
      data: resultState.submitExam(MOCK_IDS.exam, MOCK_IDS.user),
    });
    expect(await screen.findByRole("heading", { name: "모의고사 결과" })).toBeVisible();
  });
  it("finalizes after the restored server timer expires and locks interaction while pending", async () => {
    const state = createCertQuizMockStateMachine({ now: "2026-03-23T15:00:00.000Z" });
    const response = deferred<CertQuizApiResult<SubmitExamResponse>>();
    const mockApi = createMockCertQuizApi({ examState: state });
    const submitExam = vi.fn(() => response.promise);
    const api: CertQuizApi = { ...mockApi, submitExam };
    renderExam(api);
    expect(
      await screen.findByText(
        "시간이 만료되었습니다. 서버에서 결과를 확정하는 중입니다.",
      ),
    ).toBeVisible();
    await waitFor(() => expect(submitExam).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "제출 미리보기" })).toBeDisabled();
    response.resolve({
      ok: true,
      data: state.submitExam(MOCK_IDS.exam, MOCK_IDS.user),
    });
    expect(await screen.findByRole("heading", { name: "모의고사 결과" })).toBeVisible();
    expect(state.snapshot().exam.attemptCount).toBe(1);
  });
  it("redirects a restored finalized session to its server-owned attempt", async () => {
    const state = createCertQuizMockStateMachine();
    state.submitExam(MOCK_IDS.exam, MOCK_IDS.user);
    renderExam(createMockCertQuizApi({ examState: state }));
    expect(await screen.findByRole("heading", { name: "모의고사 결과" })).toBeVisible();
  });
});
