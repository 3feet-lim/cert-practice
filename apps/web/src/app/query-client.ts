import { QueryClient } from "@tanstack/react-query";

import type { QuizStoreApi } from "../quiz/quiz-store";
import { certQuizQueryKeys } from "./query-keys";

/** Creates an isolated client so tests and application roots never share request state. */
export function createCertQuizQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

/** Removes all authenticated server and transient quiz state during logout. */
export async function purgeCertQuizSession(
  queryClient: QueryClient,
  quizStore: QuizStoreApi,
) {
  await queryClient.cancelQueries({ queryKey: certQuizQueryKeys.all });
  queryClient.removeQueries({ queryKey: certQuizQueryKeys.all });
  quizStore.getState().reset();
}
