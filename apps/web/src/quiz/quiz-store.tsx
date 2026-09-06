import type { LanguageMode, Uuid } from "@cert-quiz/contracts";
import { createContext, useContext } from "react";
import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";

export type QuizTarget = `${"practice" | "exam"}:${Uuid}`;
export type QuizQuestionTarget = `${QuizTarget}:${Uuid}`;

type PendingFlagChange = {
  token: number;
  previousFlagged: boolean;
  optimisticFlagged: boolean;
};

export type QuizTransientState = {
  currentIndexBySession: Record<QuizTarget, number>;
  languageBySession: Record<QuizTarget, LanguageMode>;
  draftChoiceIdsByQuestion: Record<QuizQuestionTarget, Uuid[]>;
  pendingFlags: Record<QuizQuestionTarget, PendingFlagChange>;
  submittingTargets: Record<QuizQuestionTarget | QuizTarget, true>;
  submissionDialogTarget: QuizTarget | null;
  nextFlagToken: number;
  hydrateSession: (target: QuizTarget, currentIndex: number) => void;
  setCurrentIndex: (target: QuizTarget, currentIndex: number) => void;
  setLanguage: (target: QuizTarget, language: LanguageMode) => void;
  setDraftChoiceIds: (target: QuizQuestionTarget, choiceIds: Uuid[]) => void;
  beginFlagChange: (
    target: QuizQuestionTarget,
    previousFlagged: boolean,
    optimisticFlagged: boolean,
  ) => number;
  isCurrentFlagChange: (target: QuizQuestionTarget, token: number) => boolean;
  commitFlagChange: (target: QuizQuestionTarget, token: number) => void;
  rollbackFlagChange: (target: QuizQuestionTarget, token: number) => void;
  acquireSubmitLock: (target: QuizQuestionTarget | QuizTarget) => boolean;
  releaseSubmitLock: (target: QuizQuestionTarget | QuizTarget) => void;
  openSubmissionDialog: (target: QuizTarget) => void;
  closeSubmissionDialog: () => void;
  reset: () => void;
};

const initialState = {
  currentIndexBySession: {},
  languageBySession: {},
  draftChoiceIdsByQuestion: {},
  pendingFlags: {},
  submittingTargets: {},
  submissionDialogTarget: null,
  nextFlagToken: 1,
} satisfies Pick<
  QuizTransientState,
  | "currentIndexBySession"
  | "languageBySession"
  | "draftChoiceIdsByQuestion"
  | "pendingFlags"
  | "submittingTargets"
  | "submissionDialogTarget"
  | "nextFlagToken"
>;

export type QuizStoreApi = StoreApi<QuizTransientState>;

export function createQuizStore(): QuizStoreApi {
  return createStore<QuizTransientState>((set, get) => ({
    ...initialState,
    hydrateSession: (target, currentIndex) =>
      set((state) => ({
        currentIndexBySession: {
          ...state.currentIndexBySession,
          [target]: state.currentIndexBySession[target] ?? currentIndex,
        },
      })),
    setCurrentIndex: (target, currentIndex) =>
      set((state) => ({
        currentIndexBySession: {
          ...state.currentIndexBySession,
          [target]: currentIndex,
        },
      })),
    setLanguage: (target, language) =>
      set((state) => ({
        languageBySession: { ...state.languageBySession, [target]: language },
      })),
    setDraftChoiceIds: (target, choiceIds) =>
      set((state) => ({
        draftChoiceIdsByQuestion: {
          ...state.draftChoiceIdsByQuestion,
          [target]: [...choiceIds],
        },
      })),
    beginFlagChange: (target, previousFlagged, optimisticFlagged) => {
      const token = get().nextFlagToken;
      set((state) => ({
        nextFlagToken: token + 1,
        pendingFlags: {
          ...state.pendingFlags,
          [target]: { token, previousFlagged, optimisticFlagged },
        },
      }));
      return token;
    },
    isCurrentFlagChange: (target, token) => get().pendingFlags[target]?.token === token,
    commitFlagChange: (target, token) => {
      if (!get().isCurrentFlagChange(target, token)) return;
      set((state) => {
        const pendingFlags = { ...state.pendingFlags };
        delete pendingFlags[target];
        return { pendingFlags };
      });
    },
    rollbackFlagChange: (target, token) => {
      if (!get().isCurrentFlagChange(target, token)) return;
      set((state) => {
        const pendingFlags = { ...state.pendingFlags };
        delete pendingFlags[target];
        return { pendingFlags };
      });
    },
    acquireSubmitLock: (target) => {
      if (get().submittingTargets[target]) return false;
      set((state) => ({
        submittingTargets: { ...state.submittingTargets, [target]: true },
      }));
      return true;
    },
    releaseSubmitLock: (target) =>
      set((state) => {
        const submittingTargets = { ...state.submittingTargets };
        delete submittingTargets[target];
        return { submittingTargets };
      }),
    openSubmissionDialog: (target) => set({ submissionDialogTarget: target }),
    closeSubmissionDialog: () => set({ submissionDialogTarget: null }),
    reset: () => set({ ...initialState }),
  }));
}

export const QuizStoreContext = createContext<QuizStoreApi | null>(null);

export function useQuizStoreApi() {
  const store = useContext(QuizStoreContext);
  if (!store) {
    throw new Error("useQuizStore must be used within QuizStoreProvider");
  }
  return store;
}

export function useQuizStore<T>(selector: (state: QuizTransientState) => T): T {
  return useStore(useQuizStoreApi(), selector);
}
