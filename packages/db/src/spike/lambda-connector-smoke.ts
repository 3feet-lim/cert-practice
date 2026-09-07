import { randomUUID } from "node:crypto";

import { AuroraDSQLPool } from "@aws/aurora-dsql-node-postgres-connector";
import type { PoolClient } from "pg";

const endpoint = requiredEnvironment("DSQL_ENDPOINT");
const region = requiredEnvironment("AWS_REGION");
const environmentId = randomUUID();
const initializedAt = Date.now();
const tokenValidityWindowMs = 15 * 60_000;

const pool = new AuroraDSQLPool({
  host: endpoint,
  port: 5432,
  database: process.env.DSQL_DATABASE ?? "postgres",
  user: process.env.DSQL_USER ?? "admin",
  region,
  ssl: { rejectUnauthorized: true },
  keepAlive: true,
  max: 1,
  idleTimeoutMillis: 20 * 60_000,
  maxLifetimeSeconds: 3_300,
  connectionTimeoutMillis: 15_000,
  retry: {
    maxRetries: 8,
    baseDelayMs: 25,
    maxDelayMs: 100,
    jitterFactor: 0.2,
  },
});

type ClientWithProcessId = PoolClient & { processID?: number };
type SmokeAction = "ping" | "evict-reconnect";
type SmokeEvent = { action?: SmokeAction };

let invocationCount = 0;
let firstConnectedAt: number | undefined;
let initialProcessId: number | undefined;

export async function handler(event: SmokeEvent = {}): Promise<{
  action: SmokeAction;
  environmentId: string;
  invocationCount: number;
  coldStart: boolean;
  initializedAt: string;
  firstConnectedAt: string;
  elapsedSinceFirstConnectMs: number;
  tokenValidityWindowMs: number;
  tokenWindowElapsed: boolean;
  initialProcessId: number;
  processIdBeforeEviction: number;
  processIdAfterEviction: number;
  reusedInitialConnection: boolean;
  freshConnectionAfterEviction: boolean;
  tlsRejectUnauthorized: true;
  caSource: "node-default-root-store";
  runtime: string;
}> {
  invocationCount += 1;
  const action = event.action ?? "ping";
  let first: ClientWithProcessId | undefined;
  let second: ClientWithProcessId | undefined;

  try {
    first = (await pool.connect()) as ClientWithProcessId;
    await first.query("SELECT 1 AS connected");
    const processIdBeforeEviction = first.processID ?? -1;
    firstConnectedAt ??= Date.now();
    initialProcessId ??= processIdBeforeEviction;

    let processIdAfterEviction = processIdBeforeEviction;
    if (action === "evict-reconnect") {
      first.release(true);
      first = undefined;
      second = (await pool.connect()) as ClientWithProcessId;
      await second.query("SELECT 1 AS reconnected");
      processIdAfterEviction = second.processID ?? -2;
      second.release();
      second = undefined;
    } else {
      first.release();
      first = undefined;
    }

    const elapsedSinceFirstConnectMs = Date.now() - firstConnectedAt;
    return {
      action,
      environmentId,
      invocationCount,
      coldStart: invocationCount === 1,
      initializedAt: new Date(initializedAt).toISOString(),
      firstConnectedAt: new Date(firstConnectedAt).toISOString(),
      elapsedSinceFirstConnectMs,
      tokenValidityWindowMs,
      tokenWindowElapsed: elapsedSinceFirstConnectMs >= tokenValidityWindowMs,
      initialProcessId,
      processIdBeforeEviction,
      processIdAfterEviction,
      reusedInitialConnection: processIdBeforeEviction === initialProcessId,
      freshConnectionAfterEviction:
        action === "evict-reconnect" &&
        processIdAfterEviction !== processIdBeforeEviction,
      tlsRejectUnauthorized: true,
      caSource: "node-default-root-store",
      runtime: process.version,
    };
  } catch (error) {
    first?.release(true);
    second?.release(true);
    throw new Error(redactError(error), { cause: error });
  }
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function redactError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replaceAll(/password=[^&\s]+/giu, "password=[redacted]");
}
