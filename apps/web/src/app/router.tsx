import { useCallback, useEffect, useState } from "react";
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
import { useCertQuizApi } from "../api/useCertQuizApi";
import {
  createAdminRequiredError,
  useAuthSession,
} from "./auth-session-context";
import { createLoginUrl, getSafeReturnUrl } from "./safe-return-url";

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
  if (state.status === "pending") return <Navigate replace to="/pending" />;
  if (state.status === "error") {
    return <CanonicalError error={state.error} onRetry={() => void refresh()} />;
  }
  return <Navigate replace to="/app" />;
}

function LoginRoute() {
  const { state, refresh } = useAuthSession();
  const [searchParams] = useSearchParams();
  const returnUrl = getSafeReturnUrl(`?returnTo=${encodeURIComponent(
    searchParams.get("returnTo") ?? "",
  )}`);

  if (state.status === "loading") return <LoadingRoute />;
  if (state.status === "pending") return <Navigate replace to="/pending" />;
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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const returnUrl = getSafeReturnUrl(location.search);

  if (searchParams.has("error")) {
    const error: CertQuizApiError = {
      code: "authentication-invalid",
      message: "로그인을 완료하지 못했습니다.",
      requestId: "frontend-auth-callback",
      retryable: false,
      nextAction: "로그인 화면에서 다시 시작하세요.",
    };
    return <CanonicalError error={error} />;
  }

  if (state.status === "loading") return <LoadingRoute />;
  if (state.status === "pending") return <Navigate replace to="/pending" />;
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

  if (state.status === "loading") return <LoadingRoute />;
  if (state.status === "unauthenticated") return <Navigate replace to="/login" />;
  if (state.status === "approved") return <Navigate replace to="/app" />;
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
  if (state.status === "pending") return <Navigate replace to="/pending" />;
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
  const { state } = useAuthSession();
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

function ScreenPlaceholder({ screen, title }: { screen: string; title: string }) {
  return (
    <section className="route-card" aria-labelledby={`${screen}-title`} data-screen={screen}>
      <p className="eyebrow">{screen}</p>
      <h1 id={`${screen}-title`}>{title}</h1>
      <p className="description">이 화면은 typed API port를 통해 데이터를 불러옵니다.</p>
    </section>
  );
}

type BootstrapState =
  | { status: "loading" }
  | { status: "ready"; contractVersion: string }
  | { status: "error"; message: string };

function HomePage() {
  const api = useCertQuizApi();
  const [bootstrap, setBootstrap] = useState<BootstrapState>({ status: "loading" });

  const checkHealth = useCallback(async () => {
    setBootstrap({ status: "loading" });
    const result = await api.getHealth();
    setBootstrap(
      result.ok
        ? { status: "ready", contractVersion: result.data.contractVersion }
        : { status: "error", message: result.error.message },
    );
  }, [api]);

  useEffect(() => {
    let active = true;
    void api.getHealth().then((result) => {
      if (active) {
        setBootstrap(
          result.ok
            ? { status: "ready", contractVersion: result.data.contractVersion }
            : { status: "error", message: result.error.message },
        );
      }
    });
    return () => {
      active = false;
    };
  }, [api]);

  return (
    <section className="welcome-card" aria-labelledby="welcome-title" data-screen="S2">
      <p className="eyebrow">CERTQUIZ</p>
      <h1 id="welcome-title">클라우드 자격증 연습을 시작하세요.</h1>
      <p className="description">사용 가능한 자격증을 Provider별로 확인할 수 있습니다.</p>
      {bootstrap.status === "loading" ? (
        <p className="bootstrap-status" role="status">
          프론트엔드 bootstrap을 확인하는 중입니다.
        </p>
      ) : bootstrap.status === "ready" ? (
        <div className="bootstrap-status bootstrap-status--ready" role="status">
          <strong>Mock health contract 연결 완료</strong>
          <span>workspace · bundle · schema validation ({bootstrap.contractVersion})</span>
        </div>
      ) : (
        <div className="bootstrap-status bootstrap-status--error" role="alert">
          <strong>Bootstrap 확인에 실패했습니다.</strong>
          <span>{bootstrap.message}</span>
          <button type="button" onClick={() => void checkHealth()}>
            다시 확인
          </button>
        </div>
      )}
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
          <Route index element={<HomePage />} />
          <Route
            path="certifications/:id"
            element={<ScreenPlaceholder screen="S3" title="학습 모드 선택" />}
          />
          <Route
            path="practice/:sessionId"
            element={<ScreenPlaceholder screen="S4" title="연습 모드" />}
          />
          <Route
            path="exams/:sessionId"
            element={<ScreenPlaceholder screen="S5" title="모의고사" />}
          />
          <Route
            path="practice-results/:id"
            element={<ScreenPlaceholder screen="S6" title="연습 결과" />}
          />
          <Route
            path="attempts/:id"
            element={<ScreenPlaceholder screen="S7" title="모의고사 결과" />}
          />
          <Route
            path="history"
            element={<ScreenPlaceholder screen="S8" title="모의고사 이력" />}
          />
          <Route
            path="leaderboards/:certId?"
            element={<ScreenPlaceholder screen="S9" title="리더보드" />}
          />
          <Route element={<AdminRouteGuard />}>
            <Route path="admin" element={<AdminLayout />}>
              <Route
                path="users"
                element={
                  <ScreenPlaceholder screen="ADMIN-USERS" title="승인 대기 사용자" />
                }
              />
              <Route
                path="import"
                element={<ScreenPlaceholder screen="S10" title="문제 은행 임포트" />}
              />
            </Route>
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}
