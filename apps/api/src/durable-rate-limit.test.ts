import type { TransactWriteItemsCommand } from "@aws-sdk/client-dynamodb";
import { describe, expect, it } from "vitest";

import {
  DynamoDbRateLimiter,
  parseDurableRateLimitPolicies,
  resolveTrustedApiGatewayClientIp,
} from "./durable-rate-limit.js";

const policies = parseDurableRateLimitPolicies(
  JSON.stringify({
    "admin-import": { maxRequests: 2, windowSeconds: 60 },
    "exam-start": { maxRequests: 2, windowSeconds: 60 },
    "exam-submit": { maxRequests: 2, windowSeconds: 60 },
    "practice-start": { maxRequests: 2, windowSeconds: 60 },
    "practice-submit": { maxRequests: 2, windowSeconds: 60 },
  }),
);

describe("durable rate limiting", () => {
  it("accepts only API Gateway v2 sourceIp values, never forwarded headers", () => {
    expect(
      resolveTrustedApiGatewayClientIp({ http: { sourceIp: "198.51.100.7" } }),
    ).toBe("198.51.100.7");
    expect(
      resolveTrustedApiGatewayClientIp({
        http: { sourceIp: "2001:db8::7" },
        headers: { "x-forwarded-for": "198.51.100.8" },
      }),
    ).toBe("2001:db8::7");
    expect(
      resolveTrustedApiGatewayClientIp({
        http: { sourceIp: "not-an-ip" },
        headers: { "x-forwarded-for": "198.51.100.8" },
      }),
    ).toBeUndefined();
    expect(
      resolveTrustedApiGatewayClientIp({ identity: { sourceIp: "198.51.100.8" } }),
    ).toBeUndefined();
  });

  it("uses one atomic actor/IP transaction and returns the remaining window on a limit", async () => {
    const commands: TransactWriteItemsCommand[] = [];
    const limiter = new DynamoDbRateLimiter({
      tableName: "certquiz-dev-rate-limit",
      policies,
      now: () => new Date("2026-01-01T00:00:45.000Z"),
      client: {
        async send(command) {
          commands.push(command);
          throw Object.assign(new Error("condition failed"), {
            name: "TransactionCanceledException",
          });
        },
      },
    });

    await expect(
      limiter.consume({
        scope: "exam-submit",
        actorId: "user-1",
        clientIp: "198.51.100.7",
      }),
    ).resolves.toEqual({ allowed: false, retryAfterSeconds: 15 });
    const items = commands[0]?.input.TransactItems;
    expect(items).toHaveLength(2);
    expect(items?.map((item) => item.Update?.Key.bucketKey?.S)).toEqual([
      "exam-submit:1767225600:actor:user-1",
      "exam-submit:1767225600:ip:198.51.100.7",
    ]);
    expect(
      items?.every((item) =>
        item.Update?.ConditionExpression?.includes("#count < :limit"),
      ),
    ).toBe(true);
  });

  it("requires an exact policy set and rejects malformed deployment configuration", () => {
    expect(() => parseDurableRateLimitPolicies("{}")).toThrow(
      "RATE_LIMIT_POLICIES must define exactly every protected scope.",
    );
    expect(() =>
      parseDurableRateLimitPolicies(
        JSON.stringify({
          "admin-import": { maxRequests: 0, windowSeconds: 60 },
          "exam-start": { maxRequests: 2, windowSeconds: 60 },
          "exam-submit": { maxRequests: 2, windowSeconds: 60 },
          "practice-start": { maxRequests: 2, windowSeconds: 60 },
          "practice-submit": { maxRequests: 2, windowSeconds: 60 },
        }),
      ),
    ).toThrow("RATE_LIMIT_POLICIES.admin-import has invalid limits.");
  });
});
