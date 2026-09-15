import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useState } from "react";

import { CertQuizApiProvider } from "../api/CertQuizApiProvider";
import type { BrowserAuthSession } from "../auth/cognito-pkce-session";
import type { CertQuizApi } from "../api/port";
import { type QuizStoreApi } from "../quiz/quiz-store";
import { QuizStoreProvider } from "../quiz/quiz-store-provider";
import { BrowserAuthSessionProvider } from "./browser-auth-session";
import {
  MockAuthCallbackProvider,
  type MockAuthCallbackCapability,
} from "./mock-auth-capability";
import { createCertQuizQueryClient } from "./query-client";
import { RuntimeModeProvider } from "./runtime-mode";
import type { WebRuntimeMode } from "../runtime-config";

export type CertQuizCompositionRootProps = PropsWithChildren<{
  api: CertQuizApi;
  /** Mock is the test default; browser bootstrap always supplies an explicit mode. */
  runtimeMode?: WebRuntimeMode;
  browserAuthSession?: BrowserAuthSession;
  authCallbackCapability?: MockAuthCallbackCapability;
  queryClient?: QueryClient;
  quizStore?: QuizStoreApi;
}>;

/** The only application boundary that selects adapters and owns request/transient state. */
export function CertQuizCompositionRoot({
  api,
  runtimeMode = "mock",
  browserAuthSession,
  authCallbackCapability,
  queryClient,
  quizStore,
  children,
}: CertQuizCompositionRootProps) {
  const [ownedQueryClient] = useState(createCertQuizQueryClient);

  return (
    <CertQuizApiProvider api={api}>
      <RuntimeModeProvider value={runtimeMode}>
        <BrowserAuthSessionProvider value={browserAuthSession}>
          <MockAuthCallbackProvider value={authCallbackCapability}>
            <QueryClientProvider client={queryClient ?? ownedQueryClient}>
              <QuizStoreProvider store={quizStore}>{children}</QuizStoreProvider>
            </QueryClientProvider>
          </MockAuthCallbackProvider>
        </BrowserAuthSessionProvider>
      </RuntimeModeProvider>
    </CertQuizApiProvider>
  );
}
