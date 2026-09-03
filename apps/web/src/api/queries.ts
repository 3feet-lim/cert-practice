import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { certQuizQueryKeys } from "../app/query-keys";
import { purgeCertQuizSession } from "../app/query-client";
import { useQuizStoreApi } from "../quiz/quiz-store";
import { resolveCertQuizResult } from "./query-result";
import { useCertQuizApi } from "./useCertQuizApi";

/** Each hook owns an independent TanStack Query loading/error state. */
export function useHealthQuery() {
  const api = useCertQuizApi();
  return useQuery({
    queryKey: certQuizQueryKeys.health(),
    queryFn: () => resolveCertQuizResult(api.getHealth()),
  });
}

export function useApprovalStatusQuery() {
  const api = useCertQuizApi();
  return useQuery({
    queryKey: certQuizQueryKeys.approval(),
    queryFn: () => resolveCertQuizResult(api.getApprovalStatus()),
  });
}

export function useCurrentUserQuery() {
  const api = useCertQuizApi();
  return useQuery({
    queryKey: certQuizQueryKeys.currentUser(),
    queryFn: () => resolveCertQuizResult(api.getCurrentUser()),
  });
}

export function useCatalogQuery() {
  const api = useCertQuizApi();
  return useQuery({
    queryKey: certQuizQueryKeys.catalog(),
    queryFn: () => resolveCertQuizResult(api.getCatalog()),
  });
}

export function useActivePracticeSessionsQuery() {
  const api = useCertQuizApi();
  return useQuery({
    queryKey: certQuizQueryKeys.activePracticeSessions(),
    queryFn: () => resolveCertQuizResult(api.listActivePracticeSessions()),
  });
}

/** Clears authenticated query data and all in-progress local quiz interaction state. */
export function useLogoutStatePurge() {
  const queryClient = useQueryClient();
  const quizStore = useQuizStoreApi();
  return useCallback(
    () => purgeCertQuizSession(queryClient, quizStore),
    [queryClient, quizStore],
  );
}
