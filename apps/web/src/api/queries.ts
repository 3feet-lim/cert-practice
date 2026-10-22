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
} from "@cert-forge/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { certQuizQueryKeys } from "../app/query-keys";
import { purgeCertForgeSession } from "../app/query-client";
import { useQuizStoreApi } from "../quiz/quiz-store";
import { resolveCertForgeResult } from "./query-result";
import { useCertForgeApi } from "./useCertForgeApi";

/** Each hook owns an independent TanStack Query loading/error state. */
export function useHealthQuery() {
  const api = useCertForgeApi();
  return useQuery({
    queryKey: certQuizQueryKeys.health(),
    queryFn: () => resolveCertForgeResult(api.getHealth()),
  });
}

export function useApprovalStatusQuery() {
  const api = useCertForgeApi();
  return useQuery({
    queryKey: certQuizQueryKeys.approval(),
    queryFn: () => resolveCertForgeResult(api.getApprovalStatus()),
  });
}

export function useCurrentUserQuery() {
  const api = useCertForgeApi();
  return useQuery({
    queryKey: certQuizQueryKeys.currentUser(),
    queryFn: () => resolveCertForgeResult(api.getCurrentUser()),
  });
}

export function usePracticeResultQuery(resultId: Uuid) {
  const api = useCertForgeApi();
  return useQuery<PracticeResultDto>({
    queryKey: certQuizQueryKeys.practiceResult(resultId),
    queryFn: () => resolveCertForgeResult(api.getPracticeResult({ resultId })),
  });
}

export function useAttemptQuery(attemptId: Uuid, options: { enabled?: boolean } = {}) {
  const api = useCertForgeApi();
  return useQuery<ExamResultDto>({
    queryKey: certQuizQueryKeys.attempt(attemptId),
    queryFn: () => resolveCertForgeResult(api.getAttempt({ attemptId })),
    enabled: options.enabled ?? true,
  });
}

export function useHistoryQuery(cursor?: HistoryCursor) {
  const api = useCertForgeApi();
  return useQuery<HistoryPageDto>({
    queryKey: certQuizQueryKeys.history(cursor),
    queryFn: () =>
      resolveCertForgeResult(api.getHistory({ ...(cursor ? { cursor } : {}) })),
  });
}

export function useHistoryTrendsQuery() {
  const api = useCertForgeApi();
  return useQuery<HistoryTrendsDto>({
    queryKey: certQuizQueryKeys.historyTrends(),
    queryFn: () => resolveCertForgeResult(api.getHistoryTrends()),
  });
}

export function useLeaderboardQuery(certificationId?: Uuid) {
  const api = useCertForgeApi();
  return useQuery<LeaderboardDto>({
    queryKey: certificationId
      ? certQuizQueryKeys.leaderboard(certificationId)
      : ["cert-forge", "leaderboard", "unselected"],
    enabled: certificationId !== undefined,
    queryFn: () => {
      if (!certificationId) throw new Error("A certification must be selected first.");
      return resolveCertForgeResult(api.getLeaderboard({ certificationId }));
    },
  });
}

type VisibilityMutationContext = { previous: CurrentUserDto };

/** Optimistically updates the profile cache and restores it if the server rejects the change. */
export function useScoreVisibilityMutation() {
  const api = useCertForgeApi();
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
      return resolveCertForgeResult(
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
      void queryClient.invalidateQueries({ queryKey: ["cert-forge", "leaderboard"] });
    },
    onError: (_error, _variables, context) => {
      if (context) queryClient.setQueryData(currentUserKey, context.previous);
    },
  });
}

export function useCatalogQuery() {
  const api = useCertForgeApi();
  return useQuery({
    queryKey: certQuizQueryKeys.catalog(),
    queryFn: () => resolveCertForgeResult(api.getCatalog()),
  });
}

export function useActivePracticeSessionsQuery() {
  const api = useCertForgeApi();
  return useQuery({
    queryKey: certQuizQueryKeys.activePracticeSessions(),
    queryFn: () => resolveCertForgeResult(api.listActivePracticeSessions()),
  });
}

export function usePendingUsersQuery() {
  const api = useCertForgeApi();
  return useQuery({
    queryKey: certQuizQueryKeys.pendingUsers(),
    queryFn: () => resolveCertForgeResult(api.getPendingUsers()),
  });
}

export function useApproveUserMutation() {
  const api = useCertForgeApi();
  const queryClient = useQueryClient();
  const key = certQuizQueryKeys.pendingUsers();

  return useMutation({
    mutationFn: ({ userId }: { userId: Uuid }) =>
      resolveCertForgeResult(api.approveUser({ userId })),
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
  const api = useCertForgeApi();
  return useMutation({
    mutationFn: (input: DryRunImportRequest) =>
      resolveCertForgeResult(api.dryRunImport(input)),
  });
}

export function useCommitImportMutation() {
  const api = useCertForgeApi();
  return useMutation({
    mutationFn: (input: CommitImportRequest) =>
      resolveCertForgeResult(api.commitImport(input)),
  });
}

/** Clears authenticated query data and all in-progress local quiz interaction state. */
export function useLogoutStatePurge() {
  const queryClient = useQueryClient();
  const quizStore = useQuizStoreApi();
  return useCallback(
    () => purgeCertForgeSession(queryClient, quizStore),
    [queryClient, quizStore],
  );
}
