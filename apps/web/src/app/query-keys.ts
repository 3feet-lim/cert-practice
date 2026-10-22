import type { HistoryCursor, Uuid } from "@cert-forge/contracts";

/** Adapter-independent cache identity shared by mock and HTTP implementations. */
export const certQuizQueryKeys = {
  all: ["cert-forge"] as const,
  health: () => ["cert-forge", "health"] as const,
  approval: () => ["cert-forge", "me", "approval"] as const,
  currentUser: () => ["cert-forge", "me"] as const,
  catalog: () => ["cert-forge", "catalog"] as const,
  activePracticeSessions: () => ["cert-forge", "practice", "active"] as const,
  practice: (practiceSessionId: Uuid) =>
    ["cert-forge", "practice", practiceSessionId] as const,
  practiceResult: (resultId: Uuid) =>
    ["cert-forge", "practice-result", resultId] as const,
  exam: (examSessionId: Uuid) => ["cert-forge", "exam", examSessionId] as const,
  examPreview: (examSessionId: Uuid) =>
    ["cert-forge", "exam", examSessionId, "preview"] as const,
  attempt: (attemptId: Uuid) => ["cert-forge", "attempt", attemptId] as const,
  history: (cursor?: HistoryCursor) =>
    ["cert-forge", "history", cursor ?? null] as const,
  historyTrends: () => ["cert-forge", "history", "trends"] as const,
  leaderboard: (certificationId: Uuid) =>
    ["cert-forge", "leaderboard", certificationId] as const,
  pendingUsers: () => ["cert-forge", "admin", "pending-users"] as const,
} as const;
