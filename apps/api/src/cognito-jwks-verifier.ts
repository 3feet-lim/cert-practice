import { domainFailure } from "@cert-quiz/domain";

import type { CognitoTokenVerifier, VerifiedCognitoClaims } from "./authentication.js";

const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1_000;

type CognitoTokenUse = "id" | "access";

type CognitoJwksVerifierOptions = Readonly<{
  /** Cognito user-pool issuer, for example https://cognito-idp.<region>.amazonaws.com/<poolId>. */
  issuer: string;
  /** Cognito app client ID accepted for the configured token type. */
  clientId: string;
  /** The token type this API accepts. ID tokens carry the Google identities claim. */
  tokenUse: CognitoTokenUse;
  /** Defaults to `${issuer}/.well-known/jwks.json`. Provided only for controlled test/proxy use. */
  jwksUrl?: string;
  /** Bounded in-memory JWKS cache lifetime. Defaults to five minutes. */
  cacheTtlMs?: number;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
}>;

type JwtHeader = Readonly<{ alg: string; kid: string }>;
type JwtPayload = Readonly<Record<string, unknown>>;
type CachedJwks = Readonly<{
  keys: ReadonlyMap<string, CryptoKey>;
  expiresAtMs: number;
}>;

type JwksResponse = Readonly<{ keys: unknown }>;
type CognitoJwk = JsonWebKey &
  Readonly<{ kid?: unknown; alg?: unknown; use?: unknown; kty?: unknown }>;

/**
 * A fail-closed Cognito JWT verifier. It has no logger dependency and returns
 * only the identity fields needed by authentication, so raw JWTs and arbitrary
 * claims cannot be accidentally emitted by this boundary.
 */
export class CognitoJwksTokenVerifier implements CognitoTokenVerifier {
  private cache: CachedJwks | undefined;
  private refreshInFlight: Promise<CachedJwks> | undefined;

  private readonly issuer: string;
  private readonly clientId: string;
  private readonly tokenUse: CognitoTokenUse;
  private readonly jwksUrl: string;
  private readonly cacheTtlMs: number;
  private readonly fetch: typeof globalThis.fetch;
  private readonly now: () => Date;

  constructor(options: CognitoJwksVerifierOptions) {
    this.issuer = requiredUrl(options.issuer, "issuer");
    this.clientId = requiredValue(options.clientId, "clientId");
    this.tokenUse = options.tokenUse;
    if (this.tokenUse !== "id" && this.tokenUse !== "access")
      throw new Error("tokenUse must be id or access");
    this.jwksUrl = options.jwksUrl
      ? requiredUrl(options.jwksUrl, "jwksUrl")
      : `${this.issuer}/.well-known/jwks.json`;
    this.cacheTtlMs = validTtl(options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS);
    this.fetch = options.fetch ?? globalThis.fetch;
    if (typeof this.fetch !== "function") throw new Error("fetch is required");
    this.now = options.now ?? (() => new Date());
  }

  async verify(accessToken: string): Promise<VerifiedCognitoClaims> {
    try {
      const parsed = parseJwt(accessToken);
      const key = await this.keyFor(parsed.header.kid);
      const signatureIsValid = await globalThis.crypto.subtle.verify(
        "RSASSA-PKCS1-v1_5",
        key,
        toArrayBuffer(parsed.signature),
        toArrayBuffer(new TextEncoder().encode(parsed.signedContent)),
      );
      if (!signatureIsValid) throw invalidToken();
      validateClaims(parsed.payload, {
        issuer: this.issuer,
        clientId: this.clientId,
        tokenUse: this.tokenUse,
        now: this.now(),
      });
      return selectedClaims(parsed.payload);
    } catch {
      // Do not propagate raw JWT/JWKS/parser/crypto errors to callers or logs.
      throw invalidToken();
    }
  }

  private async keyFor(kid: string): Promise<CryptoKey> {
    const nowMs = this.now().getTime();
    const cacheWasFresh = Boolean(this.cache && this.cache.expiresAtMs > nowMs);
    if (!cacheWasFresh) await this.refreshJwks();

    const cachedKey = this.cache?.keys.get(kid);
    if (cachedKey) return cachedKey;

    // A fresh cache missing this kid can be stale due to Cognito key rotation.
    // Refresh at most once for this verification attempt and never fail open.
    if (cacheWasFresh) await this.refreshJwks(true);
    const refreshedKey = this.cache?.keys.get(kid);
    if (!refreshedKey) throw invalidToken();
    return refreshedKey;
  }

  private async refreshJwks(force = false): Promise<CachedJwks> {
    const nowMs = this.now().getTime();
    if (!force && this.cache && this.cache.expiresAtMs > nowMs) return this.cache;
    if (!this.refreshInFlight) {
      this.refreshInFlight = this.loadJwks().finally(() => {
        this.refreshInFlight = undefined;
      });
    }
    this.cache = await this.refreshInFlight;
    return this.cache;
  }

  private async loadJwks(): Promise<CachedJwks> {
    const response = await this.fetch(this.jwksUrl, { method: "GET" });
    if (!response.ok) throw invalidToken();
    const body = (await response.json()) as JwksResponse;
    if (!body || typeof body !== "object" || !Array.isArray(body.keys))
      throw invalidToken();

    const keys = new Map<string, CryptoKey>();
    for (const value of body.keys) {
      const imported = await importSigningKey(value);
      if (imported && !keys.has(imported.kid)) keys.set(imported.kid, imported.key);
    }
    return { keys, expiresAtMs: this.now().getTime() + this.cacheTtlMs };
  }
}

function requiredValue(value: string, name: string): string {
  if (!value || value.trim() !== value) throw new Error(`${name} is required`);
  return value;
}

function requiredUrl(value: string, name: string): string {
  const url = new URL(requiredValue(value, name));
  if (url.protocol !== "https:" || url.search || url.hash)
    throw new Error(`${name} must be an HTTPS URL without query or fragment`);
  return url.toString().replace(/\/$/, "");
}

function validTtl(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error("cacheTtlMs must be a positive integer");
  return value;
}

async function importSigningKey(
  value: unknown,
): Promise<{ kid: string; key: CryptoKey } | undefined> {
  if (!value || typeof value !== "object") return undefined;
  const jwk = value as CognitoJwk;
  if (
    typeof jwk.kid !== "string" ||
    jwk.kid.length === 0 ||
    jwk.kty !== "RSA" ||
    (jwk.alg !== undefined && jwk.alg !== "RS256") ||
    (jwk.use !== undefined && jwk.use !== "sig")
  )
    return undefined;
  try {
    const key = await globalThis.crypto.subtle.importKey(
      "jwk",
      jwk,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return { kid: jwk.kid, key };
  } catch {
    return undefined;
  }
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(value.length);
  copy.set(value);
  return copy.buffer;
}

function parseJwt(token: string): Readonly<{
  header: JwtHeader;
  payload: JwtPayload;
  signature: Uint8Array;
  signedContent: string;
}> {
  const segments = token.split(".");
  if (segments.length !== 3) throw invalidToken();
  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (!encodedHeader || !encodedPayload || !encodedSignature) throw invalidToken();
  const header = parseJsonSegment(encodedHeader) as Record<string, unknown>;
  const payload = parseJsonSegment(encodedPayload) as Record<string, unknown>;
  if (
    header.alg !== "RS256" ||
    typeof header.kid !== "string" ||
    header.kid.length === 0 ||
    !payload ||
    typeof payload !== "object" ||
    Array.isArray(payload)
  )
    throw invalidToken();
  return {
    header: { alg: header.alg, kid: header.kid },
    payload,
    signature: decodeBase64Url(encodedSignature),
    signedContent: `${encodedHeader}.${encodedPayload}`,
  };
}

function parseJsonSegment(segment: string): unknown {
  try {
    const decoded = new TextDecoder().decode(decodeBase64Url(segment));
    return JSON.parse(decoded) as unknown;
  } catch {
    throw invalidToken();
  }
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw invalidToken();
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function validateClaims(
  payload: JwtPayload,
  input: Readonly<{
    issuer: string;
    clientId: string;
    tokenUse: CognitoTokenUse;
    now: Date;
  }>,
): void {
  if (payload.iss !== input.issuer || payload.token_use !== input.tokenUse)
    throw invalidToken();
  const clientClaim = input.tokenUse === "id" ? payload.aud : payload.client_id;
  if (clientClaim !== input.clientId) throw invalidToken();
  if (
    typeof payload.exp !== "number" ||
    !Number.isFinite(payload.exp) ||
    Math.floor(input.now.getTime() / 1_000) >= payload.exp
  )
    throw invalidToken();
}

function selectedClaims(payload: JwtPayload): VerifiedCognitoClaims {
  return {
    identities: payload.identities,
    ...(payload.email === undefined ? {} : { email: payload.email }),
    ...(payload.name === undefined ? {} : { name: payload.name }),
  };
}

function invalidToken() {
  return domainFailure("unauthenticated");
}
