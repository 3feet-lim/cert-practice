import type { MiddlewareHandler } from "hono";

export type ApiSecurityConfiguration = Readonly<{
  stage: "dev" | "prod";
  allowedOrigins: readonly string[];
  markdownImageOrigins: readonly string[];
  hstsEnabled: boolean;
}>;

type ApiSecurityConfigurationInput = Readonly<{
  stage: "dev" | "prod";
  allowedOrigins: readonly string[];
  markdownImageOrigins?: readonly string[];
  hstsEnabled?: boolean;
}>;

function canonicalOrigin(value: string, label: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute origin.`);
  }
  if (
    parsed.origin !== value ||
    parsed.pathname !== "/" ||
    parsed.search ||
    parsed.hash
  )
    throw new Error(`${label} must not include a path, query, or fragment.`);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new Error(`${label} must use HTTPS or localhost HTTP.`);
  if (parsed.protocol === "http:" && parsed.hostname !== "localhost")
    throw new Error(`${label} may use HTTP only for localhost.`);
  return parsed.origin;
}

/**
 * Validates explicit HTTP security configuration. Production intentionally
 * permits exactly one HTTPS SPA origin; wildcard CORS is never accepted.
 */
export function createApiSecurityConfiguration(
  input: ApiSecurityConfigurationInput,
): ApiSecurityConfiguration {
  const allowedOrigins = [
    ...new Set(
      input.allowedOrigins.map((origin) => canonicalOrigin(origin, "allowedOrigins")),
    ),
  ];
  const markdownImageOrigins = [
    ...new Set(
      (input.markdownImageOrigins ?? []).map((origin) =>
        canonicalOrigin(origin, "markdownImageOrigins"),
      ),
    ),
  ];
  if (input.stage === "prod") {
    if (allowedOrigins.length !== 1)
      throw new Error("Production requires exactly one SPA allowed origin.");
    if (!allowedOrigins[0]?.startsWith("https://"))
      throw new Error("Production SPA origin must use HTTPS.");
    if (markdownImageOrigins.some((origin) => !origin.startsWith("https://")))
      throw new Error("Production Markdown image origins must use HTTPS.");
  }
  return Object.freeze({
    stage: input.stage,
    allowedOrigins: Object.freeze(allowedOrigins),
    markdownImageOrigins: Object.freeze(markdownImageOrigins),
    hstsEnabled: input.hstsEnabled ?? input.stage === "prod",
  });
}

/** Health-only bootstrap has no browser origin until a deployment supplies one. */
export const healthOnlySecurityConfiguration = createApiSecurityConfiguration({
  stage: "dev",
  allowedOrigins: [],
  markdownImageOrigins: [],
  hstsEnabled: false,
});

function contentSecurityPolicy(configuration: ApiSecurityConfiguration): string {
  const imageSources = ["'self'", ...configuration.markdownImageOrigins].join(" ");
  return [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'none'",
    `img-src ${imageSources}`,
  ].join("; ");
}

function appendVary(context: Parameters<MiddlewareHandler>[0], value: string): void {
  const existing = context.res.headers.get("Vary");
  context.header("Vary", existing ? `${existing}, ${value}` : value);
}

/** Applies API response headers and exact-origin CORS before route handlers run. */
export function securityBoundary(
  configuration: ApiSecurityConfiguration,
): MiddlewareHandler {
  return async (context, next) => {
    context.header("Content-Security-Policy", contentSecurityPolicy(configuration));
    context.header("Referrer-Policy", "no-referrer");
    context.header("X-Content-Type-Options", "nosniff");
    context.header("X-Frame-Options", "DENY");
    if (configuration.hstsEnabled)
      context.header(
        "Strict-Transport-Security",
        "max-age=63072000; includeSubDomains",
      );

    const origin = context.req.header("origin");
    const allowed =
      origin !== undefined && configuration.allowedOrigins.includes(origin);
    if (origin !== undefined) appendVary(context, "Origin");
    if (allowed) {
      context.header("Access-Control-Allow-Origin", origin);
      context.header(
        "Access-Control-Allow-Headers",
        "authorization, content-type, x-request-id",
      );
      context.header("Access-Control-Allow-Methods", "GET, PATCH, POST, OPTIONS");
      context.header("Access-Control-Max-Age", "600");
    }
    if (context.req.method === "OPTIONS") {
      if (!allowed) return context.json({ error: "origin-not-allowed" }, 403);
      return context.body(null, 204);
    }
    await next();
  };
}
