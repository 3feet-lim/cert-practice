import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";

import { AuthSessionProvider } from "./app/auth-session";

const AppRoutes = lazy(() =>
  import("./app/router").then(({ AppRoutes: Routes }) => ({ default: Routes })),
);
// Static review previews are a development aid; production builds drop them entirely.
const StaticPreviewRoutes = import.meta.env.PROD
  ? null
  : lazy(() =>
      import("./preview/StaticPreviewRoutes").then(
        ({ StaticPreviewRoutes: Routes }) => ({
          default: Routes,
        }),
      ),
    );

function LoadingApp() {
  return (
    <main className="app-shell">
      <section className="route-card" aria-busy="true">
        <p role="status">화면을 불러오는 중입니다.</p>
      </section>
    </main>
  );
}

export function App() {
  const [searchParams] = useSearchParams();
  const preview =
    StaticPreviewRoutes !== null &&
    (searchParams.has("preview") || searchParams.has("fixture"));

  return (
    <Suspense fallback={<LoadingApp />}>
      {preview && StaticPreviewRoutes ? (
        <StaticPreviewRoutes />
      ) : (
        <AuthSessionProvider>
          <AppRoutes />
        </AuthSessionProvider>
      )}
    </Suspense>
  );
}
