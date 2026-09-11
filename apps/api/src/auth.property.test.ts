// Feature: cert-quiz-mvp, Properties 1, 2, and 3
import {
  errorEnvelopeSchema,
  pendingUsersDtoSchema,
  successEnvelopeSchema,
} from "@cert-quiz/contracts";
import { InMemoryUnitOfWork } from "@cert-quiz/db";
import { domainFailure, type UserProfile } from "@cert-quiz/domain";
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createApp, type CreateAppDependencies } from "./app.js";
import type { CognitoTokenVerifier, VerifiedCognitoClaims } from "./authentication.js";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const ADMIN_ID = "10000000-0000-4000-8000-000000000001";
const TARGET_ID = "10000000-0000-4000-8000-000000000002";

const identity = (sub: string, suffix = sub): VerifiedCognitoClaims => ({
  identities: JSON.stringify([{ providerName: "Google", userId: sub }]),
  name: `Name ${suffix}`,
  email: `${suffix}@example.test`,
});

class PropertyVerifier implements CognitoTokenVerifier {
  constructor(private readonly tokens: ReadonlyMap<string, VerifiedCognitoClaims>) {}

  async verify(token: string): Promise<VerifiedCognitoClaims> {
    const claims = this.tokens.get(token);
    if (!claims) throw domainFailure("unauthenticated");
    return claims;
  }
}

function user(
  id: string,
  googleSub: string,
  options: Partial<UserProfile> = {},
): UserProfile {
  return {
    id,
    googleSub,
    displayName: options.displayName ?? "Name",
    email: options.email ?? `${googleSub}@example.test`,
    role: options.role ?? "user",
    approvalStatus: options.approvalStatus ?? "pending",
    scorePublic: options.scorePublic ?? false,
    firstLoginAt: options.firstLoginAt ?? NOW,
    approvedAt: options.approvedAt ?? null,
    version: options.version ?? 0n,
  };
}

function makeApp(
  database: InMemoryUnitOfWork,
  tokens: ReadonlyMap<string, VerifiedCognitoClaims>,
  nextId = () => "10000000-0000-4000-8000-000000000099",
) {
  const dependencies: CreateAppDependencies = {
    tokenVerifier: new PropertyVerifier(tokens),
    unitOfWork: database,
    now: () => new Date(NOW),
    createUserId: nextId,
  };
  return createApp(dependencies);
}

function request(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...init.headers },
  };
}

function generatedId(index: number): string {
  return `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
}

// **Property 1: External identity and new-profile invariants**
// **Validates: Requirements 1.4-1.6, 1.13, 1.14, 14.1**
describe("Property 1: external identity and new-profile invariants", () => {
  it("keeps one pending/private profile through concurrent logins, email changes, and faults", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 999_999 }),
        fc.integer({ min: 2, max: 20 }),
        async (subjectNumber, concurrentLogins) => {
          const googleSub = `google-${subjectNumber}`;
          const database = new InMemoryUnitOfWork();
          let id = 10;
          const app = makeApp(
            database,
            new Map(
              Array.from({ length: concurrentLogins }, (_, index) => [
                `login-${index}`,
                identity(googleSub, `initial-${index}`),
              ]),
            ),
            () => `30000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
          );
          await Promise.all(
            Array.from({ length: concurrentLogins }, (_, index) =>
              app.request("http://localhost/v1/me/approval", request(`login-${index}`)),
            ),
          );
          const profiles = await database.transaction((repositories) =>
            repositories.users.findPending(),
          );
          expect(profiles).toHaveLength(1);
          expect(profiles[0]).toMatchObject({
            googleSub,
            approvalStatus: "pending",
            role: "user",
            scorePublic: false,
          });

          const changedApp = makeApp(
            database,
            new Map([["changed", identity(googleSub, `changed-${subjectNumber}`)]]),
          );
          expect(
            (
              await changedApp.request(
                "http://localhost/v1/me/approval",
                request("changed"),
              )
            ).status,
          ).toBe(200);
          const changed = await database.transaction((repositories) =>
            repositories.users.findPending(),
          );
          expect(changed).toHaveLength(1);
          expect(changed[0]?.email).toBe(`changed-${subjectNumber}@example.test`);

          database.failNext("profile-write");
          const failedApp = makeApp(
            database,
            new Map([["fault", identity(`fault-${googleSub}`)]]),
          );
          const failed = await failedApp.request(
            "http://localhost/v1/me/approval",
            request("fault"),
          );
          expect(failed.status).toBe(503);
          const afterFault = await database.transaction((repositories) =>
            repositories.users.findPending(),
          );
          expect(afterFault).toEqual(changed);
        },
      ),
      { numRuns: 200 },
    );
  }, 120_000);
});

// **Property 2: Authentication/authorization non-interference and role boundaries**
// **Validates: Requirements 1.1-1.3, 1.7, 1.8, 1.11, 1.12, 2.1-2.4**
describe("Property 2: authorization non-interference and role boundaries", () => {
  it("rejects every disallowed actor/route pair without target mutation or protected-data disclosure", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("invalid", "pending", "user", "admin"),
        fc.constantFrom("approval", "profile", "visibility", "pending-list", "approve"),
        async (kind, operation) => {
          const database = new InMemoryUnitOfWork();
          database.seedUser(
            user(ADMIN_ID, "google-admin", {
              role: "admin",
              approvalStatus: "approved",
              approvedAt: NOW,
              email: "admin@example.test",
              displayName: "Name admin",
            }),
          );
          database.seedUser(
            user(TARGET_ID, "sensitive-google-sub", {
              email: "target@example.test",
              displayName: "Protected target",
            }),
          );
          database.seedUser(
            user("10000000-0000-4000-8000-000000000003", "google-pending", {
              email: "pending@example.test",
              displayName: "Name pending",
            }),
          );
          database.seedUser(
            user("10000000-0000-4000-8000-000000000004", "google-user", {
              approvalStatus: "approved",
              approvedAt: NOW,
              email: "user@example.test",
              displayName: "Name user",
            }),
          );
          const app = makeApp(
            database,
            new Map([
              ["pending", identity("google-pending", "pending")],
              ["user", identity("google-user", "user")],
              ["admin", identity("google-admin", "admin")],
            ]),
          );
          const requestDefinition = {
            approval: { url: "/v1/me/approval", init: {} },
            profile: { url: "/v1/me", init: {} },
            visibility: {
              url: "/v1/me/score-visibility",
              init: {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ scorePublic: true, expectedVersion: 0 }),
              },
            },
            "pending-list": { url: "/v1/admin/pending-users", init: {} },
            approve: {
              url: `/v1/admin/users/${TARGET_ID}/approve`,
              init: { method: "POST" },
            },
          }[operation];
          const before = await database.transaction((repositories) =>
            repositories.users.findById(TARGET_ID),
          );
          const response = await app.request(
            `http://localhost${requestDefinition.url}`,
            request(kind, requestDefinition.init),
          );
          const allowed =
            (operation === "approval" && kind !== "invalid") ||
            ((operation === "profile" || operation === "visibility") &&
              (kind === "user" || kind === "admin")) ||
            ((operation === "pending-list" || operation === "approve") &&
              kind === "admin");
          expect(response.ok).toBe(allowed);
          const payload: unknown = await response.json();
          if (!allowed) {
            expect(errorEnvelopeSchema.parse(payload).error.code).toMatch(
              /^(authentication-invalid|approval-required|admin-required)$/,
            );
            expect(JSON.stringify(payload)).not.toContain(TARGET_ID);
            expect(JSON.stringify(payload)).not.toContain("sensitive-google-sub");
            expect(
              await database.transaction((repositories) =>
                repositories.users.findById(TARGET_ID),
              ),
            ).toEqual(before);
          }
        },
      ),
      { numRuns: 200 },
    );
  }, 120_000);
});

// **Property 3: Approval transition and pending-list determinism**
// **Validates: Requirements 1.9, 1.10, 1.15, 2.5, 2.6**
describe("Property 3: approval transition and pending-list determinism", () => {
  it("orders unique pending users deterministically and keeps failed/replayed approvals atomic", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.integer({ min: 10, max: 99_999 }), {
          minLength: 0,
          maxLength: 6,
        }),
        fc.boolean(),
        async (identifiers, injectFault) => {
          const database = new InMemoryUnitOfWork();
          database.seedUser(
            user(ADMIN_ID, "google-admin", {
              role: "admin",
              approvalStatus: "approved",
              approvedAt: NOW,
              email: "admin@example.test",
              displayName: "Name admin",
            }),
          );
          for (const [index, identifier] of identifiers.entries()) {
            database.seedUser(
              user(generatedId(identifier), `pending-${identifier}`, {
                displayName: `Pending ${identifier}`,
                email: `pending-${identifier}@example.test`,
                firstLoginAt: new Date(NOW.getTime() + index * 1000),
              }),
            );
          }
          const app = makeApp(
            database,
            new Map([["admin", identity("google-admin", "admin")]]),
          );
          const initial = await app.request(
            "http://localhost/v1/admin/pending-users",
            request("admin"),
          );
          const listed = successEnvelopeSchema(pendingUsersDtoSchema).parse(
            await initial.json(),
          ).data.users;
          expect(listed.map((entry) => entry.id)).toEqual(identifiers.map(generatedId));

          for (const [index, identifier] of identifiers.entries()) {
            const id = generatedId(identifier);
            if (injectFault && index === 0) {
              database.failNext("approval-write");
              const failed = await app.request(
                `http://localhost/v1/admin/users/${id}/approve`,
                request("admin", { method: "POST" }),
              );
              expect(failed.status).toBe(503);
              expect(
                (
                  await database.transaction((repositories) =>
                    repositories.users.findById(id),
                  )
                )?.approvalStatus,
              ).toBe("pending");
            }
            const approved = await app.request(
              `http://localhost/v1/admin/users/${id}/approve`,
              request("admin", { method: "POST" }),
            );
            expect(approved.status).toBe(200);
            const first = await database.transaction((repositories) =>
              repositories.users.findById(id),
            );
            const replay = await app.request(
              `http://localhost/v1/admin/users/${id}/approve`,
              request("admin", { method: "POST" }),
            );
            expect(replay.status).toBe(200);
            expect(
              await database.transaction((repositories) =>
                repositories.users.findById(id),
              ),
            ).toEqual(first);
          }
          const finalResponse = await app.request(
            "http://localhost/v1/admin/pending-users",
            request("admin"),
          );
          expect(
            successEnvelopeSchema(pendingUsersDtoSchema).parse(
              await finalResponse.json(),
            ).data.users,
          ).toEqual([]);
        },
      ),
      { numRuns: 200 },
    );
  }, 120_000);
});
