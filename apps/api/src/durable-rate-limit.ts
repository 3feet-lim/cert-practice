import {
  DynamoDBClient,
  TransactWriteItemsCommand,
  type TransactWriteItemsCommandInput,
} from "@aws-sdk/client-dynamodb";
import { isIP } from "node:net";
import type { Context } from "hono";

import type { ApiEnvironment } from "./authentication.js";
import type { RateLimitDecision, RateLimitPort, RateLimitScope } from "./rate-limit.js";

const rateLimitScopes = [
  "admin-import",
  "exam-start",
  "exam-submit",
  "practice-start",
  "practice-submit",
] as const satisfies readonly RateLimitScope[];

type RateLimitPolicy = Readonly<{
  maxRequests: number;
  windowSeconds: number;
}>;

export type DurableRateLimitConfiguration = Readonly<{
  tableName: string;
  policies: Readonly<Record<RateLimitScope, RateLimitPolicy>>;
}>;

type DynamoDbCommandClient = Readonly<{
  send(command: TransactWriteItemsCommand): Promise<unknown>;
}>;

/**
 * Parses the Terraform-published, stage-scoped fixed-window policies. A
 * complete policy set is required so a deployment cannot silently omit a
 * protected mutation route.
 */
export function parseDurableRateLimitPolicies(
  value: string,
): DurableRateLimitConfiguration["policies"] {
  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    throw new Error("RATE_LIMIT_POLICIES must be valid JSON.");
  }
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new Error("RATE_LIMIT_POLICIES must be an object.");

  const record = input as Record<string, unknown>;
  const expected = new Set<string>(rateLimitScopes);
  if (
    Object.keys(record).length !== expected.size ||
    Object.keys(record).some((scope) => !expected.has(scope))
  )
    throw new Error("RATE_LIMIT_POLICIES must define exactly every protected scope.");

  const policies = {} as Record<RateLimitScope, RateLimitPolicy>;
  for (const scope of rateLimitScopes) {
    const policy = record[scope];
    if (!policy || typeof policy !== "object" || Array.isArray(policy))
      throw new Error(`RATE_LIMIT_POLICIES.${scope} must be an object.`);
    const candidate = policy as Record<string, unknown>;
    const maxRequests = candidate.maxRequests;
    const windowSeconds = candidate.windowSeconds;
    if (
      typeof maxRequests !== "number" ||
      !Number.isSafeInteger(maxRequests) ||
      maxRequests < 1 ||
      typeof windowSeconds !== "number" ||
      !Number.isSafeInteger(windowSeconds) ||
      windowSeconds < 1 ||
      windowSeconds > 3_600
    )
      throw new Error(`RATE_LIMIT_POLICIES.${scope} has invalid limits.`);
    policies[scope] = Object.freeze({ maxRequests, windowSeconds });
  }
  return Object.freeze(policies);
}

/**
 * Gets an address only from the Lambda adapter's API Gateway request context.
 * It deliberately never reads X-Forwarded-For: that header is browser
 * controlled once it reaches application code.
 */
export function resolveTrustedApiGatewayClientIp(
  requestContext: unknown,
): string | undefined {
  if (!requestContext || typeof requestContext !== "object") return undefined;
  const http = (requestContext as { http?: unknown }).http;
  if (!http || typeof http !== "object") return undefined;
  const sourceIp = (http as { sourceIp?: unknown }).sourceIp;
  return typeof sourceIp === "string" && isIP(sourceIp) !== 0 ? sourceIp : undefined;
}

/** Reads the adapter-provided API Gateway context that Hono stores on c.env. */
export function trustedApiGatewayClientIp(
  context: Context<ApiEnvironment>,
): string | undefined {
  const environment = context.env as unknown as { requestContext?: unknown };
  return resolveTrustedApiGatewayClientIp(environment.requestContext);
}

/**
 * A DynamoDB transaction increments both the authenticated actor bucket and,
 * when available, the API Gateway source-IP bucket. Fixed window IDs make
 * expiry reset-free; DynamoDB TTL only reclaims old rows and is never used for
 * enforcement. A transaction keeps the two dimensions all-or-nothing across
 * Lambda execution environments.
 */
export class DynamoDbRateLimiter implements RateLimitPort {
  readonly #policies: DurableRateLimitConfiguration["policies"];
  readonly #client: DynamoDbCommandClient;
  readonly #tableName: string;
  readonly #now: () => Date;

  constructor(
    configuration: DurableRateLimitConfiguration &
      Readonly<{ client?: DynamoDbCommandClient; now?: () => Date }>,
  ) {
    if (!configuration.tableName.trim())
      throw new Error("RATE_LIMIT_TABLE must not be empty.");
    this.#tableName = configuration.tableName;
    this.#policies = configuration.policies;
    this.#client = configuration.client ?? new DynamoDBClient({});
    this.#now = configuration.now ?? (() => new Date());
  }

  async consume(
    input: Readonly<{
      scope: RateLimitScope;
      actorId: string;
      clientIp: string | undefined;
    }>,
  ): Promise<RateLimitDecision> {
    const policy = this.#policies[input.scope];
    const nowSeconds = Math.floor(this.#now().getTime() / 1_000);
    const windowStart =
      Math.floor(nowSeconds / policy.windowSeconds) * policy.windowSeconds;
    const retryAfterSeconds = Math.max(
      1,
      windowStart + policy.windowSeconds - nowSeconds,
    );
    const dimensions = new Set([`actor:${input.actorId}`]);
    if (input.clientIp && isIP(input.clientIp) !== 0)
      dimensions.add(`ip:${input.clientIp}`);

    const transactItems: NonNullable<TransactWriteItemsCommandInput["TransactItems"]> =
      [...dimensions].map((dimension) => ({
        Update: {
          TableName: this.#tableName,
          Key: {
            bucketKey: {
              S: `${input.scope}:${windowStart}:${dimension}`,
            },
          },
          UpdateExpression:
            "SET #count = if_not_exists(#count, :zero) + :one, #expiresAt = :expiresAt",
          ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
          ExpressionAttributeNames: { "#count": "count", "#expiresAt": "expiresAt" },
          ExpressionAttributeValues: {
            ":zero": { N: "0" },
            ":one": { N: "1" },
            ":limit": { N: String(policy.maxRequests) },
            // TTL cleanup is deliberately after the active window; correctness is in bucketKey.
            ":expiresAt": { N: String(windowStart + policy.windowSeconds + 3_600) },
          },
        },
      }));

    try {
      await this.#client.send(
        new TransactWriteItemsCommand({ TransactItems: transactItems }),
      );
      return { allowed: true };
    } catch (error) {
      if (
        error instanceof Error &&
        (error.name === "TransactionCanceledException" ||
          error.name === "ConditionalCheckFailedException")
      )
        return { allowed: false, retryAfterSeconds };
      throw error;
    }
  }
}
