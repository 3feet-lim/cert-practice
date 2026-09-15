import { handle } from "hono/aws-lambda";

import { app, createApp } from "./app.js";
import {
  createApiSecurityConfiguration,
  type ApiSecurityConfiguration,
} from "./security.js";

type DeploymentStage = "dev" | "prod";

type ApiGatewayV2Request = Readonly<{
  rawPath?: unknown;
  requestContext?: Readonly<{
    http?: Readonly<{ method?: unknown }>;
  }>;
}>;

function deploymentStage(value: string | undefined): DeploymentStage {
  if (value === "dev" || value === "prod") return value;
  throw new Error("STAGE must be dev or prod.");
}

function configuredOrigins(value: string | undefined): string[] {
  if (value === undefined || value === "") return [];
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/**
 * The probe must not depend on protected-route configuration or any database
 * module. It still enforces the deployed origin policy and HTTPS transport
 * headers for the public API Gateway health endpoint.
 */
export function deployedHealthSecurityConfiguration(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ApiSecurityConfiguration {
  return createApiSecurityConfiguration({
    stage: deploymentStage(environment.STAGE),
    allowedOrigins: configuredOrigins(environment.WEB_ORIGIN),
    markdownImageOrigins: configuredOrigins(environment.MARKDOWN_IMAGE_ORIGINS),
    hstsEnabled: true,
  });
}

let cachedDeployedHealthApp: ReturnType<typeof createApp> | undefined;

/** Reuses the public, dependency-free health app across Lambda warm invocations. */
export function deployedHealthApp() {
  if (cachedDeployedHealthApp) return cachedDeployedHealthApp;
  cachedDeployedHealthApp = createApp(undefined, deployedHealthSecurityConfiguration());
  return cachedDeployedHealthApp;
}

function isApiGatewayV2PublicRequest(event: unknown): boolean {
  const request = event as ApiGatewayV2Request | null;
  if (request === null || typeof request !== "object") return false;
  const { rawPath } = request;
  const method = request.requestContext?.http?.method;
  return (
    (rawPath === "/v1/health" && method === "GET") ||
    (typeof rawPath === "string" && rawPath.startsWith("/v1/") && method === "OPTIONS")
  );
}

/**
 * Keeps production composition behind a dynamic boundary so a public health
 * probe can run even when protected-route startup (including DB migrations)
 * cannot initialize. The module is only loaded for protected API traffic or
 * the EventBridge retention handler.
 */
async function loadProductionComposition() {
  const { productionComposition } = await import("./production.js");
  return productionComposition();
}

/** Lazily composes the production graph once and reuses it for Lambda warm starts. */
export async function handler(...args: Parameters<ReturnType<typeof handle>>) {
  if (process.env.CERTQUIZ_LOCAL_EMULATION === "true") {
    return handle(app)(...args);
  }

  if (isApiGatewayV2PublicRequest(args[0])) {
    return handle(deployedHealthApp())(...args);
  }

  const { app: productionApp } = await loadProductionComposition();
  return handle(productionApp)(...args);
}

/**
 * EventBridge retention handler. It deliberately invokes only the bounded
 * completed-practice cleanup operation; expired exams remain lazy-finalized by
 * authenticated owner API requests.
 */
export async function practiceRetentionHandler(): Promise<{ deleted: number }> {
  const composition = await loadProductionComposition();
  return { deleted: await composition.cleanupExpiredPracticeResults() };
}
