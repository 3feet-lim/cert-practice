import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";

import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import type { PoolClient } from "pg";

import type { LiveProbeObservation } from "./live-types.js";

const DSQL_TOKEN_VALIDITY_WINDOW_MS = 15 * 60 * 1000;

export type LiveConnectionConfig = {
  endpoint: string;
  region: string;
  database: string;
  user: string;
  caPath: string;
  maxConnections?: number;
};

export type LambdaLifecycleEvidence = {
  schemaVersion: 1;
  kind: "aurora-dsql-lambda-lifecycle-evidence";
  status: "pass";
  run: {
    endpoint: string;
    region: string;
    runtime: string;
    nodeVersion: string;
  };
  firstInvocation: {
    environmentId: string;
    processId: number;
  };
  warmInvocation: {
    environmentId: string;
    processId: number;
    coldStart: boolean;
  };
  rolloverInvocation: {
    environmentId: string;
    elapsedSinceFirstConnectMs: number;
    tokenValidityWindowMs: number;
    processIdBeforeEviction: number;
    processIdAfterEviction: number;
    coldStart: boolean;
  };
  assertions: {
    sameLambdaEnvironment: boolean;
    warmPoolConnectionReused: boolean;
    tokenWindowElapsed: boolean;
    freshIamAuthenticatedConnectionAfterTokenWindow: boolean;
    tlsHostnameAndCaVerified: boolean;
    nodeDefaultRootStoreUsed: boolean;
  };
  cleanup: {
    lambdaDeleted: boolean;
    iamRoleDeleted: boolean;
    logGroupDeleted: boolean;
  };
  evidenceSha256: string;
};

export async function createLivePool(
  config: LiveConnectionConfig,
): Promise<AuroraDSQLPool> {
  const ca = await readFile(config.caPath, "utf8");
  return new AuroraDSQLPool({
    host: config.endpoint,
    port: 5432,
    database: config.database,
    user: config.user,
    region: config.region,
    ssl: { rejectUnauthorized: true, ca },
    keepAlive: true,
    max: config.maxConnections ?? 12,
    idleTimeoutMillis: 600_000,
    maxLifetimeSeconds: 3_300,
    connectionTimeoutMillis: 15_000,
    retry: {
      maxRetries: 8,
      baseDelayMs: 25,
      maxDelayMs: 100,
      jitterFactor: 0.2,
    },
  });
}

export async function loadLambdaLifecycleEvidence(
  path: string,
  expected: Pick<LiveConnectionConfig, "endpoint" | "region">,
): Promise<LambdaLifecycleEvidence> {
  const source = await readFile(path, "utf8");
  const parsed: unknown = JSON.parse(source);
  if (!isValidLambdaLifecycleEvidence(parsed, expected)) {
    throw new Error(
      "Lambda lifecycle evidence is invalid, incomplete, or belongs to another endpoint/region.",
    );
  }
  return {
    ...parsed,
    evidenceSha256: createHash("sha256").update(source, "utf8").digest("hex"),
  };
}

export function isValidLambdaLifecycleEvidence(
  value: unknown,
  expected: Pick<LiveConnectionConfig, "endpoint" | "region">,
): value is Omit<LambdaLifecycleEvidence, "evidenceSha256"> {
  if (!isRecord(value)) return false;
  const run = asRecord(value.run);
  const first = asRecord(value.firstInvocation);
  const warm = asRecord(value.warmInvocation);
  const rollover = asRecord(value.rolloverInvocation);
  const assertions = asRecord(value.assertions);
  const cleanup = asRecord(value.cleanup);
  if (!run || !first || !warm || !rollover || !assertions || !cleanup) {
    return false;
  }

  return (
    value.schemaVersion === 1 &&
    value.kind === "aurora-dsql-lambda-lifecycle-evidence" &&
    value.status === "pass" &&
    run.endpoint === expected.endpoint &&
    run.region === expected.region &&
    typeof run.runtime === "string" &&
    typeof run.nodeVersion === "string" &&
    typeof first.environmentId === "string" &&
    typeof first.processId === "number" &&
    first.environmentId === warm.environmentId &&
    first.environmentId === rollover.environmentId &&
    first.processId === warm.processId &&
    warm.coldStart === false &&
    rollover.coldStart === false &&
    typeof rollover.elapsedSinceFirstConnectMs === "number" &&
    typeof rollover.tokenValidityWindowMs === "number" &&
    rollover.tokenValidityWindowMs === DSQL_TOKEN_VALIDITY_WINDOW_MS &&
    rollover.elapsedSinceFirstConnectMs >= rollover.tokenValidityWindowMs &&
    typeof rollover.processIdBeforeEviction === "number" &&
    typeof rollover.processIdAfterEviction === "number" &&
    rollover.processIdBeforeEviction === first.processId &&
    rollover.processIdBeforeEviction !== rollover.processIdAfterEviction &&
    hasExactTrueKeys(assertions, [
      "sameLambdaEnvironment",
      "warmPoolConnectionReused",
      "tokenWindowElapsed",
      "freshIamAuthenticatedConnectionAfterTokenWindow",
      "tlsHostnameAndCaVerified",
      "nodeDefaultRootStoreUsed",
    ]) &&
    hasExactTrueKeys(cleanup, ["lambdaDeleted", "iamRoleDeleted", "logGroupDeleted"])
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function hasExactTrueKeys(
  value: Record<string, unknown>,
  requiredKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...requiredKeys].sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index]) &&
    requiredKeys.every((key) => value[key] === true)
  );
}

type ClientWithProcessId = PoolClient & { processID?: number };

export async function probeConnectorLifecycle(
  pool: AuroraDSQLPool,
  lambdaEvidence?: LambdaLifecycleEvidence,
): Promise<LiveProbeObservation> {
  const startedAt = performance.now();
  let first: ClientWithProcessId | undefined;
  let second: ClientWithProcessId | undefined;
  let third: ClientWithProcessId | undefined;

  try {
    first = (await pool.connect()) as ClientWithProcessId;
    await first.query("SELECT 1 AS connected");
    const firstProcessId = first.processID ?? -1;
    first.release();
    first = undefined;

    const freezeDurationMs = 250;
    Atomics.wait(
      new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)),
      0,
      0,
      freezeDurationMs,
    );
    second = (await pool.connect()) as ClientWithProcessId;
    await second.query("SELECT 1 AS thawed");
    const secondProcessId = second.processID ?? -2;
    const pooledConnectionReused = firstProcessId === secondProcessId;
    second.release(true);
    second = undefined;

    third = (await pool.connect()) as ClientWithProcessId;
    await third.query("SELECT 1 AS reconnected");
    const thirdProcessId = third.processID ?? -3;
    third.release();
    third = undefined;

    const localLifecyclePassed =
      pooledConnectionReused && thirdProcessId !== secondProcessId;
    const lambdaRuntimeVerified = lambdaEvidence !== undefined;
    const passed = localLifecyclePassed && lambdaRuntimeVerified;
    return {
      id: "connector-lifecycle",
      status: passed ? "pass" : localLifecyclePassed ? "inconclusive" : "fail",
      durationMs: roundMs(performance.now() - startedAt),
      detail: passed
        ? "Local IAM/TLS pool lifecycle and deployed Lambda warm reuse plus post-token-window eviction/reconnect all passed."
        : localLifecyclePassed
          ? "Local connector lifecycle passed, but validated Lambda freeze/thaw and token-rollover evidence was not supplied."
          : "The local connector lifecycle did not reuse the warm connection or open a fresh connection after eviction.",
      evidence: {
        tlsRejectUnauthorized: true,
        caBundleLoaded: true,
        pooledConnectionReused,
        freshConnectionAfterEviction: thirdProcessId !== secondProcessId,
        localFreezeProxyPassed: localLifecyclePassed,
        lambdaRuntimeVerified,
        iamTokenRolloverVerified: lambdaRuntimeVerified,
        lambdaEvidenceSha256: lambdaEvidence?.evidenceSha256 ?? "not-supplied",
        lambdaRuntime: lambdaEvidence?.run.runtime ?? "not-supplied",
        lambdaNodeVersion: lambdaEvidence?.run.nodeVersion ?? "not-supplied",
        lambdaTokenWindowMs:
          lambdaEvidence?.rolloverInvocation.tokenValidityWindowMs ?? 0,
        lambdaElapsedBeforeReconnectMs:
          lambdaEvidence?.rolloverInvocation.elapsedSinceFirstConnectMs ?? 0,
        lambdaWarmProcessId: lambdaEvidence?.warmInvocation.processId ?? 0,
        lambdaReconnectedProcessId:
          lambdaEvidence?.rolloverInvocation.processIdAfterEviction ?? 0,
        temporaryResourcesDeleted:
          lambdaEvidence?.cleanup.lambdaDeleted === true &&
          lambdaEvidence.cleanup.iamRoleDeleted === true &&
          lambdaEvidence.cleanup.logGroupDeleted === true,
        firstProcessId,
        secondProcessId,
        thirdProcessId,
      },
    };
  } catch (error) {
    first?.release(true);
    second?.release(true);
    third?.release(true);
    return {
      id: "connector-lifecycle",
      status: "fail",
      durationMs: roundMs(performance.now() - startedAt),
      detail: errorMessage(error),
      evidence: { tlsRejectUnauthorized: true, caBundleLoaded: true },
    };
  }
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error)
    return error.message.replaceAll(/password=[^&\s]+/gi, "password=[redacted]");
  return String(error);
}

export function roundMs(value: number): number {
  return Math.round(value * 100) / 100;
}
