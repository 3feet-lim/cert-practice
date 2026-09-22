import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import type { CertQuizApiError } from "../api/port";
import { Button } from "../components/ui/Button";
import { createAdminRequiredError, useAuthSession } from "./auth-session-context";
import { useBrowserAuthSession } from "./browser-auth-session";
import { useMockAuthCallback } from "./mock-auth-capability";
import { useRuntimeMode } from "./runtime-mode";
import { createLoginUrl, createPendingUrl, getSafeReturnUrl } from "./safe-return-url";

const ImportPage = lazy(() =>
  import("../admin/ImportPage").then(({ ImportPage: Page }) => ({ default: Page })),
);
const PendingUsersPage = lazy(() =>
  import("../admin/PendingUsersPage").then(({ PendingUsersPage: Page }) => ({
    default: Page,
  })),
);
const ExamPage = lazy(() =>
  import("../quiz/ExamPage").then(({ ExamPage: Page }) => ({ default: Page })),
);
const PracticePage = lazy(() =>
  import("../quiz/PracticePage").then(({ PracticePage: Page }) => ({
    default: Page,
  })),
);
const CatalogHomePage = lazy(() =>
  import("./CatalogModePages").then(({ CatalogHomePage: Page }) => ({ default: Page })),
);
const ModeSelectPage = lazy(() =>
  import("./CatalogModePages").then(({ ModeSelectPage: Page }) => ({ default: Page })),
);
const PracticeResultPage = lazy(() =>
  import("./ResultHistoryLeaderboardPages").then(({ PracticeResultPage: Page }) => ({
    default: Page,
  })),
);
const AttemptResultPage = lazy(() =>
  import("./ResultHistoryLeaderboardPages").then(({ AttemptResultPage: Page }) => ({
    default: Page,
  })),
);
const HistoryPage = lazy(() =>
  import("./ResultHistoryLeaderboardPages").then(({ HistoryPage: Page }) => ({
    default: Page,
  })),
);
const LeaderboardPage = lazy(() =>
  import("./ResultHistoryLeaderboardPages").then(({ LeaderboardPage: Page }) => ({
    default: Page,
  })),
);

function LoadingRoute() {
  return (
    <main className="app-shell">
      <section className="route-card" aria-busy="true">
        <p role="status">계정 상태를 확인하는 중입니다.</p>
      </section>
    </main>
  );
}
function CanonicalError({
  error,
  onRetry,
}: {
  error: CertQuizApiError;
  onRetry?: () => void;
}) {
  return (
    <main className="app-shell">
      <section className="route-card" aria-labelledby="route-error-title">
        <p className="eyebrow">{error.code}</p>
        <h1 id="route-error-title">요청을 계속할 수 없습니다.</h1>
        <div className="bootstrap-status bootstrap-status--error" role="alert">
          <strong>{error.message}</strong>
          {error.nextAction === undefined ? null : <span>{error.nextAction}</span>}
          {error.retryable && onRetry !== undefined ? (
            <button type="button" onClick={onRetry}>
              다시 시도
            </button>
          ) : (
            <Link to="/app">학습 홈으로 돌아가기</Link>
          )}
        </div>
      </section>
    </main>
  );
}
function RootRedirect() {
  const { state, refresh } = useAuthSession();
  if (state.status === "loading") return <LoadingRoute />;
  if (state.status === "unauthenticated") return <Navigate replace to="/login" />;
  if (state.status === "pending") {
    return <Navigate replace to={createPendingUrl("/app")} />;
  }
  if (state.status === "error") {
    return <CanonicalError error={state.error} onRetry={() => void refresh()} />;
  }
  return <Navigate replace to="/app" />;
}
function LoginRoute() {
  const { state, refresh } = useAuthSession();
  const runtimeMode = useRuntimeMode();
  const browserAuthSession = useBrowserAuthSession();
  const navigate = useNavigate();
  const [loginError, setLoginError] = useState(false);
  const [searchParams] = useSearchParams();
  const returnUrl = getSafeReturnUrl(
    `?returnTo=${encodeURIComponent(searchParams.get("returnTo") ?? "")}`,
  );
  if (state.status === "loading") return <LoadingRoute />;
  if (state.status === "pending") {
    return <Navigate replace to={createPendingUrl(returnUrl)} />;
  }
  if (state.status === "approved") return <Navigate replace to={returnUrl} />;
  if (state.status === "error") {
    return <CanonicalError error={state.error} onRetry={() => void refresh()} />;
  }
  const beginLogin = () => {
    if (runtimeMode === "mock") {
      navigate(`/auth/callback?returnTo=${encodeURIComponent(returnUrl)}`);
      return;
    }
    if (!browserAuthSession) {
      setLoginError(true);
      return;
    }
    void browserAuthSession.beginLogin(returnUrl).catch(() => setLoginError(true));
  };
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8 sm:px-8 lg:px-12">
      <section
        className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-border bg-card shadow-[0_24px_80px_rgb(15_23_42_/_0.12)] lg:min-h-[34rem] lg:grid-cols-[1.15fr_0.85fr]"
        aria-labelledby="login-title"
        data-screen="S1"
      >
        <div className="relative flex flex-col justify-between overflow-hidden bg-slate-950 p-8 text-white sm:p-12 lg:p-16">
          <div
            aria-hidden="true"
            className="absolute -right-24 -top-24 size-72 rounded-full bg-indigo-500/20 blur-3xl"
          />
          <div className="relative">
            <div className="mb-12 grid size-12 place-items-center rounded-xl bg-primary text-base font-black text-primary-foreground shadow-lg shadow-indigo-950/30">
              CF
            </div>
            <h1
              id="login-title"
              className="text-5xl font-extrabold tracking-tight sm:text-6xl"
            >
              CertForge
            </h1>
            <p className="mt-4 text-lg font-semibold italic text-indigo-200">
              Forge. Sharpen. Certify.
            </p>
          </div>
          <div className="relative mt-16 max-w-md border-l-2 border-indigo-400 pl-5">
            <p className="text-lg font-medium leading-8 text-slate-200">
              문제은행부터 실전 모의고사까지,
              <br />
              합격을 위한 훈련을 한곳에서.
            </p>
          </div>
        </div>

        <div className="flex items-center p-8 sm:p-12 lg:p-16">
          <div className="w-full">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-primary">
              Welcome
            </p>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-foreground">
              Google 계정으로 로그인
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              학습을 계속하려면 Google 계정으로 시작하세요.
            </p>
            <Button className="mt-8 min-h-12 w-full gap-3 text-base" onClick={beginLogin}>
              <span
                aria-hidden="true"
                className="grid size-6 place-items-center rounded-full bg-white text-sm font-black text-primary"
              >
                G
              </span>
              Google 로그인 계속하기
            </Button>
            {loginError ? (
              <p className="mt-4 text-sm font-medium text-danger" role="alert">
                로그인 시작에 실패했습니다. 다시 시도하세요.
              </p>
            ) : null}
          </div>
        </div>
      </section>
    </main>
  );
}
function CallbackRoute() {
  const { state, refresh } = useAuthSession();
  const runtimeMode = useRuntimeMode();
  const browserAuthSession = useBrowserAuthSession();
  const mockAuthCallback = useMockAuthCallback();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const callbackStarted = useRef(false);
  const [callbackResult, setCallbackResult] = useState<
    "processing" | "failed" | { returnTo: string }
  >("processing");
  const returnUrl = getSafeReturnUrl(location.search);
  const hasCallbackError = searchParams.has("error");

  useEffect(() => {
    if (
      runtimeMode === "mock" &&
      !hasCallbackError &&
      mockAuthCallback !== undefined &&
      state.status === "unauthenticated"
    ) {
      mockAuthCallback.completeMockLogin();
      void refresh();
    }
  }, [hasCallbackError, mockAuthCallback, refresh, runtimeMode, state.status]);

  useEffect(() => {
    if (runtimeMode !== "http" || !browserAuthSession || callbackStarted.current) return;
    callbackStarted.current = true;
    const callbackSearch = location.search;
    window.history.replaceState(null, "", location.pathname);
    void browserAuthSession.completeCallback(callbackSearch).then(async (result) => {
      if (!result.ok) {
        setCallbackResult("failed");
        return;
      }
      await refresh();
      setCallbackResult({
        returnTo: getSafeReturnUrl(`?returnTo=${encodeURIComponent(result.returnTo)}`),
      });
    });
  }, [browserAuthSession, location.pathname, location.search, refresh, runtimeMode]);

  if (runtimeMode === "mock") {
    if (hasCallbackError) {
      const error: CertQuizApiError = {
        code: "authentication-invalid",
        message: "로그인을 완료하지 못했습니다.",
        requestId: "frontend-auth-callback",
        retryable: false,
        nextAction: "로그인 화면에서 다시 시작하세요.",
      };
      return <CanonicalError error={error} />;
    }
    if (
      state.status === "loading" ||
      (mockAuthCallback !== undefined && state.status === "unauthenticated")
    ) {
      return <LoadingRoute />;
    }
    if (state.status === "pending") {
      return <Navigate replace to={createPendingUrl(returnUrl)} />;
    }
    if (state.status === "approved") return <Navigate replace to={returnUrl} />;
    if (state.status === "error") {
      return <CanonicalError error={state.error} onRetry={() => void refresh()} />;
    }
    return (
      <CanonicalError
        error={{
          code: "authentication-invalid",
          message: "로그인 세션을 확인할 수 없습니다.",
          requestId: "frontend-auth-callback",
          retryable: false,
          nextAction: "로그인 화면에서 다시 시작하세요.",
        }}
      />
    );
  }

  if (callbackResult === "processing" || state.status === "loading") return <LoadingRoute />;
  if (callbackResult === "failed" || !browserAuthSession) {
    return (
      <CanonicalError
        error={{
          code: "authentication-invalid",
          message: "로그인을 완료하지 못했습니다.",
          requestId: "frontend-auth-callback",
          retryable: false,
          nextAction: "로그인 화면에서 다시 시작하세요.",
        }}
      />
    );
  }
  if (state.status === "pending") {
    return <Navigate replace to={createPendingUrl(callbackResult.returnTo)} />;
  }
  if (state.status === "approved") {
    return <Navigate replace to={callbackResult.returnTo} />;
  }
  if (state.status === "error") {
    return <CanonicalError error={state.error} onRetry={() => void refresh()} />;
  }
  return (
    <CanonicalError
      error={{
        code: "authentication-invalid",
        message: "로그인 세션을 확인할 수 없습니다.",
        requestId: "frontend-auth-callback",
        retryable: false,
        nextAction: "로그인 화면에서 다시 시작하세요.",
      }}
    />
  );
}
function PendingRoute() {
  const { state, refresh } = useAuthSession();
  const location = useLocation();
  const returnUrl = getSafeReturnUrl(location.search);
  if (state.status === "loading") return <LoadingRoute />;
  if (state.status === "unauthenticated") {
    return <Navigate replace to={createLoginUrl(returnUrl)} />;
  }
  if (state.status === "approved") return <Navigate replace to={returnUrl} />;
  if (state.status === "error") {
    return <CanonicalError error={state.error} onRetry={() => void refresh()} />;
  }
  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 py-8 sm:px-8">
      <section
        className="w-full max-w-xl rounded-2xl border border-border bg-card p-8 shadow-card sm:p-10"
        aria-labelledby="pending-title"
      >
        <div className="mb-6 grid size-11 place-items-center rounded-xl bg-warning-soft text-lg font-black text-warning">
          !
        </div>
        <p className="text-xs font-extrabold uppercase tracking-[0.16em] text-warning">
          Approval required
        </p>
        <h1 id="pending-title" className="mt-3 text-3xl font-bold tracking-tight">
          관리자에게 승인을 요청해 주세요.
        </h1>
        <p className="mt-4 leading-7 text-muted-foreground">
          승인이 완료되면 문제은행, 연습 모드, 모의고사를 사용할 수 있습니다.
          관리자에게 승인을 요청한 뒤 아래 버튼으로 상태를 확인하세요.
        </p>
        <Button className="mt-8" onClick={() => void refresh()}>
          승인 상태 확인하기
        </Button>
      </section>
    </main>
  );
}
/** UX navigation only. API authentication and authorization remain canonical. */
function ApprovedRouteGuard() {
  const { state, refresh } = useAuthSession();
  const location = useLocation();
  if (state.status === "loading") return <LoadingRoute />;
  if (state.status === "unauthenticated") {
    const returnUrl = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate replace to={createLoginUrl(returnUrl)} />;
  }
  if (state.status === "pending") {
    const returnUrl = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate replace to={createPendingUrl(returnUrl)} />;
  }
  if (state.status === "error") {
    return <CanonicalError error={state.error} onRetry={() => void refresh()} />;
  }
  return <Outlet />;
}
/** UX role hint only; every admin API still enforces the server-side role. */
function AdminRouteGuard() {
  const { state } = useAuthSession();
  if (state.status !== "approved") return <LoadingRoute />;
  if (state.user.role !== "admin") {
    return <CanonicalError error={createAdminRequiredError()} />;
  }
  return <Outlet />;
}

const navigationLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    "rounded-md px-3 py-2 text-sm font-semibold transition-colors",
    "focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30",
    isActive
      ? "bg-primary-soft text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  ].join(" ");

function ApprovedLayout() {
  const { state, logout } = useAuthSession();
  if (state.status !== "approved") return null;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-2 font-semibold text-primary-foreground shadow-card focus:translate-y-0 focus:outline-none focus:ring-3 focus:ring-focus/30"
      >
        본문으로 건너뛰기
      </a>
      <header className="border-b border-border bg-card shadow-sm" role="banner">
        <div className="mx-auto flex min-h-18 max-w-screen-2xl items-center gap-8 px-8">
          <Link
            className="inline-flex items-center gap-3 rounded-md text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-focus/30"
            to="/app"
          >
            <span
              aria-hidden="true"
              className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-black text-primary-foreground shadow-sm"
            >
              CF
            </span>
            <span className="grid leading-tight">
              <span className="text-base font-extrabold tracking-tight">CertForge</span>
              <span className="text-[0.65rem] font-semibold italic text-muted-foreground">
                Forge. Sharpen. Certify.
              </span>
            </span>
          </Link>
          <nav aria-label="주요 메뉴" className="flex items-center gap-1">
            <NavLink className={navigationLinkClass} end to="/app">
              홈
            </NavLink>
            <NavLink className={navigationLinkClass} to="/app/history">
              이력
            </NavLink>
            <NavLink className={navigationLinkClass} to="/app/leaderboards">
              리더보드
            </NavLink>
            {state.user.role === "admin" ? (
              <NavLink className={navigationLinkClass} to="/app/admin/users">
                관리
              </NavLink>
            ) : null}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              {state.user.displayName}
            </span>
            <Button variant="ghost" onClick={() => void logout()}>
              로그아웃
            </Button>
          </div>
        </div>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-screen-2xl px-8 py-10 focus:outline-none"
      >
        <Outlet />
      </main>
    </div>
  );
}
function AdminLayout() {
  return (
    <section aria-labelledby="admin-layout-title" className="grid gap-6">
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.14em] text-primary">
          Admin
        </p>
        <h1 id="admin-layout-title" className="text-3xl">
          관리자 콘솔
        </h1>
      </div>
      <nav
        aria-label="관리 메뉴"
        className="flex items-center gap-1 border-b border-border pb-4"
      >
        <NavLink className={navigationLinkClass} to="/app/admin/users">
          승인 대기 사용자
        </NavLink>
        <NavLink className={navigationLinkClass} to="/app/admin/import">
          문제 은행 임포트
        </NavLink>
      </nav>
      <Outlet />
    </section>
  );
}
function NotFoundRoute() {
  return (
    <main className="app-shell">
      <section className="route-card">
        <h1>페이지를 찾을 수 없습니다.</h1>
        <Link to="/">시작 화면으로 이동</Link>
      </section>
    </main>
  );
}
export function AppRoutes() {
  return (
    <Suspense fallback={<LoadingRoute />}>
      <Routes>
        <Route index element={<RootRedirect />} />
        <Route path="login" element={<LoginRoute />} />
        <Route path="auth/callback" element={<CallbackRoute />} />
        <Route path="pending" element={<PendingRoute />} />
        <Route element={<ApprovedRouteGuard />}>
          <Route path="app" element={<ApprovedLayout />}>
            <Route index element={<CatalogHomePage />} />
            <Route path="certifications/:id" element={<ModeSelectPage />} />
            <Route path="practice/:sessionId" element={<PracticePage />} />
            <Route path="exams/:sessionId" element={<ExamPage />} />
            <Route path="practice-results/:id" element={<PracticeResultPage />} />
            <Route path="attempts/:id" element={<AttemptResultPage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="leaderboards/:certId?" element={<LeaderboardPage />} />
            <Route element={<AdminRouteGuard />}>
              <Route path="admin" element={<AdminLayout />}>
                <Route path="users" element={<PendingUsersPage />} />
                <Route path="import" element={<ImportPage />} />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="*" element={<NotFoundRoute />} />
      </Routes>
    </Suspense>
  );
}
