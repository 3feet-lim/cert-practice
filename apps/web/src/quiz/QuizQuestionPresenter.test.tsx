import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { createCertQuizFixtures } from "../mocks/fixtures";
import { QuizStoreProvider } from "./quiz-store-provider";
import { createQuizStore } from "./quiz-store";
import { QuizQuestionPresenter } from "./QuizQuestionPresenter";

describe("QuizQuestionPresenter", () => {
  it("keeps capped draft selections, language, flags, and reveal state while navigating", async () => {
    const fixtures = createCertQuizFixtures();
    const submitted = fixtures.practice.submitted.questions[0];
    const multiChoice = fixtures.practice.active.questions.find(
      (question) => question.requiredChoiceCount === 2 && question.id !== submitted?.id,
    );
    const englishOnly = fixtures.practice.active.questions.find(
      (question) =>
        question.translationStatus === "en_only" && question.id !== submitted?.id,
    );
    if (!submitted || !multiChoice || !englishOnly) {
      throw new Error(
        "Expected deterministic questions for quiz interaction coverage.",
      );
    }

    const store = createQuizStore();
    const onFlagChange = vi.fn();
    const user = userEvent.setup();
    render(
      <QuizStoreProvider store={store}>
        <QuizQuestionPresenter
          initialIndex={0}
          onFlagChange={onFlagChange}
          questions={[multiChoice, englishOnly, submitted]}
          sessionTarget={`practice:${fixtures.ids.practiceSessionId}`}
        />
      </QuizStoreProvider>,
    );

    const choices = screen.getAllByRole("checkbox");
    await user.click(choices[0]!);
    await user.click(choices[1]!);
    await user.click(choices[2]!);
    expect(choices[0]).toBeChecked();
    expect(choices[1]).toBeChecked();
    expect(choices[2]).not.toBeChecked();
    expect(screen.getByText(/\(2\/2 선택\)/)).toBeVisible();

    await user.click(screen.getByRole("button", { name: "한국어" }));
    await user.click(screen.getByRole("button", { name: /Flag/ }));
    expect(onFlagChange).toHaveBeenCalledWith(multiChoice.id, !multiChoice.flagged);

    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`^${englishOnly.displayNumber}번 문항`),
      }),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "한국어 번역이 없어 영어로 표시합니다.",
    );
    expect(screen.getByText(englishOnly.stem.en)).toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`^${multiChoice.displayNumber}번 문항`),
      }),
    );
    expect(screen.getAllByRole("checkbox")[0]).toBeChecked();
    expect(screen.getAllByRole("checkbox")[1]).toBeChecked();
    expect(screen.getByRole("button", { name: "한국어" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await user.click(
      screen.getByRole("button", {
        name: new RegExp(`^${submitted.displayNumber}번 문항`),
      }),
    );
    expect(screen.getByRole("heading", { name: "제출 결과" })).toBeVisible();
  });
});
