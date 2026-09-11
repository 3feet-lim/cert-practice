import { InMemoryUnitOfWork } from "@cert-quiz/db";
import {
  FixedClock,
  Fraction,
  LifecycleServices,
  SequenceRandomSource,
  SequenceUuidFactory,
  SessionFactory,
  type FullCatalogGenerationSource,
  type UserProfile,
} from "@cert-quiz/domain";
import { describe, expect, it } from "vitest";

import { createApp, type CreateAppDependencies } from "./app.js";
import { CognitoJwksTokenVerifier } from "./cognito-jwks-verifier.js";

const ISSUER = "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_local";
const CLIENT_ID = "cert-quiz-local-client";
const NOW = new Date("2026-01-01T12:00:00.000Z");
const id = (value: number) =>
  `00000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const CERTIFICATION_ID = id(2);
const QUESTION_ID = id(20);
const CHOICE_ID = id(30);

type SigningMaterial = Readonly<{
  kid: string;
  privateKey: CryptoKey;
  jwk: JsonWebKey;
}>;

type LocalFixture = Readonly<{
  app: ReturnType<typeof createApp>;
  database: InMemoryUnitOfWork;
  jwksRequests: string[];
}>;

async function signingMaterial(kid: string): Promise<SigningMaterial> {
  const keyPair = (await globalThis.crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = await globalThis.crypto.subtle.exportKey("jwk", keyPair.publicKey);
  return {
    kid,
    privateKey: keyPair.privateKey,
    jwk: { ...jwk, kid, alg: "RS256", use: "sig" },
  };
}

async function signedToken(
  material: SigningMaterial,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const header = encodeJson({ alg: "RS256", kid: material.kid, typ: "JWT" });
  const payload = encodeJson({
    iss: ISSUER,
    aud: CLIENT_ID,
    token_use: "id",
    exp: NOW.getTime() / 1_000 + 60,
    identities: JSON.stringify([{ providerName: "Google", userId: "google-user" }]),
    email: "user@example.test",
    name: "Google User",
    ...overrides,
  });
  const signedContent = `${header}.${payload}`;
  const signature = await globalThis.crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    material.privateKey,
    new TextEncoder().encode(signedContent),
  );
  return `${signedContent}.${encodeBytes(new Uint8Array(signature))}`;
}

function localFixture(material: SigningMaterial, withLifecycle = false): LocalFixture {
  const database = new InMemoryUnitOfWork();
  const jwksRequests: string[] = [];
  let nextId = 500;
  const clock = new FixedClock(NOW);
  const verifier = new CognitoJwksTokenVerifier({
    issuer: ISSUER,
    clientId: CLIENT_ID,
    tokenUse: "id",
    jwksUrl: "https://jwks.local.test/.well-known/jwks.json",
    now: () => clock.now(),
    fetch: async (input) => {
      jwksRequests.push(String(input));
      return new Response(JSON.stringify({ keys: [material.jwk] }), {
        status: 200,
      });
    },
  });
  const dependencies: CreateAppDependencies = {
    tokenVerifier: verifier,
    unitOfWork: database,
    now: () => clock.now(),
    createUserId: () => id(nextId++),
  };

  if (withLifecycle) {
    const source = generationSource();
    database.seedCatalogSource(
      {
        revisionId: source.revisionId,
        certificationKey: source.certification.externalKey,
        providers: [source.provider],
        certifications: [source.certification],
        domains: source.domains,
        questions: source.questions.map((question) => ({
          id: question.id,
          revisionId: question.revisionId,
          certificationId: question.certificationId,
          domainId: question.domainId,
        })),
      },
      {
        id: source.revisionId,
        certificationKey: source.certification.externalKey,
        contentHash: "a".repeat(64),
        importedBy: id(1),
        importedAt: NOW,
        document: {},
      },
    );
    database.seedFullGenerationSource(source);
    const ids = new SequenceUuidFactory(
      Array.from({ length: 100 }, () => id(nextId++)),
    );
    dependencies.lifecycle = new LifecycleServices({
      unitOfWork: database,
      sessionFactory: new SessionFactory({
        ids,
        random: new SequenceRandomSource([0]),
        now: () => clock.now(),
      }),
      now: () => clock.now(),
      createId: () => id(nextId++),
    });
  }

  return { app: createApp(dependencies), database, jwksRequests };
}

function generationSource(): FullCatalogGenerationSource {
  return {
    revisionId: id(1),
    certification: {
      id: CERTIFICATION_ID,
      revisionId: id(1),
      providerId: id(3),
      externalKey: "CERT",
      code: "CERT",
      name: "Local integration certification",
      totalQuestions: 1,
      timeLimitMinutes: 1,
      passThreshold: Fraction.fromInteger(75n),
      scoringMode: "all_or_nothing",
    },
    provider: {
      id: id(3),
      revisionId: id(1),
      name: "Provider",
      logoUrl: null,
    },
    domains: [
      {
        id: id(4),
        revisionId: id(1),
        certificationId: CERTIFICATION_ID,
        name: "Domain",
        weightBasisPoints: 10_000,
        orderIndex: 0,
      },
    ],
    questions: [
      {
        id: QUESTION_ID,
        revisionId: id(1),
        certificationId: CERTIFICATION_ID,
        domainId: id(4),
        domainName: "Domain",
        stem: { en: "Question", ko: null },
        explanation: { en: "Explanation", ko: null },
        choices: [
          {
            id: CHOICE_ID,
            externalId: "choice",
            text: { en: "Choice", ko: null },
          },
        ],
        correctChoiceIndexes: [0],
        requiredChoiceCount: 1,
        translationStatus: "en_only",
      },
    ],
  };
}

function seedApprovedUser(
  database: InMemoryUnitOfWork,
  input: Pick<UserProfile, "id" | "googleSub" | "role">,
): void {
  database.seedUser({
    id: input.id,
    googleSub: input.googleSub,
    displayName: `${input.googleSub} name`,
    email: `${input.googleSub}@example.test`,
    role: input.role,
    approvalStatus: "approved",
    scorePublic: false,
    firstLoginAt: NOW,
    approvedAt: NOW,
    version: 0n,
  });
}

function authorize(token: string, init: RequestInit = {}): RequestInit {
  return {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...init.headers },
  };
}

function encodeJson(value: unknown): string {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pendingProfiles(database: InMemoryUnitOfWork): Promise<UserProfile[]> {
  return database.transaction((repositories) => repositories.users.findPending());
}

describe("Task 13.8 local JWKS production authentication composition", () => {
  it("verifies a locally signed Cognito JWT through the real JWKS verifier before creating one pending profile", async () => {
    const material = await signingMaterial("local-valid");
    const { app, database, jwksRequests } = localFixture(material);
    const token = await signedToken(material, {
      identities: JSON.stringify([{ providerName: "Google", userId: "google-valid" }]),
    });

    const response = await app.request(
      "http://localhost/v1/me/approval",
      authorize(token),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { approvalStatus: "pending" },
    });
    expect(await pendingProfiles(database)).toMatchObject([
      {
        googleSub: "google-valid",
        approvalStatus: "pending",
        role: "user",
        scorePublic: false,
      },
    ]);
    expect(jwksRequests).toEqual(["https://jwks.local.test/.well-known/jwks.json"]);
  });

  it("rejects invalid Cognito claims and missing Google identity without writing a profile", async () => {
    const material = await signingMaterial("local-invalid");
    const invalidTokens = [
      await signedToken(material, { iss: `${ISSUER}-other` }),
      await signedToken(material, { aud: "other-client" }),
      await signedToken(material, { exp: NOW.getTime() / 1_000 }),
      await signedToken(material, { token_use: "access", client_id: CLIENT_ID }),
      await signedToken(material, {
        identities: JSON.stringify([
          { providerName: "LoginWithAmazon", userId: "other" },
        ]),
      }),
    ];

    for (const token of invalidTokens) {
      const { app, database } = localFixture(material);
      const response = await app.request(
        "http://localhost/v1/me/approval",
        authorize(token),
      );
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toBe("Bearer");
      const payload = JSON.stringify(await response.json());
      expect(payload).not.toContain(token);
      expect(await pendingProfiles(database)).toEqual([]);
    }
  });

  it("enforces verified profile role and owner predicates after real JWKS authentication", async () => {
    const material = await signingMaterial("local-policy");
    const { app, database } = localFixture(material, true);
    seedApprovedUser(database, {
      id: id(100),
      googleSub: "google-admin",
      role: "admin",
    });
    seedApprovedUser(database, {
      id: id(101),
      googleSub: "google-owner",
      role: "user",
    });
    seedApprovedUser(database, {
      id: id(102),
      googleSub: "google-other",
      role: "user",
    });
    const [admin, owner, other] = await Promise.all([
      signedToken(material, {
        identities: JSON.stringify([
          { providerName: "Google", userId: "google-admin" },
        ]),
        email: "google-admin@example.test",
        name: "google-admin name",
      }),
      signedToken(material, {
        identities: JSON.stringify([
          { providerName: "Google", userId: "google-owner" },
        ]),
        email: "google-owner@example.test",
        name: "google-owner name",
      }),
      signedToken(material, {
        identities: JSON.stringify([
          { providerName: "Google", userId: "google-other" },
        ]),
        email: "google-other@example.test",
        name: "google-other name",
      }),
    ]);

    const roleBypass = await app.request(
      "http://localhost/v1/admin/pending-users",
      authorize(owner),
    );
    expect(roleBypass.status).toBe(403);
    expect(JSON.stringify(await roleBypass.json())).not.toContain("google-admin");

    const adminResponse = await app.request(
      "http://localhost/v1/admin/pending-users",
      authorize(admin),
    );
    expect(adminResponse.status).toBe(200);

    const started = await app.request(
      `http://localhost/v1/certifications/${CERTIFICATION_ID}/practice/start`,
      authorize(owner, { method: "POST", body: "{}" }),
    );
    expect(started.status).toBe(200);
    const sessionId = (
      (await started.json()) as { data: { practiceSessionId: string } }
    ).data.practiceSessionId;
    const idor = await app.request(
      `http://localhost/v1/practice/${sessionId}/resume`,
      authorize(other, { method: "POST" }),
    );
    expect(idor.status).toBe(404);
    expect(JSON.stringify(await idor.json())).not.toContain(sessionId);
  });
});

const runLiveCognito = process.env.RUN_LIVE_COGNITO_AUTH_INTEGRATION === "true";
const describeLiveCognito = runLiveCognito ? describe : describe.skip;

/**
 * Deliberately opt-in: this validates a credentialed token against the real
 * Cognito JWKS endpoint. It never logs or serializes the supplied token.
 */
describeLiveCognito("Task 13.8 live Cognito authentication", () => {
  it("accepts an explicitly configured Google-backed Cognito ID token", async () => {
    const token = requiredEnvironment("LIVE_COGNITO_ID_TOKEN");
    const issuer = requiredEnvironment("LIVE_COGNITO_ISSUER");
    const clientId = requiredEnvironment("LIVE_COGNITO_CLIENT_ID");
    const googleSub = requiredEnvironment("LIVE_COGNITO_GOOGLE_SUB");
    const database = new InMemoryUnitOfWork();
    const app = createApp({
      tokenVerifier: new CognitoJwksTokenVerifier({
        issuer,
        clientId,
        tokenUse: "id",
      }),
      unitOfWork: database,
      now: () => new Date(),
      createUserId: () => id(900),
    });

    const response = await app.request(
      "http://localhost/v1/me/approval",
      authorize(token),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { approvalStatus: "pending" },
    });
    expect(await pendingProfiles(database)).toMatchObject([{ googleSub }]);
  });
});

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required ${name}.`);
  return value;
}
