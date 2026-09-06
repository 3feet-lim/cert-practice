import { useEffect } from "react";
import {
  Link,
  Navigate,
  NavLink,
  Outlet,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from "react-router-dom";

import type { CertQuizApiError } from "../api/port";
import { ImportPage } from "../admin/ImportPage";
import { PendingUsersPage } from "../admin/PendingUsersPage";
import {
  AttemptResultPage,
  HistoryPage,
  LeaderboardPage,
  PracticeResultPage,
} from "./ResultHistoryLeaderboardPages";
import { CatalogHomePage, ModeSelectPage } from "./CatalogModePages";
import { ExamPage } from "../quiz/ExamPage";
import { PracticePage } from "../quiz/PracticePage";
import { createAdminRequiredError, useAuthSession } from "./auth-session-context";
import { useMockAuthCallback } from "./mock-auth-capability";
import { createLoginUrl, createPendingUrl, getSafeReturnUrl } from "./safe-return-url";

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
  return (
    <main className="app-shell">
      <section className="route-card" aria-labelledby="login-title" data-screen="S1">
        <p className="eyebrow">CERTQUIZ</p>
        <h1 id="login-title">Google 계정으로 로그인</h1>
        <p className="description">
          승인된 사용자는 개인 연습 세션과 모의고사 이력을 이용할 수 있습니다.
        </p>
        <Link
          className="primary-link"
          to={`/auth/callback?returnTo=${encodeURIComponent(returnUrl)}`}
        >
          Google 로그인 계속하기
        </Link>
      </section>
    </main>
  );
}
function CallbackRoute() {
  const { state, refresh } = useAuthSession();
  const mockAuthCallback = useMockAuthCallback();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const returnUrl = getSafeReturnUrl(location.search);
  const hasCallbackError = searchParams.has("error");

  useEffect(() => {
    if (
      !hasCallbackError &&
      mockAuthCallback !== undefined &&
      state.status === "unauthenticated"
    ) {
      mockAuthCallback.completeMockLogin();
      void refresh();
    }
  }, [hasCallbackError, mockAuthCallback, refresh, state.status]);

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
  const callbackError: CertQuizApiError = {
    code: "authentication-invalid",
    message: "로그인 세션을 확인할 수 없습니다.",
    requestId: "frontend-auth-callback",
    retryable: false,
    nextAction: "로그인 화면에서 다시 시작하세요.",
  };
  return <CanonicalError error={callbackError} />;
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
    <main className="app-shell">
      <section className="route-card" aria-labelledby="pending-title">
        <p className="eyebrow">APPROVAL PENDING</p>
        <h1 id="pending-title">관리자 승인을 기다리고 있습니다.</h1>
        <p className="description">
          승인 전에는 승인 상태 조회 외의 보호된 기능을 사용할 수 없습니다.
        </p>
        <button className="primary-button" type="button" onClick={() => void refresh()}>
          승인 상태 새로고침
        </button>
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
function ApprovedLayout() {
  const { state, logout } = useAuthSession();
  if (state.status !== "approved") return null;
  return (
    <div className="approved-shell">
      <header className="app-header">
        <Link className="brand-link" to="/app">
          CERTQUIZ
        </Link>
        <nav aria-label="주요 메뉴">
          <NavLink to="/app">홈</NavLink>
          <NavLink to="/app/history">이력</NavLink>
          <NavLink to="/app/leaderboards">리더보드</NavLink>
          {state.user.role === "admin" ? (
            <NavLink to="/app/admin/users">관리</NavLink>
          ) : null}
        </nav>
        <span>{state.user.displayName}</span>
        <button type="button" onClick={() => void logout()}>
          로그아웃
        </button>
      </header>
      <main className="route-content">
        <Outlet />
      </main>
    </div>
  );
}
function AdminLayout() {
  return (
    <section aria-labelledby="admin-layout-title">
      <p className="eyebrow">ADMIN</p>
      <h1 id="admin-layout-title">관리자 콘솔</h1>
      <nav aria-label="관리 메뉴" className="sub-navigation">
        <NavLink to="/app/admin/users">승인 대기 사용자</NavLink>
        <NavLink to="/app/admin/import">문제 은행 임포트</NavLink>
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
  );
}
