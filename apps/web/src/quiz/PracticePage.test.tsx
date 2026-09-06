import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  PracticeSessionDto,
  PracticeStateResponse,
  SubmitPracticeQuestionResponse,
} from "@cert-quiz/contracts";
import { createMockCertQuizApi } from "../api/mock-adapter";
import type { CertQuizApi, CertQuizApiResult } from "../api/port";
import { CertQuizCompositionRoot } from "../app/CertQuizCompositionRoot";
import { createCertQuizFixtures } from "../mocks/fixtures";
import { PracticePage } from "./PracticePage";

afterEach(cleanup);

async function currentPractice(api: CertQuizApi) {
  const active = await api.listActivePracticeSessions();
  if (!active.ok) throw new Error("Expected active mock practice.");
  const sessionId = active.data.sessions[0]?.practiceSessionId;
  if (!sessionId) throw new Error("Expected a mock practice session.");
  const session = await api.resumePractice({ practiceSessionId: sessionId });
  if (!session.ok) throw new Error("Expected resumable mock practice.");
  const question = session.data.questions[session.data.currentIndex];
  if (!question) throw new Error("Expected a current mock practice question.");
  return { sessionId, question };
}

function renderPractice(api: CertQuizApi, sessionId: string) {
  return render(
    <MemoryRouter initialEntries={[`/app/practice/${sessionId}`]}>
      <CertQuizCompositionRoot api={api}>
        <Routes>
          <Route path="/app/practice/:sessionId" element={<PracticePage />} />
          <Route path="/app/practice-results/:id" element={<h1>연습 결과로 이동</h1>} />
        </Routes>
      </CertQuizCompositionRoot>
    </MemoryRouter>,
  );
}

async function selectRequiredChoices(requiredChoiceCount: number) {
  const role = requiredChoiceCount === 1 ? "radio" : "checkbox";
  const choices = await screen.findAllByRole(role);
  for (const choice of choices.slice(0, requiredChoiceCount)) {
    await userEvent.setup().click(choice);
  }
  return choices
    .slice(0, requiredChoiceCount)
    .map((choice) => choice.getAttribute("value"));
}

function practiceApi(
  session: PracticeSessionDto,
  overrides: Partial<CertQuizApi> = {},
): CertQuizApi {
  const mockApi = createMockCertQuizApi();
  return {
    ...mockApi,
    resumePractice: async () => ({ ok: true, data: structuredClone(session) }),
    patchPracticeState: async (input) => ({
      ok: true,
      data: {
        practiceSessionId: input.practiceSessionId,
        stateVersion: session.stateVersion + 1,
        currentIndex: input.currentIndex ?? session.currentIndex,
      } satisfies PracticeStateResponse,
    }),
    ...overrides,
  };
}

function sessionWithQuestionCount(requiredChoiceCount: number): PracticeSessionDto {
  const fixtures = createCertQuizFixtures();
  const question = fixtures.practice.active.questions.find(
    (candidate) => candidate.requiredChoiceCount === requiredChoiceCount,
  );
  if (!question) throw new Error(`Expected a ${requiredChoiceCount}-choice fixture.`);
  return {
    ...structuredClone(fixtures.practice.active),
    currentIndex: 0,
    questions: [{ ...question, selectedChoiceIds: [] }],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("PracticePage", () => {
  it("persists a draft through the typed mock port and reveals feedback only after submit", async () => {
    const api = createMockCertQuizApi();
    const { sessionId, question } = await currentPractice(api);
    renderPractice(api, sessionId);

    expect(await screen.findByText(question.stem.en)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "제출 결과" }),
    ).not.toBeInTheDocument();

    const selectedChoiceIds = await selectRequiredChoices(question.requiredChoiceCount);
    await waitFor(async () => {
      const resumed = await api.resumePractice({ practiceSessionId: sessionId });
      expect(resumed).toMatchObject({
        ok: true,
        data: {
          questions: expect.arrayContaining([
            expect.objectContaining({ id: question.id, selectedChoiceIds }),
          ]),
        },
      });
    });

    await userEvent.setup().click(screen.getByRole("button", { name: "답변 제출" }));
    expect(await screen.findByRole("heading", { name: "제출 결과" })).toBeVisible();
  });

  it("navigates to S6 when the canonical submit response completes practice", async () => {
    const mockApi = createMockCertQuizApi();
    const completedPracticeResultId = createCertQuizFixtures().ids.practiceResultId;
    const submitPracticeQuestion = vi.fn(
      async (input: Parameters<CertQuizApi["submitPracticeQuestion"]>[0]) => {
        const response = await mockApi.submitPracticeQuestion(input);
        return response.ok
          ? {
              ...response,
              data: { ...response.data, completedPracticeResultId },
            }
          : response;
      },
    );
    const api: CertQuizApi = {
      ...mockApi,
      submitPracticeQuestion,
    };
    const { sessionId, question } = await currentPractice(api);
    renderPractice(api, sessionId);

    await selectRequiredChoices(question.requiredChoiceCount);
    await userEvent.setup().click(screen.getByRole("button", { name: "답변 제출" }));

    await waitFor(() => expect(submitPracticeQuestion).toHaveBeenCalledOnce());
    const response = await submitPracticeQuestion.mock.results[0]?.value;
    expect(response).toMatchObject({
      ok: true,
      data: { completedPracticeResultId },
    });
    expect(
      await screen.findByRole("heading", { name: "연습 결과로 이동" }),
    ).toBeVisible();
  });

  it.each([
    { requiredChoiceCount: 1, role: "radio" as const },
    { requiredChoiceCount: 2, role: "checkbox" as const },
  ])(
    "uses accessible $role controls for $requiredChoiceCount-choice practice questions",
    async ({ requiredChoiceCount, role }) => {
      const session = sessionWithQuestionCount(requiredChoiceCount);
      const question = session.questions[0];
      if (!question) throw new Error("Expected a practice question.");
      renderPractice(practiceApi(session), session.practiceSessionId);

      const choices = await screen.findAllByRole(role);
      expect(choices).toHaveLength(question.choices.length);
      expect(choices[0]).toHaveAccessibleName(question.choices[0]?.text.en ?? "");
      expect(choices[0]).toHaveAttribute("name", `question-${question.id}`);
      if (role === "checkbox") {
        expect(
          screen.getByRole("group", { name: "답변 선택" }),
        ).toHaveAccessibleDescription(
          `정확히 ${requiredChoiceCount}개를 선택하세요. (0/${requiredChoiceCount} 선택)`,
        );
      }

      await userEvent.setup().click(choices[0]!);
      expect(choices[0]).toBeChecked();
    },
  );

  it("renders submitted explanations through SafeMarkdown, including XSS, unsafe URLs, and failed images", async () => {
    const fixtures = createCertQuizFixtures();
    const session = structuredClone(fixtures.practice.submitted);
    session.currentIndex = 0;
    const question = session.questions[0];
    if (!question || question.kind !== "practice-submitted") {
      throw new Error("Expected a submitted practice question fixture.");
    }
    question.explanation = {
      en: '<script>alert("xss")</script>\n\n[unsafe](javascript:evil)\n\n![blocked](data:image/png;base64,abc)\n\n![diagram](https://images.example.test/diagram.png)',
      ko: null,
    };
    renderPractice(practiceApi(session), session.practiceSessionId);

    expect(await screen.findByRole("heading", { name: "제출 결과" })).toBeVisible();
    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByText(/<script>alert\("xss"\)<\/script>/)).toBeVisible();
    expect(screen.getByText("unsafe")).not.toHaveAttribute("href");
    expect(screen.getByRole("img", { name: "blocked" })).toHaveTextContent(
      "안전하지 않은 이미지 주소가 차단되었습니다.",
    );

    fireEvent.error(screen.getByRole("img", { name: "diagram" }));
    expect(screen.getByRole("img", { name: "diagram 로드 실패" })).toHaveTextContent(
      "이미지를 불러오지 못했습니다.",
    );
  });

  it("rolls an optimistic flag change back and displays the stale-version error", async () => {
    const session = sessionWithQuestionCount(1);
    const response = deferred<CertQuizApiResult<PracticeStateResponse>>();
    const patchPracticeState = vi.fn(() => response.promise);
    const api = practiceApi(session, { patchPracticeState });
    renderPractice(api, session.practiceSessionId);

    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Flag 없음" }));
    expect(screen.getByRole("button", { name: "Flag" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(patchPracticeState).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: session.stateVersion }),
    );

    response.resolve({
      ok: false,
      error: {
        code: "stale-version",
        message: "Refresh the latest practice state and try again.",
        requestId: "practice-page:stale-version",
        retryable: false,
        nextAction: "Refresh and retry.",
      },
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Refresh the latest practice state and try again.",
    );
    expect(screen.getByRole("button", { name: "Flag 없음" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("locks duplicate submit clicks until the canonical response returns", async () => {
    const session = sessionWithQuestionCount(1);
    const activeQuestion = session.questions[0];
    const submittedFixture = createCertQuizFixtures().practice.submitted.questions[0];
    if (!activeQuestion || submittedFixture?.kind !== "practice-submitted") {
      throw new Error("Expected active and submitted practice question fixtures.");
    }
    const selectedChoiceIds = [activeQuestion.choices[0]?.id ?? ""];
    session.questions[0] = { ...activeQuestion, selectedChoiceIds };
    const response = deferred<CertQuizApiResult<SubmitPracticeQuestionResponse>>();
    const submitPracticeQuestion = vi.fn(() => response.promise);
    const api = practiceApi(session, { submitPracticeQuestion });
    renderPractice(api, session.practiceSessionId);

    const submit = await screen.findByRole("button", { name: "답변 제출" });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(submitPracticeQuestion).toHaveBeenCalledOnce());
    expect(submit).toBeDisabled();

    response.resolve({
      ok: true,
      data: {
        practiceSessionId: session.practiceSessionId,
        stateVersion: session.stateVersion + 1,
        question: {
          ...submittedFixture,
          id: activeQuestion.id,
          selectedChoiceIds,
        },
      },
    });
    expect(await screen.findByRole("heading", { name: "제출 결과" })).toBeVisible();
  });
});
