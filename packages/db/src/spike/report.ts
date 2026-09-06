import { createHash } from "node:crypto";

import { selectAdapter } from "./adapter-selection.js";
import { runLocalConcurrencyModel } from "./local-model-executor.js";
import { loadMigrationManifest } from "./migrations.js";
import { targetProbePlan } from "./probes.js";
import type { FaultPoint, SpikeReport } from "./types.js";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

export function reportDigest(report: SpikeReport): string {
  return createHash("sha256").update(canonicalJson(report), "utf8").digest("hex");
}

export async function createLocalSpikeReport(options?: {
  executedAt?: string;
  faultAt?: FaultPoint;
}): Promise<SpikeReport> {
  const report: SpikeReport = {
    schemaVersion: 1,
    kind: "aurora-dsql-compatibility-spike",
    run: {
      mode: "local",
      dryRun: true,
      networkAttempted: false,
      credentialAccessAttempted: false,
      executedAt: options?.executedAt ?? new Date().toISOString(),
      toolchain: { node: process.version, pnpm: "11.25.0" },
    },
    migrations: await loadMigrationManifest(),
    probes: [...targetProbePlan],
    concurrency: runLocalConcurrencyModel(options?.faultAt),
    gates: {
      migrationRepeatability: "inconclusive",
      connectorLifecycle: "not_run",
      sqlCapabilities: "not_run",
      queryPlans: "not_run",
      p95Latency: "not_run",
      atomicity: "not_run",
      overall: "inconclusive",
    },
    decision: { adapter: "unselected", reason: "pending" },
  };

  report.decision = selectAdapter(report);
  return report;
}

export function renderAdrDraft(report: SpikeReport): string {
  return (
    `# ADR-0001: Database adapter selection\n\n` +
    `- **Status:** pending\n` +
    `- **Report SHA-256:** \`${reportDigest(report)}\`\n\n` +
    `## Local preflight scope\n\n` +
    `This report ran only deterministic manifest and in-memory model checks. ` +
    `It did not attempt network access, AWS credential access, TLS, IAM token generation, ` +
    `or a database connection.\n\n` +
    `## Required live evidence\n\n` +
    report.probes
      .map((probe) => `- \`${probe.id}\`: ${probe.targetStatus} — ${probe.reason}`)
      .join("\n") +
    `\n\n## Decision\n\n${report.decision.reason}\n`
  );
}
