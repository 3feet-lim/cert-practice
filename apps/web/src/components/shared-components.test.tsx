import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { AccessibleChart } from "./AccessibleChart";
import { AccessibleDialog } from "./AccessibleDialog";
import { AppShell } from "./AppShell";
import { AsyncBoundary, type AsyncState } from "./AsyncBoundary";
import { ChoiceField } from "./ChoiceField";
import { QuestionPresenter } from "../quiz/QuestionPresenter";
import { isSafeUrl } from "../lib/safe-url";
import { SafeMarkdown } from "./SafeMarkdown";
import {
  CertificationCard,
  DataTable,
  DomainBreakdown,
  FileSummary,
  QuestionNavigator,
  ScoreSummary,
  StatusBanner,
  TimerFace,
  ValidationErrorList,
} from "./StaticPresentation";
import { Button } from "./ui/Button";

describe("AsyncBoundary", () => {
  it("keeps editable input mounted and separates retry from next-action errors", async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    const nextAction = vi.fn();
    const initialState: AsyncState<string> = { status: "loading", label: "이력 로딩 중" };
    const { rerender } = render(
      <AsyncBoundary<string> state={initialState} persistentContent={<input aria-label="검색어" defaultValue="draft" />}>
        {(value) => <p>{value}</p>}
      </AsyncBoundary>,
    );

    const input = screen.getByRole("textbox", { name: "검색어" });
    await user.clear(input);
    await user.type(input, "보존할 입력");
    expect(screen.getByRole("status")).toHaveTextContent("이력 로딩 중");

    rerender(
      <AsyncBoundary<string>
        state={{
          status: "error",
          message: "잠시 후 다시 시도해 주세요.",
          retryable: true,
          retry: { onRetry: retry },
        }}
        persistentContent={<input aria-label="검색어" defaultValue="draft" />}
      >
        {(value) => <p>{value}</p>}
      </AsyncBoundary>,
    );

    expect(screen.getByRole("textbox", { name: "검색어" })).toHaveValue("보존할 입력");
    expect(screen.queryByRole("button", { name: "설정으로 이동" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(retry).toHaveBeenCalledOnce();

    rerender(
      <AsyncBoundary<string>
        state={{
          status: "error",
          message: "점수 공개 설정이 필요합니다.",
          retryable: false,
          nextAction: { label: "설정으로 이동", onAction: nextAction },
        }}
      >
        {(value) => <p>{value}</p>}
      </AsyncBoundary>,
    );
    expect(screen.queryByRole("button", { name: "다시 시도" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "설정으로 이동" }));
    expect(nextAction).toHaveBeenCalledOnce();
  });

  it("renders a data-specific empty state and successful content", async () => {
    const user = userEvent.setup();
    const action = vi.fn();
    const { rerender } = render(
      <AsyncBoundary<string>
        state={{
          status: "empty",
          title: "응시 이력이 없습니다.",
          message: "모의고사를 완료하면 이곳에 표시됩니다.",
          action: { label: "모의고사 시작", onAction: action },
        }}
      >
        {(value: string) => <p>{value}</p>}
      </AsyncBoundary>,
    );

    await user.click(screen.getByRole("button", { name: "모의고사 시작" }));
    expect(action).toHaveBeenCalledOnce();

    rerender(
      <AsyncBoundary<string> state={{ status: "success", data: "완료됨" }}>
        {(value) => <p>{value}</p>}
      </AsyncBoundary>,
    );
    expect(screen.getByText("완료됨")).toBeVisible();
  });
});

describe("SafeMarkdown", () => {
  it("escapes raw HTML and renders unsafe links and images as inert text", () => {
    render(
      <SafeMarkdown
        content={'<script>alert("xss")</script>\n\n[위험 링크](javascript:evil)\n\n![위험 이미지](data:image/png;base64,abc)\n\n[안전 링크](/help)'}
      />,
    );

    expect(document.querySelector("script")).not.toBeInTheDocument();
    expect(screen.getByText(/<script>alert\("xss"\)<\/script>/)).toBeVisible();
    expect(screen.getByText("위험 링크")).not.toHaveAttribute("href");
    expect(screen.queryByRole("img", { name: "위험 이미지" })).toHaveTextContent(
      "안전하지 않은 이미지 주소가 차단되었습니다.",
    );
    expect(screen.getByRole("link", { name: "안전 링크" })).toHaveAttribute("href", "/help");
  });

  it("replaces a failed safe image while preserving surrounding Markdown", () => {
    render(
      <SafeMarkdown content={"설명 앞\n\n![아키텍처](https://images.example.test/chart.png)\n\n설명 뒤"} />,
    );

    fireEvent.error(screen.getByRole("img", { name: "아키텍처" }));
    expect(screen.getByRole("img", { name: "아키텍처 로드 실패" })).toHaveTextContent(
      "이미지를 불러오지 못했습니다.",
    );
    expect(screen.getByText("설명 앞")).toBeVisible();
    expect(screen.getByText("설명 뒤")).toBeVisible();
  });

  it("allows only same-origin relative or HTTPS URLs", () => {
    expect(isSafeUrl("/guide")).toBe(true);
    expect(isSafeUrl("../guide?q=1#part")).toBe(true);
    expect(isSafeUrl("https://example.com/guide")).toBe(true);
    expect(isSafeUrl("http://example.com")).toBe(false);
    expect(isSafeUrl("//example.com/guide")).toBe(false);
    expect(isSafeUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeUrl("data:text/html,hello")).toBe(false);
  });
});

describe("accessible UI primitives", () => {
  it("provides semantic shell navigation and a keyboard skip link", () => {
    render(
      <AppShell navigation={[{ href: "/app", label: "홈", current: true }]}>
        <h1>대시보드</h1>
      </AppShell>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "본문으로 건너뛰기" })).toHaveAttribute(
      "href",
      "#main-content",
    );
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { name: "대시보드" }));
  });

  it("associates radio and checkbox inputs with visible labels", async () => {
    const user = userEvent.setup();
    render(
      <fieldset>
        <legend>답변</legend>
        <ChoiceField type="radio" name="answer" value="a" label="단일 답변" />
        <ChoiceField type="checkbox" name="review" label="다시 검토" description="나중에 확인합니다." />
      </fieldset>,
    );

    await user.click(screen.getByText("단일 답변"));
    await user.click(screen.getByText("다시 검토"));
    expect(screen.getByRole("radio", { name: "단일 답변" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /다시 검토/ })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /다시 검토/ })).toHaveAccessibleDescription(
      "나중에 확인합니다.",
    );
  });

  it("opens a modal dialog with trapped focus and restores focus on close", async () => {
    const user = userEvent.setup();
    render(
      <AccessibleDialog
        trigger={<Button>제출 확인 열기</Button>}
        title="제출하시겠습니까?"
        description="제출 후에는 답을 바꿀 수 없습니다."
        confirmAction={{ label: "제출", onConfirm: vi.fn() }}
      >
        <p>미응답 2개</p>
      </AccessibleDialog>,
    );

    const trigger = screen.getByRole("button", { name: "제출 확인 열기" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "제출하시겠습니까?" });
    expect(dialog).toBeVisible();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await user.tab();
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("pairs chart visuals with an equivalent semantic table", () => {
    render(
      <AccessibleChart
        title="정답률 추이"
        description="최근 두 번의 모의고사"
        columns={["응시", "정답률"]}
        rows={[
          { id: "attempt-1", cells: ["1회", "72.00%"] },
          { id: "attempt-2", cells: ["2회", "80.00%"] },
        ]}
      >
        <svg aria-hidden="true" />
      </AccessibleChart>,
    );

    expect(screen.getByRole("img", { name: /정답률 추이/ })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "정답률 추이 데이터" })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "1회" })).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "80.00%" })).toBeInTheDocument();
  });
});


describe("static presentational components", () => {
  it("renders catalog and score summaries from props with semantic labels", () => {
    render(
      <>
        <CertificationCard
          provider="AWS"
          code="DOP-C02"
          name="AWS Certified DevOps Engineer – Professional"
          totalQuestions={75}
          timeLimitMinutes={180}
          passThreshold="75%"
          domainCount={6}
          href="/app/certifications/dop-c02"
          status={{ label: "연습 가능", tone: "success" }}
        />
        <ScoreSummary rawScore="56.00" accuracyRate="74.67%" totalQuestions={75} passed={false} reference1000="747" />
      </>,
    );

    expect(screen.getByRole("link", { name: /AWS Certified DevOps Engineer/ })).toHaveAttribute("href", "/app/certifications/dop-c02");
    expect(screen.getByRole("region", { name: "점수 요약" })).toHaveTextContent("56.00");
    expect(screen.getByText("참고 환산값")).toBeVisible();
  });

  it("renders data summaries, navigators, and validation errors with accessible table and status semantics", () => {
    render(
      <>
        <DomainBreakdown items={[{ id: "ci", name: "CI/CD", questionCount: 16, earnedScore: "12.00", accuracyRate: "75.00%" }]} />
        <DataTable caption="응시 이력" columns={[{ id: "attempt", header: "응시", cell: (row: { id: string; name: string }) => row.name }]} rows={[{ id: "a-1", name: "1회" }]} />
        <StatusBanner title="저장됨" message="변경 사항이 저장되었습니다." tone="success" />
        <QuestionNavigator items={[{ number: 1, href: "#question-1", state: "current", flagged: true }, { number: 2, href: "#question-2", state: "answered" }]} />
        <TimerFace remaining="02:59:30" />
        <FileSummary name="questions.json" size="14 KiB" status="검증 완료" tone="success" />
        <ValidationErrorList errors={[{ id: "e-1", path: "questions[0]", message: "정답이 필요합니다." }]} />
      </>,
    );

    expect(screen.getByRole("table", { name: "도메인별 성과 표" })).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "응시 이력" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("변경 사항이 저장되었습니다.");
    expect(screen.getByRole("navigation", { name: "문항 탐색" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /1번 문항, 현재 문항, 플래그됨/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByLabelText("남은 시간")).toHaveTextContent("02:59:30");
    expect(screen.getByLabelText("선택한 파일 요약")).toHaveTextContent("questions.json");
    expect(screen.getByRole("region", { name: /검증 오류/ })).toHaveTextContent("questions[0]: 정답이 필요합니다.");
  });
});


describe("QuestionPresenter", () => {
  const baseQuestion = {
    kind: "practice-submitted" as const,
    id: "00000000-0000-4000-8000-000000000001",
    displayNumber: 2,
    domainName: "SDLC Automation",
    stem: { en: "Which deployment option is correct?", ko: "어떤 배포 옵션이 올바릅니까?" },
    choices: [
      { id: "00000000-0000-4000-8000-000000000011", text: { en: "Blue/green", ko: "블루/그린" } },
      { id: "00000000-0000-4000-8000-000000000012", text: { en: "Replace all", ko: "전체 교체" } },
    ],
    requiredChoiceCount: 1,
    selectedChoiceIds: ["00000000-0000-4000-8000-000000000011"],
    flagged: true,
    translationStatus: "translated" as const,
    correctChoiceIds: ["00000000-0000-4000-8000-000000000011"],
    isCorrect: true,
    earnedScore: "1",
    explanation: { en: "Use **blue/green**.", ko: "**블루/그린** 배포를 사용합니다." },
  };

  it("renders props-only radio selection, navigation state, flag, and revealed safe Markdown feedback", () => {
    render(
      <QuestionPresenter
        language="ko"
        navigatorItems={[
          { number: 1, href: "#question-1", state: "answered" },
          { number: 2, href: "#question-2", state: "current", flagged: true },
        ]}
        question={baseQuestion}
        totalQuestions={2}
      />,
    );

    expect(screen.getByRole("radio", { name: "블루/그린" })).toBeChecked();
    expect(screen.getByText("문항 2 / 2 · SDLC Automation")).toBeVisible();
    expect(screen.getByRole("button", { name: "한국어" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Flag")).toBeVisible();
    expect(screen.getByRole("navigation", { name: "문항 탐색" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "제출 결과" })).toBeVisible();
    expect(screen.getByText("블루/그린 배포를 사용합니다.")).toBeVisible();
  });

  it("uses checkboxes and reports exact required selection counts without revealing answers", () => {
    render(
      <QuestionPresenter
        language="en"
        navigatorItems={[{ number: 1, href: "#question-1", state: "current" }]}
        question={{
          ...baseQuestion,
          kind: "exam-active",
          requiredChoiceCount: 2,
          selectedChoiceIds: ["00000000-0000-4000-8000-000000000011"],
        }}
        totalQuestions={1}
      />,
    );

    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByText("정확히 2개를 선택하세요. (1/2 선택)")).toBeVisible();
    expect(screen.queryByRole("heading", { name: "제출 결과" })).not.toBeInTheDocument();
  });
});
