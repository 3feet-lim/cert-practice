import {
  catalogDtoSchema,
  commitImportResponseSchema,
  dryRunImportResponseSchema,
  errorEnvelopeSchema,
  successEnvelopeSchema,
} from "@cert-quiz/contracts";
import {
  DOP_C02_CATALOG_FIXTURE,
  InMemoryUnitOfWork,
  createDopC02CatalogFixture,
} from "@cert-quiz/db";
import {
  ImportService,
  SequenceRandomSource,
  SequenceUuidFactory,
  type UserProfile,
} from "@cert-quiz/domain";
import { describe, expect, it } from "vitest";

import {
  createApp,
  type CognitoTokenVerifier,
  type CreateAppDependencies,
} from "./app.js";
import type { VerifiedCognitoClaims } from "./authentication.js";

const NOW = new Date("2026-01-01T12:00:00.000Z");
const APPROVED_ID = "00000000-0000-4000-8000-000000000001";

class FixtureVerifier implements CognitoTokenVerifier {
  async verify(token: string): Promise<VerifiedCognitoClaims> {
    if (token === "approved") {
      return {
        identities: JSON.stringify([{ providerName: "Google", userId: "approved" }]),
        email: "approved@example.test",
        name: "Approved",
      };
    }
    if (token === "pending") {
      return {
        identities: JSON.stringify([{ providerName: "Google", userId: "pending" }]),
        email: "pending@example.test",
        name: "Pending",
      };
    }
    if (token === "admin") {
      return {
        identities: JSON.stringify([{ providerName: "Google", userId: "admin" }]),
        email: "admin@example.test",
        name: "Admin",
      };
    }
    throw new Error("Invalid fixture token.");
  }
}

function approvedProfile(): UserProfile {
  return {
    id: APPROVED_ID,
    googleSub: "approved",
    displayName: "Approved",
    email: "approved@example.test",
    role: "user",
    approvalStatus: "approved",
    scorePublic: false,
    firstLoginAt: NOW,
    approvedAt: NOW,
    version: 0n,
  };
}

function appWithCatalog(questionPool = true) {
  const database = new InMemoryUnitOfWork();
  const fixture = createDopC02CatalogFixture();
  if (!questionPool) fixture.source.questions = [];
  database.seedUser(approvedProfile());
  database.seedCatalogSource(fixture.source, fixture.revision);
  let id = 10;
  const dependencies: CreateAppDependencies = {
    tokenVerifier: new FixtureVerifier(),
    unitOfWork: database,
    now: () => new Date(NOW),
    createUserId: () => `00000000-0000-4000-8000-${String(id++).padStart(12, "0")}`,
  };
  return createApp(dependencies);
}

function authorized(token: string): RequestInit {
  return { headers: { authorization: `Bearer ${token}` } };
}

describe("approved revisioned catalog API", () => {
  it("uses the active-head projection, strict envelope, and never exposes questions", async () => {
    const app = appWithCatalog();
    const response = await app.request(
      "http://localhost/v1/catalog",
      authorized("approved"),
    );

    expect(response.status).toBe(200);
    const payload = successEnvelopeSchema(catalogDtoSchema).parse(
      await response.json(),
    );
    expect(payload.meta?.requestId).toMatch(/^api:/);
    expect(payload.data).toEqual({
      providers: [
        {
          id: DOP_C02_CATALOG_FIXTURE.source.providers[0]?.id,
          name: "AWS",
          logoUrl: null,
          certifications: [
            {
              id: DOP_C02_CATALOG_FIXTURE.source.certifications[0]?.id,
              code: "DOP-C02",
              name: "AWS Certified DevOps Engineer – Professional",
              totalQuestions: 75,
              timeLimitMinutes: 180,
              passThreshold: "75",
              scoringMode: "all_or_nothing",
              domains: [
                ["SDLC Automation", "22", 17],
                ["Configuration Management and IaC", "17", 13],
                ["Security and Compliance", "17", 13],
                ["Resilient Cloud Solutions", "15", 11],
                ["Monitoring and Logging", "15", 11],
                ["Incident and Event Response", "14", 10],
              ].map(([name, weightPercent, allocation], index) => ({
                id: DOP_C02_CATALOG_FIXTURE.source.domains[index]?.id,
                name,
                weightPercent,
                questionCount: allocation,
                allocatedQuestionCount: allocation,
              })),
            },
          ],
        },
      ],
      dataErrors: [],
    });
    expect(JSON.stringify(payload)).not.toContain("questionId");
    expect(JSON.stringify(payload)).not.toContain("correct");
  });

  it("requires approval and returns every insufficient-domain diagnostic safely", async () => {
    const protectedApp = appWithCatalog();
    const denied = await protectedApp.request(
      "http://localhost/v1/catalog",
      authorized("pending"),
    );
    expect(denied.status).toBe(403);
    expect(errorEnvelopeSchema.parse(await denied.json()).error.code).toBe(
      "approval-required",
    );

    const app = appWithCatalog(false);
    const response = await app.request(
      "http://localhost/v1/catalog",
      authorized("approved"),
    );
    expect(response.status).toBe(200);
    const payload = successEnvelopeSchema(catalogDtoSchema).parse(
      await response.json(),
    );
    expect(payload.data.providers).toEqual([]);
    expect(payload.data.dataErrors).toEqual(
      DOP_C02_CATALOG_FIXTURE.source.domains.map((domain, index) => ({
        kind: "insufficient-domain",
        certificationId: DOP_C02_CATALOG_FIXTURE.source.certifications[0]?.id,
        domainName: domain.name,
        availableQuestionCount: 0,
        requiredQuestionCount: [17, 13, 13, 11, 11, 10][index],
      })),
    );
    expect(JSON.stringify(payload)).not.toContain("revisionId");
  });
});

describe("admin import API", () => {
  it("returns only contract-safe credentials on a dry-run and atomically activates the same content", async () => {
    const database = new InMemoryUnitOfWork();
    database.seedUser({
      ...approvedProfile(),
      id: "00000000-0000-4000-8000-000000000099",
      googleSub: "admin",
      email: "admin@example.test",
      role: "admin",
    });
    const importService = new ImportService({
      ids: new SequenceUuidFactory([
        "00000000-0000-4000-8000-000000000201",
        "00000000-0000-4000-8000-000000000202",
        "00000000-0000-4000-8000-000000000203",
        "00000000-0000-4000-8000-000000000204",
        "00000000-0000-4000-8000-000000000205",
      ]),
      random: new SequenceRandomSource([1]),
      now: () => new Date(NOW),
    });
    const app = createApp({
      tokenVerifier: new FixtureVerifier(),
      unitOfWork: database,
      now: () => new Date(NOW),
      createUserId: () => "00000000-0000-4000-8000-000000000299",
      importService,
    });
    const content = JSON.stringify({
      provider: { id: "provider", name: "Provider" },
      certification: {
        id: "cert",
        code: "CERT-API",
        name: "API import",
        totalQuestions: 1,
        timeLimitMinutes: 10,
        passThreshold: "75",
        scoringMode: "all_or_nothing",
        domains: [{ id: "domain", name: "Domain", weightPercent: "100" }],
        questions: [
          {
            id: "question",
            domainId: "domain",
            stemEn: "Stem",
            explanationEn: "Explanation",
            requiredChoiceCount: 1,
            correctChoiceIds: ["a"],
            choices: [{ id: "a", textEn: "A" }],
          },
        ],
      },
    });
    const dry = await app.request("http://localhost/v1/admin/imports/dry-run", {
      method: "POST",
      headers: { authorization: "Bearer admin", "content-type": "application/json" },
      body: JSON.stringify({ content }),
    });
    expect(dry.status).toBe(200);
    const dryPayload = successEnvelopeSchema(dryRunImportResponseSchema).parse(
      await dry.json(),
    ).data;
    expect(dryPayload).toMatchObject({ valid: true, errors: [] });
    expect(JSON.stringify(dryPayload)).not.toContain("correctChoiceIds");
    const commit = await app.request("http://localhost/v1/admin/imports/commit", {
      method: "POST",
      headers: { authorization: "Bearer admin", "content-type": "application/json" },
      body: JSON.stringify({
        validationId: dryPayload.validationId,
        commitToken: dryPayload.commitToken,
        content,
      }),
    });
    expect(commit.status).toBe(200);
    const committed = successEnvelopeSchema(commitImportResponseSchema).parse(
      await commit.json(),
    ).data;
    expect(committed.validationId).toBe(dryPayload.validationId);
    const replay = await app.request("http://localhost/v1/admin/imports/commit", {
      method: "POST",
      headers: { authorization: "Bearer admin", "content-type": "application/json" },
      body: JSON.stringify({
        validationId: dryPayload.validationId,
        commitToken: dryPayload.commitToken,
        content,
      }),
    });
    expect(replay.status).toBe(503);
  });
});
