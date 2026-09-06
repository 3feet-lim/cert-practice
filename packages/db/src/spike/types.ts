export type GateStatus = "pass" | "fail" | "not_run" | "inconclusive";

export type ProbeId =
  | "connector-lifecycle"
  | "sql-capabilities"
  | "migration-replay"
  | "history-query"
  | "leaderboard-query"
  | "retention-cleanup-query"
  | "profile-get-or-create"
  | "active-practice-slot"
  | "practice-replace"
  | "exam-finalize"
  | "import-head-switch";

export type FaultPoint =
  | "profile-insert"
  | "practice-slot-insert"
  | "practice-replace-snapshot"
  | "exam-finalize-attempt"
  | "import-head-update";

export type MigrationEntry = {
  version: string;
  path: string;
  sha256: string;
  status: GateStatus;
};

export type SpikeProbe = {
  id: ProbeId;
  required: true;
  targetStatus: Extract<GateStatus, "not_run" | "inconclusive">;
  reason: string;
  invariant: string;
  expectedIndex?: string;
  p95MsMax?: number;
};

export type ModelScenario = {
  id: Extract<
    ProbeId,
    | "profile-get-or-create"
    | "active-practice-slot"
    | "practice-replace"
    | "exam-finalize"
    | "import-head-switch"
  >;
  faultPoint: FaultPoint;
  modelStatus: Extract<GateStatus, "pass" | "fail">;
  targetStatus: "not_run";
  invariant: string;
  detail: string;
};

export type AdapterDecision = {
  adapter: "dsql" | "postgres" | "unselected";
  reason: string;
};

export type SpikeReport = {
  schemaVersion: 1;
  kind: "aurora-dsql-compatibility-spike";
  run: {
    mode: "local" | "live";
    dryRun: boolean;
    networkAttempted: boolean;
    credentialAccessAttempted: boolean;
    executedAt: string;
    toolchain: { node: string; pnpm: "11.25.0" };
  };
  migrations: MigrationEntry[];
  probes: SpikeProbe[];
  concurrency: ModelScenario[];
  gates: Record<
    | "migrationRepeatability"
    | "connectorLifecycle"
    | "sqlCapabilities"
    | "queryPlans"
    | "p95Latency"
    | "atomicity"
    | "overall",
    GateStatus
  >;
  decision: AdapterDecision;
};
