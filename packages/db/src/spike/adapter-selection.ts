import type { AdapterDecision, GateStatus, SpikeReport } from "./types.js";

const requiredGateNames = [
  "migrationRepeatability",
  "connectorLifecycle",
  "sqlCapabilities",
  "queryPlans",
  "p95Latency",
  "atomicity",
] as const;

export function selectAdapter(
  report: Pick<SpikeReport, "run" | "gates">,
): AdapterDecision {
  if (report.run.mode !== "live" || report.run.networkAttempted === false) {
    return {
      adapter: "unselected",
      reason:
        "No target-engine evidence; local preflight cannot select DSQL or PostgreSQL.",
    };
  }

  const statuses = requiredGateNames.map((name) => report.gates[name]);
  if (statuses.some((status) => status === "fail")) {
    return {
      adapter: "postgres",
      reason:
        "A required DSQL compatibility gate failed; use the Aurora PostgreSQL fallback.",
    };
  }
  if (
    statuses.every((status): status is Extract<GateStatus, "pass"> => status === "pass")
  ) {
    return {
      adapter: "dsql",
      reason: "Every required live DSQL compatibility gate passed.",
    };
  }

  return {
    adapter: "unselected",
    reason: "Required live compatibility evidence is incomplete.",
  };
}
