import { expect, test } from "@playwright/test";

test("reviews deterministic result, history, and leaderboard preview states", async ({
  page,
}) => {
  await page.goto("/app/attempts/attempt-preview?preview=success");
  await expect(page.getByRole("heading", { name: "모의고사 결과" })).toBeVisible();
  await expect(page.getByRole("region", { name: "점수 요약" })).toContainText("60.00");
  await expect(page.getByRole("heading", { name: "불변 응시 검토" })).toBeVisible();

  await page.goto("/app/history?preview=success");
  await expect(page.getByRole("table", { name: "모의고사 응시 이력" })).toBeVisible();
  await page.getByText("표로 데이터 보기").click();
  await expect(
    page.getByRole("table", { name: "DOP-C02 정답률 추이 데이터" }),
  ).toBeVisible();

  await page.goto("/app/leaderboards/dop-c02?preview=success");
  const leaderboard = page.getByRole("table", { name: "공개 최고 성과 리더보드" });
  await expect(leaderboard.getByText("나")).toBeVisible();
  await expect(leaderboard.getByText("4위")).toBeVisible();

  await page.goto("/app/leaderboards/dop-c02?preview=private");
  await expect(page.getByRole("checkbox", { name: "점수 공개" })).not.toBeChecked();
  await expect(page.getByText("비공개 상태")).toBeVisible();
  await expect(page.getByText("나")).not.toBeVisible();
});
