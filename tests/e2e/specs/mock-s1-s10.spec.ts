import { expect, test } from "@playwright/test";

const approved = "mockActor=approved";
const admin = "mockActor=admin";
const completed = "mockActor=approved&mockScenario=completed-results";
const mockExamId = "00000000-0000-4000-8000-000000000009";
const mockPracticeResultId = "00000000-0000-4000-8000-00000000000b";
const mockAttemptId = "00000000-0000-4000-8000-00000000000a";

/**
 * These are deterministic in-browser frontend mock checks only. They must not
 * be treated as real-backend acceptance for auth, authorization, persistence,
 * timing, import atomicity, or deployment behavior.
 */
test.describe("S1-S10 frontend mock flows (not real-backend acceptance)", () => {
  test("S1 completes the deterministic mock login into pending approval", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: "Google 로그인 계속하기" }).click();
    await expect(
      page.getByRole("heading", { name: "관리자에게 승인을 요청해 주세요." }),
    ).toBeVisible();
  });

  test("approved mock actor opens S2-S9 screens with contract-safe projections", async ({
    page,
  }) => {
    await page.goto(`/app?${approved}`);
    await expect(
      page.getByRole("heading", { name: "학습 홈", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "합격 준비도" })).toBeVisible();

    await page.getByRole("link", { name: "학습 모드 선택" }).click();
    await expect(page.getByRole("heading", { name: "학습 모드 선택" })).toBeVisible();

    await page.getByRole("button", { name: "연습 시작" }).click();
    await page.getByRole("button", { name: "이어 풀기" }).click();
    await expect(page.getByRole("heading", { name: "연습 모드" })).toBeVisible();

    await page.goto(`/app/exams/${mockExamId}?${approved}`);
    await expect(
      page.getByRole("heading", { name: "모의고사", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("definition").first()).toBeVisible();
    await expect(page.getByLabel("서버 기준 남은 시간")).toBeVisible();
    await expect(
      page.getByText("남은 시간과 제출 결과는 서버 기준으로 처리됩니다."),
    ).toBeVisible();
    await expect(page.locator("body")).not.toContainText("correctChoiceIds");

    await page.goto(`/app/practice-results/${mockPracticeResultId}?${completed}`);
    await expect(
      page.getByRole("heading", { name: "연습 결과", exact: true }),
    ).toBeVisible();

    await page.goto(`/app/attempts/${mockAttemptId}?${completed}`);
    await expect(
      page.getByRole("heading", { name: "모의고사 결과", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("meter", { name: "정답률과 합격선" })).toBeVisible();
    const review = page.getByRole("list", { name: "문항 검토" });
    await review.getByRole("button").first().click();
    await expect(page.getByRole("region", { name: "해설" })).toBeVisible();

    await page.goto(`/app/history?${approved}`);
    const historyTable = page.getByRole("table", { name: "모의고사 응시 이력" });
    await expect(historyTable).toBeVisible();
    await expect(
      historyTable.getByRole("link", { name: /응시 결과 보기/ }).first(),
    ).toBeVisible();

    await page.goto(`/app/leaderboards?${approved}`);
    await expect(
      page.getByRole("table", { name: "공개 최고 성과 리더보드" }),
    ).toBeVisible();
  });

  test("admin mock actor opens S10 pending-user and import screens", async ({
    page,
  }) => {
    await page.goto(`/app/admin/users?${admin}`);
    await expect(page.getByRole("heading", { name: "관리자 콘솔" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "승인 대기 사용자" })).toBeVisible();

    await page.goto(`/app/admin/import?${admin}`);
    await expect(
      page.getByRole("heading", { name: "JSON 문제 은행 임포트" }),
    ).toBeVisible();
  });

  test("represents mock loading, empty, retryable error, and retry independently", async ({
    page,
  }) => {
    await page.goto(`/app?mockActor=approved&mockScenario=catalog-loading`);
    await expect(page.getByText("자격증 카탈로그를 불러오는 중입니다.")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "학습 홈", level: 1 }),
    ).toBeVisible();

    await page.goto(`/app?mockActor=approved&mockScenario=catalog-empty`);
    await expect(page.getByText("학습 가능한 자격증이 없습니다.")).toBeVisible();

    await page.goto(`/app?mockActor=approved&mockScenario=catalog-retry-once`);
    await expect(
      page.getByRole("heading", { name: "dependency-unavailable" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "다시 시도" }).click();
    await expect(page.getByRole("link", { name: "학습 모드 선택" })).toBeVisible();
  });
});

test.describe("mobile and keyboard ergonomics (frontend mock only)", () => {
  test("collapses primary navigation into a mobile menu", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/app?${approved}`);
    await expect(page.getByRole("navigation", { name: "주요 메뉴" })).toBeHidden();
    await page.getByRole("button", { name: "메뉴 열기" }).click();
    const mobileMenu = page.getByRole("navigation", { name: "모바일 메뉴" });
    await mobileMenu.getByRole("link", { name: "리더보드" }).click();
    await expect(page.getByRole("heading", { name: "리더보드" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "모바일 메뉴" })).toBeHidden();
  });

  test("selects choices and moves between practice questions from the keyboard", async ({
    page,
  }) => {
    await page.goto(`/app?${approved}`);
    await page.getByRole("link", { name: "학습 모드 선택" }).click();
    await page.getByRole("button", { name: "연습 시작" }).click();
    await page.getByRole("button", { name: "이어 풀기" }).click();
    await expect(page.getByRole("heading", { name: "연습 모드" })).toBeVisible();

    const current = page
      .getByRole("navigation", { name: "문항 탐색" })
      .locator('[aria-current="page"]');
    const before = (await current.textContent()) ?? "";
    await page.keyboard.press("ArrowRight");
    await expect(current).not.toHaveText(before);
    await page.keyboard.press("1");
    await expect(
      page.getByRole("group", { name: "답변 선택" }).locator("input").first(),
    ).toBeChecked();
  });
});
