import {
  approvalStatusDtoSchema,
  approveUserResponseSchema,
  currentUserDtoSchema,
  errorEnvelopeSchema,
  pendingUsersDtoSchema,
  successEnvelopeSchema,
  updateScoreVisibilityResponseSchema,
} from "@cert-quiz/contracts";
import { InMemoryUnitOfWork } from "@cert-quiz/db";
import { domainFailure, type UserProfile } from "@cert-quiz/domain";
import { describe, expect, it } from "vitest";

import {
  createApp,
  type CognitoTokenVerifier,
  type CreateAppDependencies,
} from "./app.js";
import type { VerifiedCognitoClaims } from "./authentication.js";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const ADMIN_ID = "00000000-0000-4000-8000-000000000001";
const PENDING_ID = "00000000-0000-4000-8000-000000000002";

class FixtureVerifier implements CognitoTokenVerifier {
  constructor(private readonly tokens: ReadonlyMap<string, VerifiedCognitoClaims>) {}

  async verify(token: string): Promise<VerifiedCognitoClaims> {
    const claims = this.tokens.get(token);
    if (!claims) throw domainFailure("unauthenticated");
    return claims;
  }
}

function claims(
  googleSub: string,
  email = `${googleSub}@example.test`,
  name = `User ${googleSub}`,
): VerifiedCognitoClaims {
  return {
    identities: JSON.stringify([{ providerName: "Google", userId: googleSub }]),
    email,
    name,
  };
}

function profile(
  input: Partial<UserProfile> & Pick<UserProfile, "id" | "googleSub">,
): UserProfile {
  return {
    id: input.id,
    googleSub: input.googleSub,
    displayName: input.displayName ?? "Admin",
    email: input.email ?? "admin@example.test",
    role: input.role ?? "user",
    approvalStatus: input.approvalStatus ?? "pending",
    scorePublic: input.scorePublic ?? false,
    firstLoginAt: input.firstLoginAt ?? NOW,
    approvedAt: input.approvedAt ?? null,
    version: input.version ?? 0n,
  };
}

function fixture(tokens: ReadonlyMap<string, VerifiedCognitoClaims> = new Map()) {
  const database = new InMemoryUnitOfWork();
  let sequence = 100;
  const dependencies: CreateAppDependencies = {
    tokenVerifier: new FixtureVerifier(tokens),
    unitOfWork: database,
    now: () => new Date(NOW),
    createUserId: () =>
      `00000000-0000-4000-8000-${String(sequence++).padStart(12, "0")}`,
  };
  return { app: createApp(dependencies), database, dependencies };
}

function authorize(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...init.headers },
  };
}

async function body(response: Response): Promise<unknown> {
  expect(response.headers.get("content-type")).toContain("application/json");
  return response.json();
}

describe("offline Cognito authentication and authorization routes", () => {
  it("keeps the health probe public when protected dependencies are composed", async () => {
    const { app } = fixture();
    const response = await app.request("http://localhost/v1/health");
    expect(response.status).toBe(200);
  });

  it("rejects invalid verifier outcomes and malformed Google identities before profile mutation", async () => {
    const missingGoogle: VerifiedCognitoClaims = {
      identities: JSON.stringify([{ providerName: "LoginWithAmazon", userId: "a" }]),
    };
    const duplicateGoogle: VerifiedCognitoClaims = {
      identities: JSON.stringify([
        { providerName: "Google", userId: "first" },
        { providerName: "Google", userId: "second" },
      ]),
    };
    const { app, database } = fixture(
      new Map([
        ["missing-google", missingGoogle],
        ["duplicate-google", duplicateGoogle],
      ]),
    );

    for (const token of [
      "expired-token",
      "wrong-issuer-token",
      "wrong-audience-token",
      "missing-google",
      "duplicate-google",
    ]) {
      const response = await app.request(
        "http://localhost/v1/me/approval",
        authorize(token),
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      const payload = errorEnvelopeSchema.parse(await body(response));
      expect(JSON.stringify(payload)).not.toContain(token);
      expect(JSON.stringify(payload)).not.toContain("identities");
    }
    await database.transaction(async (repositories) => {
      expect(await repositories.users.findPending()).toEqual([]);
    });
  });

  it("allows a pending profile only to read its approval and blocks profile mutation", async () => {
    const { app, database } = fixture(new Map([["pending", claims("pending")]]));
    const approval = await app.request(
      "http://localhost/v1/me/approval",
      authorize("pending"),
    );
    expect(approval.status).toBe(200);
    expect(
      successEnvelopeSchema(approvalStatusDtoSchema).parse(await body(approval)).data,
    ).toEqual({ approvalStatus: "pending" });

    const before = await database.transaction((repositories) =>
      repositories.users.findPending(),
    );
    const blocked = await app.request(
      "http://localhost/v1/me/score-visibility",
      authorize("pending", {
        method: "PATCH",
        body: JSON.stringify({ scorePublic: true, expectedVersion: 0 }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(blocked.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await body(blocked)).error.code).toBe(
      "approval-required",
    );
    const after = await database.transaction((repositories) =>
      repositories.users.findPending(),
    );
    expect(after).toEqual(before);
  });

  it("enforces approved/admin policies, strict envelopes, version checks, and idempotent approval", async () => {
    const tokens = new Map([
      ["admin", claims("google-admin", "admin@example.test", "Admin")],
      ["user", claims("google-user", "user@example.test", "User")],
    ]);
    const { app, database } = fixture(tokens);
    database.seedUser(
      profile({
        id: ADMIN_ID,
        googleSub: "google-admin",
        role: "admin",
        approvalStatus: "approved",
        approvedAt: NOW,
      }),
    );
    database.seedUser(
      profile({
        id: PENDING_ID,
        googleSub: "google-pending",
        displayName: "User google-pending",
        email: "pending@example.test",
      }),
    );
    database.seedUser(
      profile({
        id: "00000000-0000-4000-8000-000000000003",
        googleSub: "google-user",
        displayName: "User",
        email: "user@example.test",
        approvalStatus: "approved",
        approvedAt: NOW,
      }),
    );

    const userAdminRoute = await app.request(
      "http://localhost/v1/admin/pending-users",
      authorize("user"),
    );
    expect(userAdminRoute.status).toBe(403);
    const denied = errorEnvelopeSchema.parse(await body(userAdminRoute));
    expect(denied.error.code).toBe("admin-required");
    expect(JSON.stringify(denied)).not.toContain(PENDING_ID);

    const pending = await app.request(
      "http://localhost/v1/admin/pending-users",
      authorize("admin"),
    );
    expect(pending.status).toBe(200);
    expect(
      successEnvelopeSchema(pendingUsersDtoSchema).parse(await body(pending)).data,
    ).toEqual({
      users: [
        {
          id: PENDING_ID,
          displayName: "User google-pending",
          email: "pending@example.test",
          firstLoginAt: NOW.toISOString(),
        },
      ],
    });

    for (const attempt of [0, 1]) {
      const approval = await app.request(
        `http://localhost/v1/admin/users/${PENDING_ID}/approve`,
        authorize("admin", { method: "POST" }),
      );
      expect(approval.status).toBe(200);
      expect(
        successEnvelopeSchema(approveUserResponseSchema).parse(await body(approval))
          .data,
      ).toEqual({ userId: PENDING_ID, approvalStatus: "approved" });
      if (attempt === 0) {
        const approved = await database.transaction((repositories) =>
          repositories.users.findById(PENDING_ID),
        );
        expect(approved?.approvedAt).toEqual(NOW);
        expect(approved?.version).toBe(1n);
      }
    }

    const current = await app.request("http://localhost/v1/me", authorize("user"));
    expect(current.status).toBe(200);
    const newlyApproved = await app.request(
      "http://localhost/v1/me",
      authorize("admin"),
    );
    const currentUser = successEnvelopeSchema(currentUserDtoSchema).parse(
      await body(newlyApproved),
    ).data;
    expect(currentUser).toMatchObject({ id: ADMIN_ID, role: "admin" });

    const saved = await app.request(
      "http://localhost/v1/me/score-visibility",
      authorize("admin", {
        method: "PATCH",
        body: JSON.stringify({
          scorePublic: true,
          expectedVersion: currentUser.stateVersion,
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(
      successEnvelopeSchema(updateScoreVisibilityResponseSchema).parse(
        await body(saved),
      ).data,
    ).toEqual({ scorePublic: true, stateVersion: currentUser.stateVersion + 1 });
    const stale = await app.request(
      "http://localhost/v1/me/score-visibility",
      authorize("admin", {
        method: "PATCH",
        body: JSON.stringify({
          scorePublic: false,
          expectedVersion: currentUser.stateVersion,
        }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(stale.status).toBe(409);
    expect(errorEnvelopeSchema.parse(await body(stale)).error.code).toBe(
      "stale-version",
    );
  });

  it("rolls back a failed approval without exposing the target profile", async () => {
    const { app, database } = fixture(
      new Map([["admin", claims("google-admin", "admin@example.test", "Admin")]]),
    );
    database.seedUser(
      profile({
        id: ADMIN_ID,
        googleSub: "google-admin",
        role: "admin",
        approvalStatus: "approved",
        approvedAt: NOW,
      }),
    );
    database.seedUser(profile({ id: PENDING_ID, googleSub: "google-pending" }));
    database.failNext("approval-write");

    const response = await app.request(
      `http://localhost/v1/admin/users/${PENDING_ID}/approve`,
      authorize("admin", { method: "POST" }),
    );
    expect(response.status).toBe(503);
    const failed = errorEnvelopeSchema.parse(await body(response));
    expect(failed.error.code).toBe("dependency-unavailable");
    expect(JSON.stringify(failed)).not.toContain(PENDING_ID);
    await database.transaction(async (repositories) =>
      expect((await repositories.users.findById(PENDING_ID))?.approvalStatus).toBe(
        "pending",
      ),
    );
  });
});
