import type { HealthDto } from "@cert-forge/contracts";

/** Deterministic frontend-only health payload shared by the mock adapter and MSW. */
export const HEALTH_FIXTURE = Object.freeze({
  status: "ok",
  service: "cert-forge-api",
  contractVersion: "v1",
} as const satisfies HealthDto);
