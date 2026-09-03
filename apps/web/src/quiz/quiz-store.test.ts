import { describe, expect, it } from "vitest";

import { createQuizStore, type QuizQuestionTarget } from "./quiz-store";

const questionTarget =
  "practice:00000000-0000-4000-8000-000000000001:00000000-0000-4000-8000-000000000002" as QuizQuestionTarget;

describe("quiz transient store", () => {
  it("keeps drafts through flag rollback and rejects a duplicate submit lock", () => {
    const store = createQuizStore();
    const state = store.getState();
    state.setDraftChoiceIds(questionTarget, [
      "00000000-0000-4000-8000-000000000003",
    ]);
    const token = state.beginFlagChange(questionTarget, false, true);

    expect(store.getState().pendingFlags[questionTarget]).toMatchObject({
      previousFlagged: false,
      optimisticFlagged: true,
    });
    expect(store.getState().acquireSubmitLock(questionTarget)).toBe(true);
    expect(store.getState().acquireSubmitLock(questionTarget)).toBe(false);

    store.getState().rollbackFlagChange(questionTarget, token);
    expect(store.getState().pendingFlags[questionTarget]).toBeUndefined();
    expect(store.getState().draftChoiceIdsByQuestion[questionTarget]).toEqual([
      "00000000-0000-4000-8000-000000000003",
    ]);

    store.getState().releaseSubmitLock(questionTarget);
    expect(store.getState().acquireSubmitLock(questionTarget)).toBe(true);
  });

  it("ignores stale flag settlements and resets all logout-sensitive state", () => {
    const store = createQuizStore();
    const first = store.getState().beginFlagChange(questionTarget, false, true);
    const second = store.getState().beginFlagChange(questionTarget, true, false);

    store.getState().rollbackFlagChange(questionTarget, first);
    expect(store.getState().pendingFlags[questionTarget]?.token).toBe(second);

    store.getState().reset();
    expect(store.getState().pendingFlags).toEqual({});
    expect(store.getState().draftChoiceIdsByQuestion).toEqual({});
    expect(store.getState().submittingTargets).toEqual({});
  });
});
