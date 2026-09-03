import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { useState } from "react";

import { CertQuizApiProvider } from "../api/CertQuizApiProvider";
import type { CertQuizApi } from "../api/port";
import { QuizStoreProvider, type QuizStoreApi } from "../quiz/quiz-store";
import { createCertQuizQueryClient } from "./query-client";

export type CertQuizCompositionRootProps = PropsWithChildren<{
  api: CertQuizApi;
  queryClient?: QueryClient;
  quizStore?: QuizStoreApi;
}>;

/** The only application boundary that selects adapters and owns request/transient state. */
export function CertQuizCompositionRoot({
  api,
  queryClient,
  quizStore,
  children,
}: CertQuizCompositionRootProps) {
  const [ownedQueryClient] = useState(createCertQuizQueryClient);

  return (
    <CertQuizApiProvider api={api}>
      <QueryClientProvider client={queryClient ?? ownedQueryClient}>
        <QuizStoreProvider store={quizStore}>{children}</QuizStoreProvider>
      </QueryClientProvider>
    </CertQuizApiProvider>
  );
}
