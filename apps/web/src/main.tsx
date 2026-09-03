import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { CertQuizCompositionRoot } from "./app/CertQuizCompositionRoot";
import { createMockCertQuizApi } from "./api/mock-adapter";
import { App } from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("CertQuiz root element was not found");
}

const api = createMockCertQuizApi();

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <CertQuizCompositionRoot api={api}>
        <App />
      </CertQuizCompositionRoot>
    </BrowserRouter>
  </StrictMode>,
);
