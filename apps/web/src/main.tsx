import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { CertQuizCompositionRoot } from "./app/CertQuizCompositionRoot";
import { App } from "./App";
import { RuntimeConfigurationErrorScreen } from "./components/RuntimeConfigurationErrorScreen";
import {
  RuntimeConfigurationError,
  createWebRuntime,
  resolveWebRuntimeConfiguration,
  type WebRuntime,
  type WebRuntimeConfiguration,
} from "./runtime-config";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles.css";

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
