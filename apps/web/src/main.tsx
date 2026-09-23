import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { CertQuizCompositionRoot } from "./app/CertQuizCompositionRoot";
import { App } from "./App";
import {
  RuntimeConfigurationError,
  createWebRuntime,
  resolveWebRuntimeConfiguration,
  type WebRuntime,
  type WebRuntimeConfiguration,
} from "./runtime-config";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles.css";

function RuntimeConfigurationErrorScreen({ message }: { message: string }) {
  return (
    <main className="app-shell">
      <section
        className="route-card"
        aria-labelledby="runtime-configuration-error-title"
      >
        <p className="eyebrow">CONFIGURATION ERROR</p>
        <h1 id="runtime-configuration-error-title">
          웹 런타임 구성이 올바르지 않습니다.
        </h1>
        <div className="bootstrap-status bootstrap-status--error" role="alert">
          <strong>{message}</strong>
          <span>배포 설정을 확인한 후 페이지를 새로고침하세요.</span>
        </div>
      </section>
    </main>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("CertQuiz root element was not found");
}

const root = createRoot(rootElement);

async function loadRuntime(
  configuration: WebRuntimeConfiguration,
): Promise<WebRuntime> {
  if (configuration.mode === "http") return createWebRuntime(configuration);
  // Statically false in production builds, so the mock adapter and fixtures are dropped.
  if (import.meta.env.PROD) {
    throw new RuntimeConfigurationError(
      "Mock runtime mode is unavailable in a production build.",
    );
  }
  const { createMockWebRuntime } = await import("./runtime-mock");
  const searchParams = new URLSearchParams(window.location.search);
  return createMockWebRuntime({
    mockActor: searchParams.get("mockActor"),
    mockScenario: searchParams.get("mockScenario"),
  });
}

async function bootstrap() {
  const configuration = resolveWebRuntimeConfiguration(
    import.meta.env,
    window.location.origin,
  );
  const runtime = await loadRuntime(configuration);

  root.render(
    <StrictMode>
      <BrowserRouter>
        <CertQuizCompositionRoot
          api={runtime.api}
          runtimeMode={configuration.mode}
          browserAuthSession={runtime.browserAuthSession}
          authCallbackCapability={runtime.authCallbackCapability}
        >
          <App />
        </CertQuizCompositionRoot>
      </BrowserRouter>
    </StrictMode>,
  );
}

bootstrap().catch((error: unknown) => {
  if (error instanceof RuntimeConfigurationError) {
    root.render(<RuntimeConfigurationErrorScreen message={error.message} />);
  } else {
    throw error;
  }
});
