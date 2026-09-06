import type {
  ApproveUserResponse,
  CommitImportRequest,
  CurrentUserDto,
  DryRunImportRequest,
  ExamResultDto,
  HistoryCursor,
  HistoryPageDto,
  HistoryTrendsDto,
  LeaderboardDto,
  PendingUsersDto,
  PracticeResultDto,
  Uuid,
} from "@cert-quiz/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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

export function usePracticeResultQuery(resultId: Uuid) {
  const api = useCertQuizApi();
  return useQuery<PracticeResultDto>({
    queryKey: certQuizQueryKeys.practiceResult(resultId),
    queryFn: () => resolveCertQuizResult(api.getPracticeResult({ resultId })),
  });
}

export function useAttemptQuery(attemptId: Uuid) {
  const api = useCertQuizApi();
  return useQuery<ExamResultDto>({
    queryKey: certQuizQueryKeys.attempt(attemptId),
    queryFn: () => resolveCertQuizResult(api.getAttempt({ attemptId })),
  });
}

export function useHistoryQuery(cursor?: HistoryCursor) {
  const api = useCertQuizApi();
  return useQuery<HistoryPageDto>({
    queryKey: certQuizQueryKeys.history(cursor),
    queryFn: () =>
      resolveCertQuizResult(api.getHistory({ ...(cursor ? { cursor } : {}) })),
  });
}

export function useHistoryTrendsQuery() {
  const api = useCertQuizApi();
  return useQuery<HistoryTrendsDto>({
    queryKey: certQuizQueryKeys.historyTrends(),
    queryFn: () => resolveCertQuizResult(api.getHistoryTrends()),
  });
}

export function useLeaderboardQuery(certificationId?: Uuid) {
  const api = useCertQuizApi();
  return useQuery<LeaderboardDto>({
    queryKey: certificationId
      ? certQuizQueryKeys.leaderboard(certificationId)
      : ["cert-quiz", "leaderboard", "unselected"],
    enabled: certificationId !== undefined,
    queryFn: () => {
      if (!certificationId) throw new Error("A certification must be selected first.");
      return resolveCertQuizResult(api.getLeaderboard({ certificationId }));
    },
  });
}

type VisibilityMutationContext = { previous: CurrentUserDto };

/** Optimistically updates the profile cache and restores it if the server rejects the change. */
export function useScoreVisibilityMutation() {
  const api = useCertQuizApi();
  const queryClient = useQueryClient();
  const currentUserKey = certQuizQueryKeys.currentUser();

  return useMutation<
    { scorePublic: boolean; stateVersion: number },
    Error,
    { scorePublic: boolean },
    VisibilityMutationContext
  >({
    mutationFn: ({ scorePublic }) => {
      const currentUser = queryClient.getQueryData<CurrentUserDto>(currentUserKey);
      if (!currentUser)
        throw new Error("Current user must be loaded before changing visibility.");
      return resolveCertQuizResult(
        api.updateScoreVisibility({
          scorePublic,
          expectedVersion: currentUser.stateVersion,
        }),
      );
    },
    onMutate: async ({ scorePublic }) => {
      await queryClient.cancelQueries({ queryKey: currentUserKey });
      const previous = queryClient.getQueryData<CurrentUserDto>(currentUserKey);
      if (!previous)
        throw new Error("Current user must be loaded before changing visibility.");
      queryClient.setQueryData<CurrentUserDto>(currentUserKey, {
        ...previous,
        scorePublic,
      });
      return { previous };
    },
    onSuccess: (canonical) => {
      queryClient.setQueryData<CurrentUserDto>(currentUserKey, (currentUser) =>
        currentUser
          ? {
              ...currentUser,
              scorePublic: canonical.scorePublic,
              stateVersion: canonical.stateVersion,
            }
          : currentUser,
      );
      void queryClient.invalidateQueries({ queryKey: ["cert-quiz", "leaderboard"] });
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(currentUserKey, context.previous);
    },
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

export function usePendingUsersQuery() {
  const api = useCertQuizApi();
  return useQuery({
    queryKey: certQuizQueryKeys.pendingUsers(),
    queryFn: () => resolveCertQuizResult(api.getPendingUsers()),
  });
}

export function useApproveUserMutation() {
  const api = useCertQuizApi();
  const queryClient = useQueryClient();
  const key = certQuizQueryKeys.pendingUsers();

  return useMutation({
    mutationFn: ({ userId }: { userId: Uuid }) =>
      resolveCertQuizResult(api.approveUser({ userId })),
    onSuccess: async ({ userId }: ApproveUserResponse) => {
      queryClient.setQueryData<PendingUsersDto>(key, (pendingUsers) =>
        pendingUsers
          ? {
              ...pendingUsers,
              users: pendingUsers.users.filter((user) => user.id !== userId),
            }
          : pendingUsers,
      );
      await queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

/** S10 mutations deliberately keep import contents and credentials out of the query cache. */
export function useDryRunImportMutation() {
  const api = useCertQuizApi();
  return useMutation({
    mutationFn: (input: DryRunImportRequest) =>
      resolveCertQuizResult(api.dryRunImport(input)),
  });
}

export function useCommitImportMutation() {
  const api = useCertQuizApi();
  return useMutation({
    mutationFn: (input: CommitImportRequest) =>
      resolveCertQuizResult(api.commitImport(input)),
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
