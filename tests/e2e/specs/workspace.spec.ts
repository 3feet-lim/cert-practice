import { expect, test } from "@playwright/test";

test("loads the CertQuiz frontend workspace", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "클라우드 자격증 연습을 시작하세요.",
    }),
  ).toBeVisible();
});
