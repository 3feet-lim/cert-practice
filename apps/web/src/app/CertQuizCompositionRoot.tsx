import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useState } from "react";

import { CertQuizApiProvider } from "../api/CertQuizApiProvider";
import type { CertQuizApi } from "../api/port";
import { type QuizStoreApi } from "../quiz/quiz-store";
import { QuizStoreProvider } from "../quiz/quiz-store-provider";
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
  authCallbackCapability?: MockAuthCallbackCapability;
  queryClient?: QueryClient;
  quizStore?: QuizStoreApi;
}>;

/** The only application boundary that selects adapters and owns request/transient state. */
export function CertQuizCompositionRoot({
  api,
  runtimeMode = "mock",
  authCallbackCapability,
  queryClient,
  quizStore,
  children,
}: CertQuizCompositionRootProps) {
  const [ownedQueryClient] = useState(createCertQuizQueryClient);

  return (
    <CertQuizApiProvider api={api}>
      <RuntimeModeProvider value={runtimeMode}>
        <MockAuthCallbackProvider value={authCallbackCapability}>
          <QueryClientProvider client={queryClient ?? ownedQueryClient}>
            <QuizStoreProvider store={quizStore}>{children}</QuizStoreProvider>
          </QueryClientProvider>
        </MockAuthCallbackProvider>
      </RuntimeModeProvider>
    </CertQuizApiProvider>
  );
}
