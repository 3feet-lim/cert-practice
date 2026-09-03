import { useSearchParams } from "react-router-dom";

import { AuthSessionProvider } from "./app/auth-session";
import { AppRoutes } from "./app/router";
import { StaticPreviewRoutes } from "./preview/StaticPreviewRoutes";

export function App() {
  const [searchParams] = useSearchParams();

  if (searchParams.has("preview") || searchParams.has("fixture")) {
    return <StaticPreviewRoutes />;
  }

  return (
    <AuthSessionProvider>
      <AppRoutes />
    </AuthSessionProvider>
  );
}
