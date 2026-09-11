import type { Context } from "hono";
import type { ApiEnvironment } from "./authentication.js";
export type RateLimitScope =
  "admin-import" | "exam-start" | "exam-submit" | "practice-start" | "practice-submit";
export type RateLimitDecision = Readonly<{
  allowed: boolean;
  /** Whole seconds until the caller may retry; required for a rejection. */
  retryAfterSeconds?: number;
}>;
export type RateLimitPort = Readonly<{
  consume(
    input: Readonly<{
      scope: RateLimitScope;
      actorId: string;
      clientIp: string | undefined;
    }>,
  ): Promise<RateLimitDecision>;
}>;
export class RateLimitExceeded extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super("Request rate limit exceeded.");
    this.name = "RateLimitExceeded";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
export function isRateLimitExceeded(error: unknown): error is RateLimitExceeded {
  return error instanceof RateLimitExceeded;
}
/**
 * Enforces a decision made by an injected shared limiter. There is deliberately
 * no in-process fallback: Lambda concurrency cannot provide a production limit.
 */
export async function enforceRateLimit(
  context: Context<ApiEnvironment>,
  rateLimit: RateLimitPort | undefined,
  scope: RateLimitScope,
  clientIp: ((context: Context<ApiEnvironment>) => string | undefined) | undefined,
): Promise<void> {
  if (!rateLimit) return;
  const decision = await rateLimit.consume({
    scope,
    actorId: context.get("actor").userId,
    clientIp: clientIp?.(context),
  });
  if (decision.allowed) return;
  const retryAfterSeconds = decision.retryAfterSeconds ?? 0;
  if (!Number.isInteger(retryAfterSeconds) || retryAfterSeconds < 1)
    throw new Error("Rate limiter rejected a request without a valid retry delay.");
  throw new RateLimitExceeded(retryAfterSeconds);
}
