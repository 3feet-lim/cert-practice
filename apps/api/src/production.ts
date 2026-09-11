import {
  CryptoRandomSource,
  ImportService,
  LifecycleServices,
  SessionFactory,
} from "@cert-quiz/domain";
import { initializeDsqlRuntime } from "@cert-quiz/db";
import type { Hono } from "hono";

import { createApp } from "./app.js";
import type { ApiEnvironment } from "./authentication.js";
import { CognitoJwksTokenVerifier } from "./cognito-jwks-verifier.js";
import { CryptoUuidFactory } from "./adapters/crypto-random.js";
import {
  DynamoDbRateLimiter,
  parseDurableRateLimitPolicies,
  trustedApiGatewayClientIp,
} from "./durable-rate-limit.js";
import { createApiSecurityConfiguration } from "./security.js";
import {
  createCloudWatchEmbeddedMetricsTelemetry,
  emitTelemetry,
} from "./telemetry.js";

const DEFAULT_CLEANUP_BATCH_SIZE = 100;

type DeploymentStage = "dev" | "prod";

export type ProductionRuntimeConfiguration = Readonly<{
  stage: DeploymentStage;
  dsqlEndpoint: string;
  dsqlDatabase: string | undefined;
  dsqlUser: string | undefined;
  cognitoIssuer: string;
  cognitoClientId: string;
  webOrigin: string;
  markdownImageOrigins: readonly string[];
  rateLimitTable: string;
  rateLimitPolicies: ReturnType<typeof parseDurableRateLimitPolicies>;
  telemetryNamespace: string;
  telemetryService: string;
}>;

export type ProductionComposition = Readonly<{
  app: Hono<ApiEnvironment>;
  /** EventBridge retention entry point; it intentionally has no exam finalization path. */
  cleanupExpiredPracticeResults(batchSize?: number): Promise<number>;
}>;

/**
 * Reads only deployment-provided values. Serverless supplies these through
 * Terraform-owned, stage-scoped SSM parameters; no cloud lookup happens here.
 */
export function productionConfigurationFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ProductionRuntimeConfiguration {
  const stage = requiredStage(environment.STAGE);
  const markdownImageOrigins = (environment.MARKDOWN_IMAGE_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const webOrigin = required(environment, "WEB_ORIGIN");

  // Validate origin policy before opening a DB connection or accepting traffic.
  createApiSecurityConfiguration({
    stage,
    allowedOrigins: [webOrigin],
    markdownImageOrigins,
  });

  return Object.freeze({
    stage,
    dsqlEndpoint: required(environment, "DSQL_ENDPOINT"),
    dsqlDatabase: optional(environment, "DSQL_DATABASE"),
    dsqlUser: optional(environment, "DSQL_USER"),
    cognitoIssuer: required(environment, "COGNITO_ISSUER"),
    cognitoClientId: required(environment, "COGNITO_CLIENT_ID"),
    webOrigin,
    markdownImageOrigins: Object.freeze(markdownImageOrigins),
    rateLimitTable: required(environment, "RATE_LIMIT_TABLE"),
    rateLimitPolicies: parseDurableRateLimitPolicies(
      required(environment, "RATE_LIMIT_POLICIES"),
    ),
    telemetryNamespace: required(environment, "TELEMETRY_NAMESPACE"),
    telemetryService: required(environment, "TELEMETRY_SERVICE"),
  });
}

/**
 * Builds the complete production application once per Lambda execution environment.
 */
export async function createProductionComposition(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): Promise<ProductionComposition> {
  const configuration = productionConfigurationFromEnvironment(environment);
  const telemetry = createCloudWatchEmbeddedMetricsTelemetry(
    (line) => console.log(line),
    {
      namespace: configuration.telemetryNamespace,
      service: configuration.telemetryService,
      stage: configuration.stage,
    },
  );
  const runtimeStartedAt = performance.now();
  let runtime: Awaited<ReturnType<typeof initializeDsqlRuntime>>;
  try {
    runtime = await initializeDsqlRuntime({
      pool: {
        endpoint: configuration.dsqlEndpoint,
        region: required(environment, "AWS_REGION"),
        database: configuration.dsqlDatabase,
        user: configuration.dsqlUser,
        ...(environment.PGSSLROOTCERT ? { caPath: environment.PGSSLROOTCERT } : {}),
      },
    });
  } catch (error) {
    emitTelemetry(telemetry, {
      event: "db.runtime",
      outcome: "failed",
      errorCode: "runtime-initialization-failed",
      durationMs: performance.now() - runtimeStartedAt,
    });
    throw error;
  }
  emitTelemetry(telemetry, {
    event: "db.runtime",
    outcome: "completed",
    durationMs: performance.now() - runtimeStartedAt,
  });

  const ids = new CryptoUuidFactory();
  const random = new CryptoRandomSource();
  const now = () => new Date();
  const lifecycle = new LifecycleServices({
    unitOfWork: runtime.unitOfWork,
    sessionFactory: new SessionFactory({ ids, random, now }),
    now,
    createId: () => ids.next(),
  });
  const importService = new ImportService({ ids, random, now });
  const security = createApiSecurityConfiguration({
    stage: configuration.stage,
    allowedOrigins: [configuration.webOrigin],
    markdownImageOrigins: configuration.markdownImageOrigins,
  });
  const rateLimit = new DynamoDbRateLimiter({
    tableName: configuration.rateLimitTable,
    policies: configuration.rateLimitPolicies,
    now,
  });

  return Object.freeze({
    app: createApp(
      {
        tokenVerifier: new CognitoJwksTokenVerifier({
          issuer: configuration.cognitoIssuer,
          clientId: configuration.cognitoClientId,
          tokenUse: "id",
        }),
        unitOfWork: runtime.unitOfWork,
        now,
        createUserId: () => ids.next(),
        lifecycle,
        importService,
        rateLimit,
        clientIp: trustedApiGatewayClientIp,
        telemetry,
      },
      security,
    ),
    cleanupExpiredPracticeResults: async (batchSize = DEFAULT_CLEANUP_BATCH_SIZE) => {
      const startedAt = performance.now();
      try {
        const deleted = await lifecycle.cleanupPracticeResults(validateBatchSize(batchSize));
        emitTelemetry(telemetry, {
          event: "api.cleanup",
          outcome: "completed",
          count: deleted,
          durationMs: performance.now() - startedAt,
        });
        return deleted;
      } catch (error) {
        emitTelemetry(telemetry, {
          event: "api.cleanup",
          outcome: "failed",
          errorCode: "cleanup-failed",
          durationMs: performance.now() - startedAt,
        });
        throw error;
      }
    },
  });
}

let cachedComposition: Promise<ProductionComposition> | undefined;

/** Reuses the authenticated DSQL pool and application graph across Lambda warm invocations. */
export function productionComposition(): Promise<ProductionComposition> {
  if (cachedComposition) return cachedComposition;
  cachedComposition = createProductionComposition().catch((error: unknown) => {
    cachedComposition = undefined;
    throw error;
  });
  return cachedComposition;
}

function required(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string {
  const value = environment[name];
  if (!value || value.trim() !== value) throw new Error(`Missing required ${name}.`);
  return value;
}

function optional(
  environment: Readonly<Record<string, string | undefined>>,
  name: string,
): string | undefined {
  const value = environment[name];
  if (value === undefined || value === "") return undefined;
  if (value.trim() !== value)
    throw new Error(`${name} must not include surrounding whitespace.`);
  return value;
}

function requiredStage(value: string | undefined): DeploymentStage {
  if (value === "dev" || value === "prod") return value;
  throw new Error("STAGE must be dev or prod.");
}

function validateBatchSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000)
    throw new RangeError("Cleanup batch size must be an integer between 1 and 1000.");
  return value;
}
