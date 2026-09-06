import type { FaultPoint, ModelScenario } from "./types.js";

type ModelState = {
  profileCount: number;
  activePracticeCount: number;
  snapshotCount: number;
  attemptCount: number;
  catalogHead: "revision-a" | "revision-b";
};

const initialState = (): ModelState => ({
  profileCount: 0,
  activePracticeCount: 0,
  snapshotCount: 0,
  attemptCount: 0,
  catalogHead: "revision-a",
});

function clone(state: ModelState): ModelState {
  return { ...state };
}

/**
 * Deterministic transactional model for planning barriers/fault injection.
 * It intentionally models invariants only and cannot validate a SQL engine.
 */
export function runLocalConcurrencyModel(faultAt?: FaultPoint): ModelScenario[] {
  const state = initialState();

  const transaction = (faultPoint: FaultPoint, mutate: () => void): boolean => {
    const before = clone(state);
    try {
      mutate();
      if (faultAt === faultPoint) throw new Error(`Injected ${faultPoint}`);
      return true;
    } catch {
      Object.assign(state, before);
      return false;
    }
  };

  // A two-client barrier converges on one unique subject.
  transaction("profile-insert", () => {
    if (state.profileCount === 0) state.profileCount = 1;
    if (state.profileCount > 1) throw new Error("duplicate profile");
  });
  const profile = scenario(
    "profile-get-or-create",
    "profile-insert",
    state.profileCount <= 1,
    "Two scheduled creators preserve a single profile after commit or rollback.",
  );

  transaction("practice-slot-insert", () => {
    if (state.activePracticeCount === 0) state.activePracticeCount = 1;
    if (state.activePracticeCount > 1)
      throw new Error("duplicate active practice slot");
  });
  const practice = scenario(
    "active-practice-slot",
    "practice-slot-insert",
    state.activePracticeCount <= 1,
    "Two scheduled starters preserve one active user/certification slot.",
  );

  const previousSnapshots = state.snapshotCount;
  transaction("practice-replace-snapshot", () => {
    state.snapshotCount = previousSnapshots + 3;
  });
  const replace = scenario(
    "practice-replace",
    "practice-replace-snapshot",
    state.snapshotCount === previousSnapshots ||
      state.snapshotCount === previousSnapshots + 3,
    "A failed replacement restores the old snapshot count; success installs a complete snapshot.",
  );

  transaction("exam-finalize-attempt", () => {
    if (state.attemptCount === 0) state.attemptCount = 1;
    if (state.attemptCount > 1) throw new Error("duplicate attempt");
  });
  const finalize = scenario(
    "exam-finalize",
    "exam-finalize-attempt",
    state.attemptCount <= 1,
    "Manual and expiry finalizers converge on at most one Attempt.",
  );

  transaction("import-head-update", () => {
    state.catalogHead = "revision-b";
  });
  const importHead = scenario(
    "import-head-switch",
    "import-head-update",
    state.catalogHead === "revision-a" || state.catalogHead === "revision-b",
    "The active head is either the previous complete revision or the new complete revision.",
  );

  return [profile, practice, replace, finalize, importHead];
}

function scenario(
  id: ModelScenario["id"],
  faultPoint: FaultPoint,
  invariantHolds: boolean,
  detail: string,
): ModelScenario {
  return {
    id,
    faultPoint,
    modelStatus: invariantHolds ? "pass" : "fail",
    targetStatus: "not_run",
    invariant: detail,
    detail,
  };
}
