import { selectAdapter } from "./adapter-selection.js";
import { runAtomicityProbes } from "./live-atomicity.js";
import {
  createLivePool,
  errorMessage,
  loadLambdaLifecycleEvidence,
  probeConnectorLifecycle,
  type LiveConnectionConfig,
} from "./live-connection.js";
import { cleanSpikeDatabase, runMigrationProbe } from "./live-migration.js";
import { runQueryProbes } from "./live-query-probes.js";
import type {
  LiveConcurrencyObservation,
  LiveProbeObservation,
  LiveQueryObservation,
  LiveSpikeReport,
} from "./live-types.js";
import { runLocalConcurrencyModel } from "./local-model-executor.js";
import { loadMigrationManifest } from "./migrations.js";
import { targetProbePlan } from "./probes.js";
import { reportDigest } from "./report.js";
import type { AdapterDecision, GateStatus, ProbeId } from "./types.js";

export type LiveSpikeConfig = LiveConnectionConfig & {
  keepData: boolean;
  lambdaEvidencePath: string;
};

export async function createLiveSpikeReport(
  config: LiveSpikeConfig,
): Promise<LiveSpikeReport> {
  const lambdaEvidence = await loadLambdaLifecycleEvidence(
    config.lambdaEvidencePath,
    config,
  );
  const pool = await createLivePool(config);
  let cleanup: "pass" | "fail" = "pass";
  let report: LiveSpikeReport | undefined;

  try {
    const connector = await probeConnectorLifecycle(pool, lambdaEvidence);
    const migration = await runMigrationProbe(pool);
    const sqlCapabilities = sqlCapabilitiesFromMigration(migration);
    const concurrency =
      migration.status === "pass"
        ? await runAtomicityProbes(pool)
        : failedConcurrency();
    const queries =
      migration.status === "pass" ? await runQueryProbes(pool) : failedQueries();

    const gates = computeGates(
      connector,
      migration,
      sqlCapabilities,
      queries,
      concurrency,
    );
    const statusByProbe = new Map<ProbeId, GateStatus>([
      ["connector-lifecycle", connector.status],
      ["sql-capabilities", sqlCapabilities.status],
      ["migration-replay", migration.status],
      ...queries.map((query) => [query.id, query.status] as const),
      ...concurrency.map((probe) => [probe.id, probe.status] as const),
    ]);
    const migrations = (await loadMigrationManifest()).map((entry) => ({
      ...entry,
      status: migration.status,
    }));

    report = {
      schemaVersion: 1,
      kind: "aurora-dsql-compatibility-spike",
      run: {
        mode: "live",
        dryRun: false,
        networkAttempted: true,
        credentialAccessAttempted: true,
        executedAt: new Date().toISOString(),
        toolchain: { node: process.version, pnpm: "11.25.0" },
        endpoint: config.endpoint,
        region: config.region,
        database: config.database,
        databaseUser: config.user,
      },
      migrations,
      probes: targetProbePlan.map((probe) => ({
        ...probe,
        targetStatus: statusByProbe.get(probe.id) ?? "inconclusive",
        reason:
          statusByProbe.get(probe.id) === "pass"
            ? "Observed against the live dev DSQL cluster."
            : probe.reason,
      })),
      concurrency: runLocalConcurrencyModel(),
      gates,
      decision: { adapter: "unselected", reason: "pending" },
      live: { connector, migration, queries, concurrency, cleanup },
    };
    report.decision = selectAdapter(report);
    return report;
  } finally {
    if (!config.keepData) {
      try {
        await cleanSpikeDatabase(pool);
      } catch {
        cleanup = "fail";
      }
    }
    if (report) report.live.cleanup = cleanup;
    await pool.end();
  }
}

function sqlCapabilitiesFromMigration(
  migration: LiveProbeObservation,
): LiveProbeObservation {
  return {
    id: "sql-capabilities",
    status: migration.status,
    durationMs: migration.durationMs,
    detail:
      migration.status === "pass"
        ? "Live DDL accepted UUID, timestamptz, bigint exact pairs, JSONB, foreign keys, UNIQUE/CHECK constraints, and required indexes."
        : `Candidate schema failed: ${migration.detail}`,
    evidence: {
      uuid: migration.status === "pass",
      timestamptz: migration.status === "pass",
      exactIntegerPairs: migration.status === "pass",
      jsonb: migration.status === "pass",
      constraints: migration.status === "pass",
      indexes: migration.status === "pass",
    },
  };
}

function computeGates(
  connector: LiveProbeObservation,
  migration: LiveProbeObservation,
  sqlCapabilities: LiveProbeObservation,
  queries: readonly LiveQueryObservation[],
  concurrency: readonly LiveConcurrencyObservation[],
): LiveSpikeReport["gates"] {
  const gates: LiveSpikeReport["gates"] = {
    migrationRepeatability: migration.status,
    connectorLifecycle: connector.status,
    sqlCapabilities: sqlCapabilities.status,
    queryPlans:
      queries.length === 3 &&
      queries.every((query) => query.indexUsed && query.contractVerified)
        ? "pass"
        : "fail",
    p95Latency:
      queries.length === 3 &&
      queries.every(
        (query) =>
          query.samples > 0 && query.p95Ms >= 0 && query.p95Ms <= query.p95MsMax,
      )
        ? "pass"
        : "fail",
    atomicity:
      concurrency.length === 5 && concurrency.every((probe) => probe.status === "pass")
        ? "pass"
        : "fail",
    overall: "inconclusive",
  };
  const requiredStatuses = Object.entries(gates)
    .filter(([name]) => name !== "overall")
    .map(([, status]) => status);
  gates.overall = aggregateOverallStatus(requiredStatuses);
  return gates;
}

export function aggregateOverallStatus(statuses: readonly GateStatus[]): GateStatus {
  if (statuses.some((status) => status === "fail")) return "fail";
  if (statuses.every((status) => status === "pass")) return "pass";
  return "inconclusive";
}

function failedQueries(): LiveQueryObservation[] {
  return [
    ["history-query", "spike_attempt_history_cursor"],
    ["leaderboard-query", "spike_attempt_leaderboard_candidates"],
    ["retention-cleanup-query", "spike_practice_result_expiry"],
  ].map(([id, expectedIndex]) => ({
    id: id as LiveQueryObservation["id"],
    status: "fail",
    expectedIndex: expectedIndex ?? "",
    indexUsed: false,
    contractVerified: false,
    p95Ms: 501,
    p95MsMax: 500,
    samples: 0,
    workload: {
      users: 0,
      attempts: 0,
      attemptsPerUser: 0,
      retentionRows: 0,
      expiredRetentionRows: 0,
      samples: 0,
    },
    plan: "Skipped because the candidate migration failed.",
  }));
}

function failedConcurrency(): LiveConcurrencyObservation[] {
  return [
    "profile-get-or-create",
    "active-practice-slot",
    "practice-replace",
    "exam-finalize",
    "import-head-switch",
  ].map((id) => ({
    id: id as LiveConcurrencyObservation["id"],
    status: "fail",
    clients: 0,
    detail: "Skipped because the candidate migration failed.",
  }));
}

export function deploymentInstructionForAdapter(
  adapter: AdapterDecision["adapter"],
): string {
  return adapter === "unselected"
    ? "Do not deploy a database-backed application until the connector gate is complete and an adapter is selected."
    : `Application deployments must set \`CERT_QUIZ_DATABASE_ADAPTER=${adapter}\` explicitly.`;
}

export function renderLiveAdr(report: LiveSpikeReport): string {
  const gateRows = Object.entries(report.gates)
    .map(([name, status]) => `| ${name} | ${status} |`)
    .join("\n");
  const queryRows = report.live.queries
    .map(
      (query) =>
        `| ${query.id} | ${query.expectedIndex} | ${query.indexUsed} | ${query.contractVerified} | ${query.workload.attempts} attempts / ${query.workload.retentionRows} retention rows | ${query.p95Ms} | ${query.p95MsMax} |`,
    )
    .join("\n");
  const status = report.decision.adapter === "unselected" ? "pending" : "accepted";
  const deploymentInstruction = deploymentInstructionForAdapter(
    report.decision.adapter,
  );

  const connectorContext =
    report.live.connector.status === "pass"
      ? "The connector gate combines the local pool lifecycle probe with deployed Lambda evidence: a warm execution environment reused the same backend connection, remained active beyond the 15-minute token window, then successfully opened a fresh IAM-authenticated TLS connection after forced eviction. The temporary Lambda, IAM role, and log group were deleted after evidence capture."
      : "The local connector lifecycle check blocks the event loop as a freeze proxy, verifies warm pool reuse, and forces eviction/reconnect. It does not count as actual Lambda freeze/thaw or IAM token-rollover evidence; the connector gate remains incomplete until a temporary deployed Lambda smoke passes.";

  return `# ADR-0001: Database adapter selection

- **Status:** ${status}
- **Decision:** ${report.decision.adapter}
- **Region:** ${report.run.region}
- **Report SHA-256:** \`${reportDigest(report)}\`

## Context

The Task 9 spike ran against the live dev Aurora DSQL endpoint using the official AWS node-postgres connector, IAM authentication, TLS certificate and hostname validation, versioned candidate DDL, representative query plans, latency samples, and barrier/fault-injection atomicity probes.

${connectorContext}

## Gates

| Gate | Result |
|---|---|
${gateRows}

## Query evidence

| Query | Expected index | Index used | Contract verified | Workload | p95 ms | Limit ms |
|---|---|---:|---:|---|---:|---:|
${queryRows}

## Cost estimate

Aurora DSQL is usage-based and scales database activity to zero when idle. The current AWS free tier includes the first 100,000 DPUs and 1 GB of storage per month; this disposable dev spike is expected to remain within that allowance unless the account has already consumed it. Aurora Serverless v2 retains provisioned ACU capacity and is therefore the fallback only when a required compatibility gate fails. Verify current Seoul Region rates before production provisioning.

## Decision

${report.decision.reason}

${deploymentInstruction} Dev and prod use separate clusters, migrations, IAM database-role mappings, and SSM endpoint parameters.
`;
}

export function liveFailureObservation(
  id: LiveProbeObservation["id"],
  error: unknown,
): LiveProbeObservation {
  return {
    id,
    status: "fail",
    durationMs: 0,
    detail: errorMessage(error),
    evidence: {},
  };
}
