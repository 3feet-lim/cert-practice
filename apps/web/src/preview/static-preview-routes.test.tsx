import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  STATIC_PREVIEW_EXPORT_MANIFEST,
  STATIC_PREVIEW_GALLERY_LINKS,
  STATIC_PREVIEW_ROUTE_PATTERNS,
  createStaticArtifactNavigation,
  relativeArtifactHref,
} from "./export-manifest";
import { STATIC_PREVIEW_FIXTURES } from "./route-fixtures";
import { StaticPreviewRoutes } from "./StaticPreviewRoutes";

afterEach(cleanup);

function renderPreview(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <StaticPreviewRoutes />
    </MemoryRouter>,
  );
}

describe("static preview export manifest", () => {
  it("maps the required deterministic S1-S10 variants to concrete relative HTML paths", () => {
    expect(STATIC_PREVIEW_EXPORT_MANIFEST.map(({ outputPath }) => outputPath)).toEqual([
      "screens/s1-login/success.html",
      "screens/s1-login/error.html",
      "screens/s1-login/pending.html",
      "screens/s2-home/success.html",
      "screens/s2-home/loading.html",
      "screens/s2-home/empty.html",
      "screens/s2-home/error.html",
      "screens/s3-mode-select/success.html",
      "screens/s3-mode-select/loading.html",
      "screens/s3-mode-select/empty.html",
      "screens/s3-mode-select/error.html",
      "screens/s3-mode-select/resume.html",
      "screens/s3-mode-select/confirm.html",
      "screens/s4-practice/unsubmitted.html",
      "screens/s4-practice/submitted.html",
      "screens/s4-practice/error.html",
      "screens/s5-exam/active.html",
      "screens/s5-exam/preview.html",
      "screens/s5-exam/expired.html",
      "screens/s5-exam/finalized.html",
      "screens/s6-practice-result/success.html",
      "screens/s6-practice-result/empty.html",
      "screens/s6-practice-result/expired.html",
      "screens/s7-exam-result/success.html",
      "screens/s7-exam-result/empty.html",
      "screens/s7-exam-result/error.html",
      "screens/s8-history/success.html",
      "screens/s8-history/empty.html",
      "screens/s8-history/error.html",
      "screens/s9-leaderboard/success.html",
      "screens/s9-leaderboard/empty.html",
      "screens/s9-leaderboard/private.html",
      "screens/s9-leaderboard/error.html",
      "screens/admin-users/success.html",
      "screens/admin-users/empty.html",
      "screens/admin-users/error.html",
      "screens/s10-admin-import/empty.html",
      "screens/s10-admin-import/validating.html",
      "screens/s10-admin-import/valid.html",
      "screens/s10-admin-import/invalid.html",
      "screens/s10-admin-import/commit.html",
      "screens/s10-admin-import/completed.html",
      "screens/s10-admin-import/token-expired.html",
    ]);

    expect(new Set(STATIC_PREVIEW_EXPORT_MANIFEST.map(({ id }) => id)).size).toBe(
      STATIC_PREVIEW_EXPORT_MANIFEST.length,
    );
    expect(
      new Set(STATIC_PREVIEW_EXPORT_MANIFEST.map(({ outputPath }) => outputPath)).size,
    ).toBe(STATIC_PREVIEW_EXPORT_MANIFEST.length);

    for (const item of STATIC_PREVIEW_EXPORT_MANIFEST) {
      expect(item.outputPath).toMatch(/^screens\/.+\.html$/);
      expect(item.outputPath).not.toMatch(/^\/|:\/\//);
      expect(STATIC_PREVIEW_FIXTURES).toHaveProperty(item.fixtureKey);
      expect(item.previewUrl).toBe(
        `${item.routePath}?preview=${encodeURIComponent(item.variant)}`,
      );
    }
  });

  it("registers every required public, app, quiz, result, history, leaderboard, and admin route", () => {
    expect(STATIC_PREVIEW_ROUTE_PATTERNS).toEqual([
      "/login",
      "/auth/callback",
      "/pending",
      "/app",
      "/app/certifications/:id",
      "/app/practice/:sessionId",
      "/app/exams/:sessionId",
      "/app/practice-results/:id",
      "/app/attempts/:id",
      "/app/history",
      "/app/leaderboards/:certId?",
      "/app/admin/users",
      "/app/admin/import",
    ]);
  });

  it("builds only relative gallery, previous, next, top, and side navigation links", () => {
    expect(relativeArtifactHref("index.html", "screens/s1-login/success.html")).toBe(
      "screens/s1-login/success.html",
    );
    expect(
      relativeArtifactHref(
        "screens/s2-home/error.html",
        "screens/s8-history/success.html",
      ),
    ).toBe("../s8-history/success.html");

    for (const entry of STATIC_PREVIEW_EXPORT_MANIFEST) {
      const navigation = createStaticArtifactNavigation(entry.id);
      const hrefs = [
        navigation.galleryHref,
        navigation.previous.href,
        navigation.next.href,
        ...navigation.primary.map(({ href }) => href),
        ...navigation.secondary.map(({ href }) => href),
      ];

      expect(navigation.galleryHref).toBe("../../index.html");
      for (const href of hrefs) {
        expect(href).not.toMatch(/^\/|^[a-z][a-z\d+.-]*:/i);
        expect(href).toMatch(/\.html$/);
      }
    }

    expect(STATIC_PREVIEW_GALLERY_LINKS).toHaveLength(
      STATIC_PREVIEW_EXPORT_MANIFEST.length,
    );
  });
});

describe("fixture-only static React Router skeleton", () => {
  it.each([
    ["/login?preview=success", "S1", "로그인", "actors.unauthenticated"],
    [
      "/auth/callback?preview=error",
      "S1",
      "로그인 callback 오류",
      "actors.callbackError",
    ],
    ["/pending?preview=pending", "S1", "승인 대기", "actors.pending"],
    ["/app?preview=loading", "S2", "홈", "presentation.loading"],
    [
      "/app/certifications/dop-c02?preview=resume",
      "S3",
      "학습 모드 선택",
      "practice.success",
    ],
    [
      "/app/practice/practice-preview?preview=submitted",
      "S4",
      "연습 모드",
      "practice.submittedFeedback",
    ],
    [
      "/app/exams/exam-preview?preview=preview",
      "S5",
      "모의고사",
      "presentation.examPreview",
    ],
    [
      "/app/exams/exam-preview?preview=finalized",
      "S5",
      "모의고사",
      "presentation.examFinalized",
    ],
    [
      "/app/practice-results/result-preview?preview=expired",
      "S6",
      "연습 결과",
      "results.error",
    ],
    [
      "/app/attempts/attempt-preview?preview=success",
      "S7",
      "모의고사 결과",
      "results.success",
    ],
    ["/app/history?preview=empty", "S8", "모의고사 이력", "history.empty"],
    [
      "/app/leaderboards/dop-c02?preview=private",
      "S9",
      "리더보드",
      "presentation.leaderboardPrivate",
    ],
    [
      "/app/admin/users?preview=empty",
      "ADMIN-USERS",
      "승인 대기 사용자",
      "admin.users.empty",
    ],
    [
      "/app/admin/import?preview=commit",
      "S10",
      "문제 은행 임포트",
      "presentation.importCommit",
    ],
  ])(
    "selects %s from only its preview query and read-only fixture registry",
    (path, screenId, title, fixtureKey) => {
      const { container } = renderPreview(path);

      expect(screen.getByRole("heading", { name: title })).toBeVisible();
      expect(screen.getByText(screenId)).toBeVisible();
      expect(container.firstElementChild).toHaveAttribute(
        "data-fixture-key",
        fixtureKey,
      );
      expect(screen.getByRole("navigation", { name: "주요 정적 화면" })).toBeVisible();
      expect(screen.getByRole("navigation", { name: "정적 화면 순서" })).toBeVisible();
    },
  );

  it("supports fixture-key selection and deterministically falls back for unknown variants", () => {
    const fixtureSelection = renderPreview("/app?fixture=catalog.error");
    expect(fixtureSelection.container.firstElementChild).toHaveAttribute(
      "data-preview-entry",
      "s2-home-error",
    );
    fixtureSelection.unmount();

    const fallbackSelection = renderPreview("/app?preview=not-a-variant");
    expect(fallbackSelection.container.firstElementChild).toHaveAttribute(
      "data-preview-entry",
      "s2-home-success",
    );
  });

  it("renders a gallery whose links point directly to generated HTML files", () => {
    renderPreview("/");

    expect(
      screen.getByRole("heading", { name: "CertQuiz S1-S10 UI gallery" }),
    ).toBeVisible();
    expect(screen.getAllByRole("link")).toHaveLength(
      STATIC_PREVIEW_EXPORT_MANIFEST.length,
    );
    expect(screen.getByRole("link", { name: "S1 · 로그인 · success" })).toHaveAttribute(
      "href",
      "screens/s1-login/success.html",
    );
  });
});


describe("S6-S9 static result, history, and leaderboard previews", () => {
  it("renders raw score, accuracy, domain review, pass status, and reference score from immutable fixtures", () => {
    const { unmount } = renderPreview("/app/practice-results/practice-result-preview?preview=success");
    expect(screen.getByRole("heading", { name: "연습 결과" })).toBeVisible();
    expect(screen.getByRole("region", { name: "점수 요약" })).toHaveTextContent("60.00");
    expect(screen.getByRole("table", { name: "도메인별 성과 표" })).toBeVisible();
    expect(screen.getByRole("table", { name: "문항 검토" })).toBeVisible();
    unmount();

    renderPreview("/app/attempts/attempt-preview?preview=success");
    expect(screen.getByText("합격")).toBeVisible();
    expect(screen.getByText("참고 환산값")).toBeVisible();
    expect(screen.getByText("시간 만료 자동 제출")).toBeVisible();
  });

  it("renders deterministic no-result, expired, history trend, and leaderboard privacy variants", () => {
    const { unmount } = renderPreview("/app/practice-results/practice-result-preview?preview=empty");
    expect(screen.getByText("No result selected")).toBeVisible();
    unmount();

    const expired = renderPreview("/app/practice-results/practice-result-preview?preview=expired");
    expect(screen.getByRole("alert")).toHaveTextContent("no longer available");
    expired.unmount();

    const history = renderPreview("/app/history?preview=success");
    expect(screen.getByRole("table", { name: "모의고사 응시 이력" })).toBeVisible();
    expect(screen.getByRole("table", { name: "DOP-C02 정답률 추이 데이터" })).toBeVisible();
    history.unmount();

    renderPreview("/app/leaderboards/dop-c02?preview=private");
    expect(screen.getByRole("checkbox", { name: "점수 공개" })).not.toBeChecked();
    expect(screen.getByText("비공개 상태")).toBeVisible();
    expect(screen.getByText("Tie Breaker")).toBeVisible();
  });
});


describe("administrator static visual variants", () => {
  it("renders read-only pending-user rows and disabled approval controls", () => {
    renderPreview("/app/admin/users?preview=success");

    expect(screen.getByRole("table", { name: "승인 대기 사용자 목록" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: /승인$/ })).toHaveLength(2);
    for (const button of screen.getAllByRole("button", { name: /승인$/ })) {
      expect(button).toBeDisabled();
    }
    expect(screen.getByText("이 정적 검토 화면의 승인 버튼은 동작하지 않습니다.")).toBeVisible();
  });

  it("renders validation errors, unavailable summaries, commit confirmation, completion, and token-expiry states", () => {
    const invalid = renderPreview("/app/admin/import?preview=invalid");
    expect(screen.getByText("계산 불가: The questions array is missing.")).toBeVisible();
    expect(screen.getByRole("heading", { name: /검증 오류/ })).toBeVisible();
    invalid.unmount();

    const commit = renderPreview("/app/admin/import?preview=commit");
    expect(screen.getByRole("dialog", { name: "문제 은행을 교체할까요?" })).toBeVisible();
    commit.unmount();

    const completed = renderPreview("/app/admin/import?preview=completed");
    expect(screen.getByText("문제 은행을 교체했습니다")).toBeVisible();
    completed.unmount();

    renderPreview("/app/admin/import?preview=token-expired");
    expect(screen.getByText("검증 토큰이 만료되었거나 이미 사용되었습니다")).toBeVisible();
  });
});
