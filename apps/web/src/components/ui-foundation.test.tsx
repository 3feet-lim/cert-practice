import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  AdminShell,
  AppShell,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  formControlClassName,
  PageHeader,
  PendingShell,
  PublicShell,
  StatePanel,
  StaticDialog,
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./index";

afterEach(cleanup);

describe("static application shells", () => {
  it("renders the public shell with local-relative branding and semantic landmarks", () => {
    render(
      <PublicShell productHref="../../index.html" aside={<p>로그인 안내</p>}>
        <h1>로그인</h1>
      </PublicShell>,
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /CertQuiz/ })).toHaveAttribute(
      "href",
      "../../index.html",
    );
    expect(screen.getByRole("complementary", { name: "안내" })).toHaveTextContent(
      "로그인 안내",
    );
    expect(screen.getByRole("main")).toContainElement(
      screen.getByRole("heading", { name: "로그인" }),
    );
  });

  it("renders pending, app, and admin layouts from props only", () => {
    const { rerender } = render(
      <PendingShell statusLabel="승인 확인 중">
        <h1>승인 대기</h1>
      </PendingShell>,
    );
    expect(screen.getByText("승인 확인 중")).toBeVisible();

    rerender(
      <AppShell
        navigation={[{ href: "../home/success.html", label: "홈", current: true }]}
        secondaryNavigation={[{ href: "../../index.html", label: "갤러리" }]}
        userActions={<span>정적 사용자</span>}
      >
        <h1>학습 홈</h1>
      </AppShell>,
    );
    expect(screen.getByRole("navigation", { name: "주요 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute(
      "href",
      "../home/success.html",
    );
    expect(screen.getByRole("link", { name: "홈" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "본문으로 건너뛰기" })).toHaveAttribute(
      "href",
      "#main-content",
    );

    rerender(
      <AdminShell
        globalNavigation={[{ href: "../home.html", label: "학습 홈" }]}
        navigation={[{ href: "./import.html", label: "문제 은행", current: true }]}
      >
        <p>관리 콘텐츠</p>
      </AdminShell>,
    );
    expect(screen.getByRole("navigation", { name: "관리 메뉴" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "관리자 콘솔" })).toBeVisible();
    expect(screen.getByText("관리 콘텐츠")).toBeVisible();
  });
});

describe("presentational UI primitives", () => {
  it("renders explicit loading, empty, error, and success panels", () => {
    render(
      <div>
        <StatePanel
          status="loading"
          title="불러오는 중"
          message="이력 데이터를 확인합니다."
        />
        <StatePanel
          status="empty"
          title="결과 없음"
          message="적용된 조건에 결과가 없습니다."
        />
        <StatePanel
          status="error"
          title="조회 실패"
          message="보호 정보가 없는 안전한 오류입니다."
          action={<Button variant="secondary">다시 시도</Button>}
        />
        <StatePanel
          status="success"
          title="완료"
          message="정적 검토가 준비되었습니다."
        />
      </div>,
    );

    expect(document.querySelector('[data-state="loading"]')).toHaveAttribute(
      "aria-busy",
      "true",
    );
    expect(document.querySelector('[data-state="empty"]')).toHaveTextContent(
      "결과 없음",
    );
    expect(screen.getByRole("alert")).toHaveTextContent("보호 정보가 없는 안전한 오류");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeVisible();
    expect(document.querySelector('[data-state="success"]')).toHaveTextContent("완료");
  });

  it("composes page, card, badge, table, dialog, and labelled field semantics", () => {
    render(
      <div>
        <PageHeader
          eyebrow="S2"
          title="학습 홈"
          description="자격증을 선택하세요."
          metadata={<Badge tone="success">준비됨</Badge>}
          actions={<Button>새로 만들기</Button>}
        />
        <Card>
          <CardHeader>
            <CardTitle>자격증 카드</CardTitle>
            <CardDescription>정적 설명</CardDescription>
          </CardHeader>
          <CardContent>카드 내용</CardContent>
          <CardFooter>카드 작업</CardFooter>
        </Card>
        <FormField
          id="certification"
          label="자격증"
          description="하나를 선택합니다."
          error="필수 항목입니다."
          required
          control={
            <select className={formControlClassName}>
              <option value="">선택</option>
            </select>
          }
        />
        <Table aria-label="자격증 목록">
          <TableCaption>현재 제공되는 자격증</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>코드</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableHead scope="row">DOP-C02</TableHead>
              <TableCell>사용 가능</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <StaticDialog
          id="exam-confirm"
          title="모의고사를 시작할까요?"
          description="이 화면은 정적 확인 표현입니다."
          actions={<Button>확인</Button>}
        >
          <p>75문항 · 180분</p>
        </StaticDialog>
      </div>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "학습 홈" })).toBeVisible();
    expect(screen.getByText("준비됨")).toBeVisible();
    expect(
      screen.getByRole("combobox", { name: /자격증/ }),
    ).toHaveAccessibleDescription("하나를 선택합니다. 필수 항목입니다.");
    expect(screen.getByRole("combobox", { name: /자격증/ })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    const table = screen.getByRole("table", { name: "자격증 목록" });
    expect(within(table).getByRole("rowheader", { name: "DOP-C02" })).toBeVisible();
    expect(
      screen.getByRole("dialog", { name: "모의고사를 시작할까요?" }),
    ).toHaveAccessibleDescription("이 화면은 정적 확인 표현입니다.");
  });
});
