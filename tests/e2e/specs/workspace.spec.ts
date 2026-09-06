import { expect, test } from "@playwright/test";

test("loads the CertQuiz frontend workspace", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Google 계정으로 로그인",
    }),
  ).toBeVisible();
});
