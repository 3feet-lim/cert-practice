import { readFileSync } from "node:fs";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const pendingToken = process.env.CERTQUIZ_E2E_PENDING_TOKEN ?? "";
const adminToken = process.env.CERTQUIZ_E2E_ADMIN_TOKEN ?? "";
const pendingDisplayName = process.env.CERTQUIZ_E2E_PENDING_DISPLAY_NAME ?? "";
const emptyCatalogWebUrl = process.env.CERTQUIZ_E2E_EMPTY_CATALOG_WEB_URL;
const importJsonPath = process.env.CERTQUIZ_E2E_IMPORT_JSON_PATH;
const importCommitAllowed = process.env.CERTQUIZ_E2E_ALLOW_IMPORT_COMMIT === "1";
const configured =
  process.env.CERTQUIZ_REAL_E2E === "1" &&
  pendingToken.length > 0 &&
  adminToken.length > 0 &&
  pendingDisplayName.length > 0;

const missingConfiguration =
  "Set CERTQUIZ_REAL_E2E=1 plus deployed-web URL, pending/admin Cognito test tokens, and the pending user display name to run live API E2E.";

/**
 * Opens the deployed web application with a real Cognito test token supplied
 * only through Playwright init script memory. No token is persisted by the app
 * or written to traces/assertions.
 */
async function openBearerPage(
  browser: Browser,
  token: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext();
  await context.addInitScript((bearerToken: string) => {
    Object.assign(window, {
      certQuizBearerTokenProvider: () => bearerToken,
    });
  }, token);
  return { context, page: await context.newPage() };
}

async function startPractice(page: Page): Promise<void> {
  await page.getByRole("link", { name: "학습 모드 선택" }).click();
  await expect(page.getByRole("heading", { name: "학습 모드 선택" })).toBeVisible();
  await page.getByRole("button", { name: "연습 시작" }).click();

  const resume = page.getByRole("button", { name: "이어 풀기" });
  if (await resume.isVisible().catch(() => false)) await resume.click();

  await expect(page.getByRole("heading", { name: "연습 모드" })).toBeVisible();
}

async function submitCurrentPracticeAnswer(page: Page): Promise<void> {
  const choice = page.getByRole("radio").first();
  await expect(choice).toBeVisible();
  await choice.check();
  const submit = page.getByRole("button", { name: "답변 제출" });
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(page.getByRole("heading", { name: "제출 결과" })).toBeVisible();
}

/**
 * This suite deliberately has no MSW, route fulfillment, or local API server.
 * Every completed request is issued by the HTTP adapter to the configured
 * deployment; route interception below only delays or aborts one browser
 * transport attempt to exercise client loading/retry UI before the retry hits
 * the real API.
 */
test.describe("S1-S10 real API browser flow", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!configured, missingConfiguration);

  test("S1 authenticates a Cognito test user, then the admin approves pending access", async ({
    browser,
  }) => {
    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto("/login");
    await expect(
      anonymousPage.getByRole("heading", { name: "Google 계정으로 로그인" }),
    ).toBeVisible();
    await anonymous.close();

    const learner = await openBearerPage(browser, pendingToken);
    await learner.page.goto("/");
    await expect(
      learner.page.getByRole("heading", { name: "관리자 승인을 기다리고 있습니다." }),
    ).toBeVisible();

    const admin = await openBearerPage(browser, adminToken);
    await admin.page.goto("/app/admin/users");
    await expect(
      admin.page.getByRole("heading", { name: "승인 대기 사용자" }),
    ).toBeVisible();
    const pendingRow = admin.page.getByRole("row", {
      name: new RegExp(pendingDisplayName),
    });
    await expect(pendingRow).toBeVisible();
    await pendingRow
      .getByRole("button", { name: `${pendingDisplayName} 승인` })
      .click();
    await expect(pendingRow).toHaveCount(0);
    await admin.context.close();

    await learner.page.getByRole("button", { name: "승인 상태 새로고침" }).click();
    await expect(
      learner.page.getByRole("heading", { name: "클라우드 자격증 연습을 시작하세요." }),
    ).toBeVisible();
    await learner.context.close();
  });

  test("S2-S9 use real catalog, practice, exam, result, history, and leaderboard endpoints", async ({
    browser,
  }) => {
    const learner = await openBearerPage(browser, pendingToken);
    const { page } = learner;
    await page.goto("/app");
    await expect(
      page.getByRole("heading", { name: "클라우드 자격증 연습을 시작하세요." }),
    ).toBeVisible();

    await startPractice(page);
    await submitCurrentPracticeAnswer(page);

    await page.goto("/app");
    await page.getByRole("link", { name: "학습 모드 선택" }).click();
    await page.getByRole("button", { name: "모의고사 시작" }).click();
    await page.getByRole("button", { name: "확인하고 시작" }).click();
    await expect(page.getByRole("heading", { name: "모의고사" })).toBeVisible();
    await expect(page.locator("body")).not.toContainText("correctChoiceIds");

    await page.getByRole("button", { name: "제출 미리보기" }).click();
    await expect(
      page.getByRole("heading", { name: "모의고사를 제출하시겠습니까?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "제출 확정" }).click();
    await expect(page.getByRole("heading", { name: "모의고사 결과" })).toBeVisible();

    await page.getByRole("link", { name: "이력" }).click();
    await expect(page.getByRole("table", { name: "모의고사 응시 이력" })).toBeVisible();

    await page.getByRole("link", { name: "리더보드" }).click();
    const scoreVisibility = page.getByRole("checkbox", { name: "점수 공개" });
    await expect(scoreVisibility).toBeVisible();
    if (!(await scoreVisibility.isChecked())) await scoreVisibility.check();
    await expect(
      page.getByRole("table", { name: "공개 최고 성과 리더보드" }),
    ).toBeVisible();
    await learner.context.close();
  });

  test("S2 real transport shows independent loading and manual retry", async ({
    browser,
  }) => {
    const learner = await openBearerPage(browser, pendingToken);
    let catalogRequests = 0;
    await learner.page.route("**/v1/catalog", async (route) => {
      catalogRequests += 1;
      if (catalogRequests === 1) {
        await new Promise<void>((resolve) => setTimeout(resolve, 250));
        await route.abort("failed");
        return;
      }
      await route.continue();
    });

    await learner.page.goto("/app");
    await expect(
      learner.page.getByText("자격증 카탈로그를 불러오는 중입니다."),
    ).toBeVisible();
    await expect(
      learner.page.getByRole("heading", { name: "dependency-unavailable" }),
    ).toBeVisible();
    await learner.page.getByRole("button", { name: "다시 시도" }).click();
    await expect(
      learner.page.getByRole("link", { name: "학습 모드 선택" }),
    ).toBeVisible();
    expect(catalogRequests).toBe(2);
    await learner.context.close();
  });

  test("S6 opens a real completed-practice review fixture", async ({ browser }) => {
    const practiceResultId = process.env.CERTQUIZ_E2E_PRACTICE_RESULT_ID;
    if (!practiceResultId) {
      test.skip(
        true,
        "CERTQUIZ_E2E_PRACTICE_RESULT_ID is required for the real S6 review fixture.",
      );
      return;
    }
    const learner = await openBearerPage(browser, pendingToken);
    await learner.page.goto(`/app/practice-results/${practiceResultId}`);
    await expect(
      learner.page.getByRole("heading", { name: "연습 결과", exact: true }),
    ).toBeVisible();
    await learner.context.close();
  });

  test("S10 validates an invalid JSON upload against the real admin API without changing catalog data", async ({
    browser,
  }) => {
    const admin = await openBearerPage(browser, adminToken);
    await admin.page.goto("/app/admin/import");
    await expect(
      admin.page.getByRole("heading", { name: "JSON 문제 은행 임포트" }),
    ).toBeVisible();
    await admin.page.getByLabel("JSON 문제 은행 파일 선택").setInputFiles({
      name: "invalid-import.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"not":"a valid catalog"}'),
    });
    await admin.page.getByRole("button", { name: "Dry-run 검증" }).click();
    await expect(admin.page.getByText("검증 실패")).toBeVisible();
    await admin.context.close();
  });

  test("S10 can validate and explicitly commit a disposable test catalog", async ({
    browser,
  }) => {
    if (!importCommitAllowed || !importJsonPath) {
      test.skip(
        true,
        "Set CERTQUIZ_E2E_ALLOW_IMPORT_COMMIT=1 and CERTQUIZ_E2E_IMPORT_JSON_PATH only for a disposable test deployment.",
      );
      return;
    }
    const admin = await openBearerPage(browser, adminToken);
    await admin.page.goto("/app/admin/import");
    await admin.page.getByLabel("JSON 문제 은행 파일 선택").setInputFiles({
      name: "e2e-catalog.json",
      mimeType: "application/json",
      buffer: readFileSync(importJsonPath),
    });
    await admin.page.getByRole("button", { name: "Dry-run 검증" }).click();
    await expect(admin.page.getByText("검증 통과")).toBeVisible();
    await admin.page.getByRole("button", { name: "임포트 확정" }).click();
    await admin.page.getByRole("button", { name: "교체 확정" }).click();
    await expect(
      admin.page.getByRole("heading", { name: "문제 은행을 교체했습니다" }),
    ).toBeVisible();
    await admin.context.close();
  });

  test("S2 empty state is checked only against a separately provisioned empty-catalog deployment", async ({
    browser,
  }) => {
    if (!emptyCatalogWebUrl) {
      test.skip(
        true,
        "CERTQUIZ_E2E_EMPTY_CATALOG_WEB_URL is required for the real empty-catalog deployment check.",
      );
      return;
    }
    const learner = await openBearerPage(browser, pendingToken);
    await learner.page.goto(new URL("/app", emptyCatalogWebUrl).toString());
    await expect(
      learner.page.getByText("학습 가능한 자격증이 없습니다."),
    ).toBeVisible();
    await learner.context.close();
  });
});
