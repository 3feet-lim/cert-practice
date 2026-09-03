import type { HistoryCursor, Uuid } from "@cert-quiz/contracts";

/** Adapter-independent cache identity shared by mock and HTTP implementations. */
export const certQuizQueryKeys = {
  all: ["cert-quiz"] as const,
  health: () => ["cert-quiz", "health"] as const,
  approval: () => ["cert-quiz", "me", "approval"] as const,
  currentUser: () => ["cert-quiz", "me"] as const,
  catalog: () => ["cert-quiz", "catalog"] as const,
  activePracticeSessions: () => ["cert-quiz", "practice", "active"] as const,
  practice: (practiceSessionId: Uuid) =>
    ["cert-quiz", "practice", practiceSessionId] as const,
  practiceResult: (resultId: Uuid) =>
    ["cert-quiz", "practice-result", resultId] as const,
  exam: (examSessionId: Uuid) => ["cert-quiz", "exam", examSessionId] as const,
  examPreview: (examSessionId: Uuid) =>
    ["cert-quiz", "exam", examSessionId, "preview"] as const,
  attempt: (attemptId: Uuid) => ["cert-quiz", "attempt", attemptId] as const,
  history: (cursor?: HistoryCursor) =>
    ["cert-quiz", "history", cursor ?? null] as const,
  historyTrends: () => ["cert-quiz", "history", "trends"] as const,
  leaderboard: (certificationId: Uuid) =>
    ["cert-quiz", "leaderboard", certificationId] as const,
  pendingUsers: () => ["cert-quiz", "admin", "pending-users"] as const,
} as const;
