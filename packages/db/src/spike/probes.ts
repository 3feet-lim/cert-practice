import type { SpikeProbe } from "./types.js";

/**
 * Target-engine probe plan. Local execution deliberately leaves every target
 * observation not_run: a model cannot prove DSQL behavior or query latency.
 */
export const targetProbePlan: readonly SpikeProbe[] = [
  {
    id: "connector-lifecycle",
    required: true,
    targetStatus: "not_run",
    reason: "Requires approved IAM, TLS, and Lambda freeze/thaw target execution.",
    invariant: "Token refresh and pooled connection reuse remain safe across freezes.",
  },
  {
    id: "sql-capabilities",
    required: true,
    targetStatus: "not_run",
    reason: "Requires a target DSQL migration transaction and DDL inspection.",
    invariant:
      "UUID, timestamptz, bigint pairs, JSON, constraints, and indexes are accepted.",
  },
  {
    id: "migration-replay",
    required: true,
    targetStatus: "not_run",
    reason: "Requires repeated migration and recovery runs against the target engine.",
    invariant:
      "Version/checksum replay is deterministic and failed runs recover safely.",
  },
  {
    id: "history-query",
    required: true,
    targetStatus: "not_run",
    reason: "Requires EXPLAIN ANALYZE against representative target data.",
    invariant: "History cursor query preserves deterministic descending time/id order.",
    expectedIndex: "spike_attempt_history_cursor",
    p95MsMax: 500,
  },
  {
    id: "leaderboard-query",
    required: true,
    targetStatus: "not_run",
    reason:
      "Requires window-function query plan and latency evidence on the target engine.",
    invariant: "Exact score ranking and tie order use the required index/plan.",
    expectedIndex: "spike_attempt_leaderboard",
    p95MsMax: 500,
  },
  {
    id: "retention-cleanup-query",
    required: true,
    targetStatus: "not_run",
    reason: "Requires bounded delete plan and latency evidence on the target engine.",
    invariant: "Cleanup batches by expires_at/id without extending logical retention.",
    expectedIndex: "spike_practice_result_expiry",
    p95MsMax: 500,
  },
  {
    id: "profile-get-or-create",
    required: true,
    targetStatus: "not_run",
    reason: "Requires concurrent target transactions and rollback observation.",
    invariant: "One Google subject produces exactly one profile.",
  },
  {
    id: "active-practice-slot",
    required: true,
    targetStatus: "not_run",
    reason:
      "Requires concurrent target transactions and active-slot constraint evidence.",
    invariant: "One user/certification has at most one active practice session.",
  },
  {
    id: "practice-replace",
    required: true,
    targetStatus: "not_run",
    reason: "Requires target transaction rollback after snapshot insertion failure.",
    invariant:
      "Replacement preserves the old session or atomically installs a complete new snapshot.",
  },
  {
    id: "exam-finalize",
    required: true,
    targetStatus: "not_run",
    reason:
      "Requires manual/expiry target concurrency and idempotent attempt evidence.",
    invariant: "One exam yields at most one immutable Attempt.",
  },
  {
    id: "import-head-switch",
    required: true,
    targetStatus: "not_run",
    reason:
      "Requires target transaction rollback and staged revision visibility evidence.",
    invariant:
      "A failed import never exposes a mixed or partially switched catalog head.",
  },
];
