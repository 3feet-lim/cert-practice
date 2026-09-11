import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { CertQuizCompositionRoot } from "./app/CertQuizCompositionRoot";
import {
  createHttpCertQuizApi,
  type BearerTokenProvider,
} from "./api/http-adapter";
import { createMockAuthController, createMockCertQuizApi } from "./api/mock-adapter";
import { App } from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("CertQuiz root element was not found");
}

const searchParams = new URLSearchParams(window.location.search);
const mockActor = searchParams.get("mockActor");
const e2eScenario = searchParams.get("mockScenario");
const useHttpApi = import.meta.env.VITE_CERTQUIZ_API_MODE === "http";
const authController = createMockAuthController(
  mockActor === "approved" || mockActor === "admin" ? mockActor : "unauthenticated",
);
const globalTokenProvider = (
  window as Window & { certQuizBearerTokenProvider?: BearerTokenProvider }
).certQuizBearerTokenProvider;
const api = useHttpApi
  ? createHttpCertQuizApi({
      baseUrl: import.meta.env.VITE_CERTQUIZ_API_BASE_URL ?? window.location.origin,
      getBearerToken: globalTokenProvider,
    })
  : createMockCertQuizApi({
      authController,
      e2eScenario:
        e2eScenario === "completed-results" ||
        e2eScenario === "catalog-loading" ||
        e2eScenario === "catalog-empty" ||
        e2eScenario === "catalog-retry-once"
          ? e2eScenario
          : undefined,
    });

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <CertQuizCompositionRoot
        api={api}
        authCallbackCapability={useHttpApi ? undefined : authController}
      >
        <App />
      </CertQuizCompositionRoot>
    </BrowserRouter>
  </StrictMode>,
);
