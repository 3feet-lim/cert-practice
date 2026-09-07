import type { GateStatus, ProbeId, SpikeReport } from "./types.js";

export type LiveProbeObservation = {
  id: ProbeId;
  status: Extract<GateStatus, "pass" | "fail" | "inconclusive">;
  durationMs: number;
  detail: string;
  evidence: Record<string, string | number | boolean>;
};

export type LiveConcurrencyObservation = {
  id: Extract<
    ProbeId,
    | "profile-get-or-create"
    | "active-practice-slot"
    | "practice-replace"
    | "exam-finalize"
    | "import-head-switch"
  >;
  status: Extract<GateStatus, "pass" | "fail">;
  clients: number;
  detail: string;
};

export type LiveQueryObservation = {
  id: Extract<
    ProbeId,
    "history-query" | "leaderboard-query" | "retention-cleanup-query"
  >;
  status: Extract<GateStatus, "pass" | "fail">;
  expectedIndex: string;
  indexUsed: boolean;
  contractVerified: boolean;
  p95Ms: number;
  p95MsMax: number;
  samples: number;
  workload: {
    users: number;
    attempts: number;
    attemptsPerUser: number;
    retentionRows: number;
    expiredRetentionRows: number;
    samples: number;
  };
  plan: string;
};

export type LiveSpikeReport = SpikeReport & {
  run: SpikeReport["run"] & {
    mode: "live";
    dryRun: false;
    networkAttempted: true;
    credentialAccessAttempted: true;
    endpoint: string;
    region: string;
    database: string;
    databaseUser: string;
  };
  live: {
    connector: LiveProbeObservation;
    migration: LiveProbeObservation;
    queries: LiveQueryObservation[];
    concurrency: LiveConcurrencyObservation[];
    cleanup: "pass" | "fail";
  };
};
