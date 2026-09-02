import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("App", () => {
  it("renders the accessible workspace welcome screen", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "클라우드 자격증 연습을 시작하세요.",
      }),
    ).toBeInTheDocument();
  });
});
