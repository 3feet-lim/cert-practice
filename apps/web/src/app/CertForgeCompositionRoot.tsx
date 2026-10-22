import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useState } from "react";

import { CertForgeApiProvider } from "../api/CertForgeApiProvider";
import type { BrowserAuthSession } from "../auth/cognito-pkce-session";
import type { CertForgeApi } from "../api/port";
import { type QuizStoreApi } from "../quiz/quiz-store";
import { QuizStoreProvider } from "../quiz/quiz-store-provider";
import { BrowserAuthSessionProvider } from "./browser-auth-session";
import {
  MockAuthCallbackProvider,
  type MockAuthCallbackCapability,
} from "./mock-auth-capability";
import { createCertForgeQueryClient } from "./query-client";
import { RuntimeModeProvider } from "./runtime-mode";
import type { WebRuntimeMode } from "../runtime-config";

export type CertForgeCompositionRootProps = PropsWithChildren<{
  api: CertForgeApi;
  /** Mock is the test default; browser bootstrap always supplies an explicit mode. */
  runtimeMode?: WebRuntimeMode;
  browserAuthSession?: BrowserAuthSession;
  authCallbackCapability?: MockAuthCallbackCapability;
  queryClient?: QueryClient;
  quizStore?: QuizStoreApi;
}>;

/** The only application boundary that selects adapters and owns request/transient state. */
export function CertForgeCompositionRoot({
  api,
  runtimeMode = "mock",
  browserAuthSession,
  authCallbackCapability,
  queryClient,
  quizStore,
  children,
}: CertForgeCompositionRootProps) {
  const [ownedQueryClient] = useState(createCertForgeQueryClient);

  return (
    <CertForgeApiProvider api={api}>
      <RuntimeModeProvider value={runtimeMode}>
        <BrowserAuthSessionProvider value={browserAuthSession}>
          <MockAuthCallbackProvider value={authCallbackCapability}>
            <QueryClientProvider client={queryClient ?? ownedQueryClient}>
              <QuizStoreProvider store={quizStore}>{children}</QuizStoreProvider>
            </QueryClientProvider>
          </MockAuthCallbackProvider>
        </BrowserAuthSessionProvider>
      </RuntimeModeProvider>
    </CertForgeApiProvider>
  );
}
