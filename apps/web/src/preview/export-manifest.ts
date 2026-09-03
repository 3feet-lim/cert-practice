import type { StaticPreviewFixtureKey } from "./route-fixtures";

export type StaticPreviewScreen =
  "S1" | "S2" | "S3" | "S4" | "S5" | "S6" | "S7" | "S8" | "S9" | "S10" | "ADMIN-USERS";

export interface StaticPreviewExportEntry {
  readonly id: string;
  readonly screen: StaticPreviewScreen;
  readonly title: string;
  readonly variant: string;
  readonly routePattern: string;
  readonly routePath: string;
  readonly previewUrl: string;
  readonly outputPath: `screens/${string}.html`;
  readonly fixtureKey: StaticPreviewFixtureKey;
}

function entry(
  id: string,
  screen: StaticPreviewScreen,
  title: string,
  variant: string,
  routePattern: string,
  routePath: string,
  outputPath: `screens/${string}.html`,
  fixtureKey: StaticPreviewFixtureKey,
): StaticPreviewExportEntry {
  return Object.freeze({
    id,
    screen,
    title,
    variant,
    routePattern,
    routePath,
    previewUrl: `${routePath}?preview=${encodeURIComponent(variant)}`,
    outputPath,
    fixtureKey,
  });
}

/**
 * Deterministic source of truth for S1-S10 review documents. Array order is the
 * gallery and previous/next order; do not derive it from object-key iteration.
 */
export const STATIC_PREVIEW_EXPORT_MANIFEST = Object.freeze([
  entry(
    "s1-login-success",
    "S1",
    "로그인",
    "success",
    "/login",
    "/login",
    "screens/s1-login/success.html",
    "actors.unauthenticated",
  ),
  entry(
    "s1-login-error",
    "S1",
    "로그인 callback 오류",
    "error",
    "/auth/callback",
    "/auth/callback",
    "screens/s1-login/error.html",
    "actors.callbackError",
  ),
  entry(
    "s1-login-pending",
    "S1",
    "승인 대기",
    "pending",
    "/pending",
    "/pending",
    "screens/s1-login/pending.html",
    "actors.pending",
  ),

  entry(
    "s2-home-success",
    "S2",
    "홈",
    "success",
    "/app",
    "/app",
    "screens/s2-home/success.html",
    "catalog.success",
  ),
  entry(
    "s2-home-loading",
    "S2",
    "홈",
    "loading",
    "/app",
    "/app",
    "screens/s2-home/loading.html",
    "presentation.loading",
  ),
  entry(
    "s2-home-empty",
    "S2",
    "홈",
    "empty",
    "/app",
    "/app",
    "screens/s2-home/empty.html",
    "catalog.empty",
  ),
  entry(
    "s2-home-error",
    "S2",
    "홈",
    "error",
    "/app",
    "/app",
    "screens/s2-home/error.html",
    "catalog.error",
  ),

  entry(
    "s3-mode-success",
    "S3",
    "학습 모드 선택",
    "success",
    "/app/certifications/:id",
    "/app/certifications/dop-c02",
    "screens/s3-mode-select/success.html",
    "catalog.success",
  ),
  entry(
    "s3-mode-resume",
    "S3",
    "학습 모드 선택",
    "resume",
    "/app/certifications/:id",
    "/app/certifications/dop-c02",
    "screens/s3-mode-select/resume.html",
    "practice.success",
  ),
  entry(
    "s3-mode-confirm",
    "S3",
    "학습 모드 선택",
    "confirm",
    "/app/certifications/:id",
    "/app/certifications/dop-c02",
    "screens/s3-mode-select/confirm.html",
    "exam.success",
  ),

  entry(
    "s4-practice-unsubmitted",
    "S4",
    "연습 모드",
    "unsubmitted",
    "/app/practice/:sessionId",
    "/app/practice/practice-preview",
    "screens/s4-practice/unsubmitted.html",
    "practice.success",
  ),
  entry(
    "s4-practice-submitted",
    "S4",
    "연습 모드",
    "submitted",
    "/app/practice/:sessionId",
    "/app/practice/practice-preview",
    "screens/s4-practice/submitted.html",
    "practice.submittedFeedback",
  ),
  entry(
    "s4-practice-error",
    "S4",
    "연습 모드",
    "error",
    "/app/practice/:sessionId",
    "/app/practice/practice-preview",
    "screens/s4-practice/error.html",
    "practice.error",
  ),

  entry(
    "s5-exam-active",
    "S5",
    "모의고사",
    "active",
    "/app/exams/:sessionId",
    "/app/exams/exam-preview",
    "screens/s5-exam/active.html",
    "exam.success",
  ),
  entry(
    "s5-exam-preview",
    "S5",
    "모의고사",
    "preview",
    "/app/exams/:sessionId",
    "/app/exams/exam-preview",
    "screens/s5-exam/preview.html",
    "presentation.examPreview",
  ),
  entry(
    "s5-exam-expired",
    "S5",
    "모의고사",
    "expired",
    "/app/exams/:sessionId",
    "/app/exams/exam-preview",
    "screens/s5-exam/expired.html",
    "exam.expired",
  ),

  entry(
    "s6-practice-result-success",
    "S6",
    "연습 결과",
    "success",
    "/app/practice-results/:id",
    "/app/practice-results/practice-result-preview",
    "screens/s6-practice-result/success.html",
    "results.success",
  ),
  entry(
    "s6-practice-result-expired",
    "S6",
    "연습 결과",
    "expired",
    "/app/practice-results/:id",
    "/app/practice-results/practice-result-preview",
    "screens/s6-practice-result/expired.html",
    "results.error",
  ),

  entry(
    "s7-exam-result-success",
    "S7",
    "모의고사 결과",
    "success",
    "/app/attempts/:id",
    "/app/attempts/attempt-preview",
    "screens/s7-exam-result/success.html",
    "results.success",
  ),
  entry(
    "s7-exam-result-error",
    "S7",
    "모의고사 결과",
    "error",
    "/app/attempts/:id",
    "/app/attempts/attempt-preview",
    "screens/s7-exam-result/error.html",
    "results.error",
  ),

  entry(
    "s8-history-success",
    "S8",
    "모의고사 이력",
    "success",
    "/app/history",
    "/app/history",
    "screens/s8-history/success.html",
    "history.success",
  ),
  entry(
    "s8-history-empty",
    "S8",
    "모의고사 이력",
    "empty",
    "/app/history",
    "/app/history",
    "screens/s8-history/empty.html",
    "history.empty",
  ),
  entry(
    "s8-history-error",
    "S8",
    "모의고사 이력",
    "error",
    "/app/history",
    "/app/history",
    "screens/s8-history/error.html",
    "history.error",
  ),

  entry(
    "s9-leaderboard-success",
    "S9",
    "리더보드",
    "success",
    "/app/leaderboards/:certId?",
    "/app/leaderboards/dop-c02",
    "screens/s9-leaderboard/success.html",
    "leaderboard.success",
  ),
  entry(
    "s9-leaderboard-empty",
    "S9",
    "리더보드",
    "empty",
    "/app/leaderboards/:certId?",
    "/app/leaderboards/dop-c02",
    "screens/s9-leaderboard/empty.html",
    "leaderboard.empty",
  ),
  entry(
    "s9-leaderboard-private",
    "S9",
    "리더보드",
    "private",
    "/app/leaderboards/:certId?",
    "/app/leaderboards/dop-c02",
    "screens/s9-leaderboard/private.html",
    "presentation.leaderboardPrivate",
  ),
  entry(
    "s9-leaderboard-error",
    "S9",
    "리더보드",
    "error",
    "/app/leaderboards/:certId?",
    "/app/leaderboards/dop-c02",
    "screens/s9-leaderboard/error.html",
    "leaderboard.error",
  ),

  entry(
    "admin-users-success",
    "ADMIN-USERS",
    "승인 대기 사용자",
    "success",
    "/app/admin/users",
    "/app/admin/users",
    "screens/admin-users/success.html",
    "admin.users.success",
  ),
  entry(
    "admin-users-empty",
    "ADMIN-USERS",
    "승인 대기 사용자",
    "empty",
    "/app/admin/users",
    "/app/admin/users",
    "screens/admin-users/empty.html",
    "admin.users.empty",
  ),
  entry(
    "admin-users-error",
    "ADMIN-USERS",
    "승인 대기 사용자",
    "error",
    "/app/admin/users",
    "/app/admin/users",
    "screens/admin-users/error.html",
    "admin.users.error",
  ),

  entry(
    "s10-import-empty",
    "S10",
    "문제 은행 임포트",
    "empty",
    "/app/admin/import",
    "/app/admin/import",
    "screens/s10-admin-import/empty.html",
    "admin.import.empty",
  ),
  entry(
    "s10-import-validating",
    "S10",
    "문제 은행 임포트",
    "validating",
    "/app/admin/import",
    "/app/admin/import",
    "screens/s10-admin-import/validating.html",
    "presentation.importValidating",
  ),
  entry(
    "s10-import-valid",
    "S10",
    "문제 은행 임포트",
    "valid",
    "/app/admin/import",
    "/app/admin/import",
    "screens/s10-admin-import/valid.html",
    "admin.import.success",
  ),
  entry(
    "s10-import-invalid",
    "S10",
    "문제 은행 임포트",
    "invalid",
    "/app/admin/import",
    "/app/admin/import",
    "screens/s10-admin-import/invalid.html",
    "admin.import.error",
  ),
  entry(
    "s10-import-commit",
    "S10",
    "문제 은행 임포트",
    "commit",
    "/app/admin/import",
    "/app/admin/import",
    "screens/s10-admin-import/commit.html",
    "presentation.importCommit",
  ),
  entry(
    "s10-import-error",
    "S10",
    "문제 은행 임포트",
    "error",
    "/app/admin/import",
    "/app/admin/import",
    "screens/s10-admin-import/error.html",
    "admin.import.error",
  ),
] satisfies readonly StaticPreviewExportEntry[]);

export const STATIC_PREVIEW_ROUTE_PATTERNS = Object.freeze([
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
] as const);

export function getStaticPreviewExportEntry(id: string): StaticPreviewExportEntry {
  const found = STATIC_PREVIEW_EXPORT_MANIFEST.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`Unknown static preview entry: ${id}`);
  return found;
}

export function getStaticPreviewRouteEntries(
  routePattern: string,
): readonly StaticPreviewExportEntry[] {
  return STATIC_PREVIEW_EXPORT_MANIFEST.filter(
    (candidate) => candidate.routePattern === routePattern,
  );
}

export function relativeArtifactHref(fromFile: string, toFile: string): string {
  const fromDirectory = fromFile.split("/").slice(0, -1);
  const targetParts = toFile.split("/");
  let commonLength = 0;

  while (
    commonLength < fromDirectory.length &&
    commonLength < targetParts.length &&
    fromDirectory[commonLength] === targetParts[commonLength]
  ) {
    commonLength += 1;
  }

  const parentSegments = Array.from(
    { length: fromDirectory.length - commonLength },
    () => "..",
  );
  return [...parentSegments, ...targetParts.slice(commonLength)].join("/");
}

const primaryTargets = Object.freeze([
  ["홈", "s2-home-success"],
  ["이력", "s8-history-success"],
  ["리더보드", "s9-leaderboard-success"],
  ["관리", "admin-users-success"],
] as const);

const secondaryTargets = Object.freeze([
  ["모드 선택", "s3-mode-success"],
  ["연습", "s4-practice-unsubmitted"],
  ["모의고사", "s5-exam-active"],
  ["연습 결과", "s6-practice-result-success"],
  ["모의고사 결과", "s7-exam-result-success"],
  ["사용자 승인", "admin-users-success"],
  ["문제 임포트", "s10-import-empty"],
] as const);

export interface StaticArtifactLink {
  readonly label: string;
  readonly href: string;
  readonly targetId: string;
}

function artifactLinks(
  current: StaticPreviewExportEntry,
  targets: readonly (readonly [string, string])[],
): readonly StaticArtifactLink[] {
  return targets.map(([label, targetId]) => {
    const target = getStaticPreviewExportEntry(targetId);
    return Object.freeze({
      label,
      targetId,
      href: relativeArtifactHref(current.outputPath, target.outputPath),
    });
  });
}

export function createStaticArtifactNavigation(currentId: string) {
  const currentIndex = STATIC_PREVIEW_EXPORT_MANIFEST.findIndex(
    (candidate) => candidate.id === currentId,
  );
  if (currentIndex < 0) throw new Error(`Unknown static preview entry: ${currentId}`);

  const at = (index: number): StaticPreviewExportEntry => {
    const found = STATIC_PREVIEW_EXPORT_MANIFEST[index];
    if (found === undefined) {
      throw new Error(`Static preview manifest index is out of range: ${index}`);
    }
    return found;
  };
  const current = at(currentIndex);
  const previous = at(
    (currentIndex - 1 + STATIC_PREVIEW_EXPORT_MANIFEST.length) %
      STATIC_PREVIEW_EXPORT_MANIFEST.length,
  );
  const next = at((currentIndex + 1) % STATIC_PREVIEW_EXPORT_MANIFEST.length);

  return Object.freeze({
    galleryHref: relativeArtifactHref(current.outputPath, "index.html"),
    previous: Object.freeze({
      targetId: previous.id,
      href: relativeArtifactHref(current.outputPath, previous.outputPath),
    }),
    next: Object.freeze({
      targetId: next.id,
      href: relativeArtifactHref(current.outputPath, next.outputPath),
    }),
    primary: Object.freeze(artifactLinks(current, primaryTargets)),
    secondary: Object.freeze(artifactLinks(current, secondaryTargets)),
  });
}

export const STATIC_PREVIEW_GALLERY_LINKS = Object.freeze(
  STATIC_PREVIEW_EXPORT_MANIFEST.map((item) =>
    Object.freeze({
      id: item.id,
      screen: item.screen,
      title: item.title,
      variant: item.variant,
      href: relativeArtifactHref("index.html", item.outputPath),
    }),
  ),
);
