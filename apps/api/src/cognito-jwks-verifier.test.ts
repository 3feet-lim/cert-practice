import { describe, expect, it } from "vitest";

import { CognitoJwksTokenVerifier } from "./cognito-jwks-verifier.js";

const ISSUER = "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_example";
const CLIENT_ID = "cert-quiz-client";
const NOW_MS = Date.parse("2026-01-01T12:00:00.000Z");

type SigningMaterial = Readonly<{
  kid: string;
  privateKey: CryptoKey;
  jwk: JsonWebKey;
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

async function token(
  material: SigningMaterial,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const header = encodeJson({ alg: "RS256", kid: material.kid, typ: "JWT" });
  const payload = encodeJson({
    iss: ISSUER,
    aud: CLIENT_ID,
    token_use: "id",
    exp: NOW_MS / 1_000 + 60,
    identities: JSON.stringify([{ providerName: "Google", userId: "google-subject" }]),
    email: "learner@example.test",
    name: "Learner",
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

function encodeJson(value: unknown): string {
  return encodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function verifier(
  jwksResponses: readonly JsonWebKey[][],
  now = () => new Date(NOW_MS),
): Readonly<{ verifier: CognitoJwksTokenVerifier; requests: string[] }> {
  const requests: string[] = [];
  let responseIndex = 0;
  return {
    verifier: new CognitoJwksTokenVerifier({
      issuer: ISSUER,
      clientId: CLIENT_ID,
      tokenUse: "id",
      now,
      fetch: async (input) => {
        requests.push(String(input));
        const keys = jwksResponses[Math.min(responseIndex++, jwksResponses.length - 1)];
        return new Response(JSON.stringify({ keys }), { status: 200 });
      },
    }),
    requests,
  };
}

async function expectUnauthenticated(
  subject: Promise<unknown>,
  tokenValue: string,
): Promise<void> {
  try {
    await subject;
    throw new Error("expected verifier rejection");
  } catch (error) {
    expect(error).toBeDefined();
    expect(String(error)).not.toContain(tokenValue);
    expect(String(error)).not.toContain("learner@example.test");
  }
}

describe("CognitoJwksTokenVerifier", () => {
  it("verifies an RS256 Cognito ID token and caches the JWKS while returning only required claims", async () => {
    const material = await signingMaterial("current-key");
    const valid = await token(material, { arbitrarySensitiveClaim: "must-not-escape" });
    const fixture = verifier([[material.jwk]]);

    await expect(fixture.verifier.verify(valid)).resolves.toEqual({
      identities: JSON.stringify([{ providerName: "Google", userId: "google-subject" }]),
      email: "learner@example.test",
      name: "Learner",
    });
    await expect(fixture.verifier.verify(valid)).resolves.toEqual(
      expect.objectContaining({ name: "Learner" }),
    );
    expect(fixture.requests).toEqual([`${ISSUER}/.well-known/jwks.json`]);
  });

  it("rejects invalid signature, issuer, audience, expiry, and token use without exposing token content", async () => {
    const material = await signingMaterial("validation-key");
    // A different private key using the same advertised kid reaches signature verification.
    const otherMaterial = await signingMaterial("validation-key");
    const cases = [
      await token(otherMaterial),
      await token(material, { iss: `${ISSUER}-other` }),
      await token(material, { aud: "other-client" }),
      await token(material, { exp: NOW_MS / 1_000 }),
      await token(material, { token_use: "access", client_id: CLIENT_ID }),
    ];

    for (const invalid of cases) {
      const fixture = verifier([[material.jwk]]);
      await expectUnauthenticated(fixture.verifier.verify(invalid), invalid);
      expect(fixture.requests).toHaveLength(1);
    }
  });

  it("uses client_id for an explicitly configured Cognito access-token verifier", async () => {
    const material = await signingMaterial("access-key");
    const accessToken = await token(material, {
      token_use: "access",
      aud: "not-used-for-access-tokens",
      client_id: CLIENT_ID,
    });
    const requests: string[] = [];
    const accessVerifier = new CognitoJwksTokenVerifier({
      issuer: ISSUER,
      clientId: CLIENT_ID,
      tokenUse: "access",
      now: () => new Date(NOW_MS),
      fetch: async (input) => {
        requests.push(String(input));
        return new Response(JSON.stringify({ keys: [material.jwk] }), { status: 200 });
      },
    });

    await expect(accessVerifier.verify(accessToken)).resolves.toMatchObject({
      identities: expect.any(String),
    });
    expect(requests).toHaveLength(1);
  });

  it("refreshes exactly once for an unknown kid and accepts a Cognito key rotation", async () => {
    const first = await signingMaterial("first-key");
    const rotated = await signingMaterial("rotated-key");
    const fixture = verifier([
      [first.jwk],
      [first.jwk, rotated.jwk],
      [first.jwk, rotated.jwk],
    ]);

    await expect(fixture.verifier.verify(await token(first))).resolves.toBeDefined();
    await expect(fixture.verifier.verify(await token(rotated))).resolves.toBeDefined();
    expect(fixture.requests).toHaveLength(2);

    const unknown = await signingMaterial("unknown-key");
    const unknownToken = await token(unknown);
    await expectUnauthenticated(fixture.verifier.verify(unknownToken), unknownToken);
    expect(fixture.requests).toHaveLength(3);

    const coldFixture = verifier([[first.jwk]]);
    await expectUnauthenticated(coldFixture.verifier.verify(unknownToken), unknownToken);
    expect(coldFixture.requests).toHaveLength(1);
  });
});
