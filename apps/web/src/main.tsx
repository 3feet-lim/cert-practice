import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { CertQuizCompositionRoot } from "./app/CertQuizCompositionRoot";
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
const authController = createMockAuthController(
  mockActor === "approved" || mockActor === "admin" ? mockActor : "unauthenticated",
);
const api = createMockCertQuizApi({
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
      <CertQuizCompositionRoot api={api} authCallbackCapability={authController}>
        <App />
      </CertQuizCompositionRoot>
    </BrowserRouter>
  </StrictMode>,
);
