import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { createCognitoPkceSession } from "./cognito-pkce-session";

const configuration = {
  hostedUiBaseUrl: "https://certquiz-dev.auth.example.com",
  clientId: "public-client_123",
  redirectUri: "https://quiz.dev.example.com/auth/callback",
  logoutUri: "https://quiz.dev.example.com/login",
} as const;

class MemorySessionStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

function idToken(exp: number) {
  const part = (value: unknown) =>
    btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
  return `${part({ alg: "none" })}.${part({ exp })}.signature`;
}

type FetchMock = ReturnType<typeof vi.fn> & ((input: string, init?: RequestInit) => Promise<Response>);
type LocationMock = ReturnType<typeof vi.fn> & ((url: string) => void);

function createSession(overrides: {
  storage?: MemorySessionStorage;
  fetch?: FetchMock;
  assignLocation?: LocationMock;
  now?: number;
} = {}) {
  const storage = overrides.storage ?? new MemorySessionStorage();
  const fetch: FetchMock = overrides.fetch ?? (vi.fn() as FetchMock);
  const assignLocation: LocationMock =
    overrides.assignLocation ?? (vi.fn() as LocationMock);
  const now = overrides.now ?? 1_700_000_000_000;
  const session = createCognitoPkceSession(configuration, {
    dependencies: {
      crypto: globalThis.crypto,
      storage,
      fetch,
      assignLocation,
      now: () => now,
    },
  });
  return { session, storage, fetch, assignLocation, now };
}

describe("Cognito PKCE browser session", () => {
  it("creates an authorization URL and retains only a pending PKCE transaction in session storage", async () => {
    const { session, storage, assignLocation } = createSession();

    await session.beginLogin("/app/history");

    const url = new URL(assignLocation.mock.calls[0]?.[0]);
    expect(url.origin).toBe(configuration.hostedUiBaseUrl);
    expect(url.pathname).toBe("/oauth2/authorize");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      response_type: "code",
      client_id: configuration.clientId,
      redirect_uri: configuration.redirectUri,
      scope: "openid email profile",
      identity_provider: "Google",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const transaction = JSON.parse(storage.getItem("certquiz.auth.pending.v1") ?? "{}");
    expect(transaction).toEqual({
      state: url.searchParams.get("state"),
      codeVerifier: expect.stringMatching(/^[A-Za-z0-9_-]{86}$/),
      returnTo: "/app/history",
    });
    expect(storage.getItem("certquiz.auth.tokens.v1")).toBeNull();
  });

  it("validates PKCE URL invariants across permitted return routes", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("/app", "/app/history", "/app/leaderboards"),
        async (returnTo) => {
          const { session, storage, assignLocation } = createSession();
          await session.beginLogin(returnTo);
          const url = new URL(assignLocation.mock.calls[0]?.[0]);
          const transaction = JSON.parse(storage.getItem("certquiz.auth.pending.v1") ?? "{}");

          expect(url.searchParams.get("state")).toBe(transaction.state);
          expect(transaction.codeVerifier).not.toBe(transaction.state);
          expect(url.searchParams.get("code_challenge_method")).toBe("S256");
          expect(url.searchParams.get("identity_provider")).toBe("Google");
          expect(url.searchParams.get("scope")).toBe("openid email profile");
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects missing, mismatched, and provider-error callbacks without a token exchange", async () => {
    const { session, storage, fetch } = createSession();
    await session.beginLogin("/app");
    const { state } = JSON.parse(storage.getItem("certquiz.auth.pending.v1") ?? "{}");

    await expect(session.completeCallback("?code=unused&state=wrong")).resolves.toEqual({
      ok: false,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(storage.getItem("certquiz.auth.pending.v1")).toBeNull();

    const second = createSession();
    await second.session.beginLogin("/app");
    const validState = JSON.parse(
      second.storage.getItem("certquiz.auth.pending.v1") ?? "{}",
    ).state;
    await expect(
      second.session.completeCallback(`?error=access_denied&state=${validState}`),
    ).resolves.toEqual({ ok: false });
    expect(second.fetch).not.toHaveBeenCalled();
    expect(state).toBeTruthy();
  });

  it("exchanges an authorization code using PKCE and supplies the Cognito ID token", async () => {
    const now = 1_700_000_000_000;
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id_token: idToken(now / 1000 + 3600),
          refresh_token: "refresh-value",
          access_token: "not-stored-or-used-by-the-api",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const { session, storage } = createSession({ fetch, now });
    await session.beginLogin("/app/history");
    const { state } = JSON.parse(storage.getItem("certquiz.auth.pending.v1") ?? "{}");

    await expect(session.completeCallback(`?code=one-time-code&state=${state}`)).resolves.toEqual({
      ok: true,
      returnTo: "/app/history",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://certquiz-dev.auth.example.com/oauth2/token",
      expect.objectContaining({ method: "POST" }),
    );
    const body = new URLSearchParams(fetch.mock.calls[0]?.[1]?.body);
    expect(Object.fromEntries(body)).toMatchObject({
      grant_type: "authorization_code",
      client_id: configuration.clientId,
      code: "one-time-code",
      redirect_uri: configuration.redirectUri,
    });
    expect(body.get("code_verifier")).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(await session.getIdToken()).toBe(idToken(now / 1000 + 3600));
    expect(storage.getItem("certquiz.auth.tokens.v1")).not.toContain("access_token");
  });

  it("rejects malformed token expiry metadata before attempting refresh", async () => {
    const storage = new MemorySessionStorage();
    storage.setItem(
      "certquiz.auth.tokens.v1",
      JSON.stringify({
        idToken: "malformed-token",
        refreshToken: "refresh-value",
        expiresAtMs: 1_700_000_100_000,
      }),
    );
    const fetch = vi.fn() as FetchMock;
    const { session } = createSession({ storage, fetch });

    expect(await session.getIdToken()).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
    expect(storage.getItem("certquiz.auth.tokens.v1")).toBeNull();
  });

  it("renews an expired ID token with its refresh token and clears a failed renewal", async () => {
    const now = 1_700_000_000_000;
    const storage = new MemorySessionStorage();
    storage.setItem(
      "certquiz.auth.tokens.v1",
      JSON.stringify({ idToken: idToken(now / 1000 - 1), refreshToken: "refresh-value", expiresAtMs: now - 1_000 }),
    );
    const refreshFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id_token: idToken(now / 1000 + 3600) }), { status: 200 }),
    );
    const { session } = createSession({ storage, fetch: refreshFetch, now });

    expect(await session.getIdToken()).toBe(idToken(now / 1000 + 3600));
    expect(new URLSearchParams(refreshFetch.mock.calls[0]?.[1]?.body).get("grant_type")).toBe(
      "refresh_token",
    );
    expect(storage.getItem("certquiz.auth.tokens.v1")).toContain("refresh-value");

    storage.setItem(
      "certquiz.auth.tokens.v1",
      JSON.stringify({ idToken: idToken(now / 1000 - 1), refreshToken: "refresh-value", expiresAtMs: now - 1_000 }),
    );
    const failed = createSession({
      storage,
      fetch: vi.fn().mockResolvedValue(new Response("", { status: 401 })),
      now,
    });
    expect(await failed.session.getIdToken()).toBeUndefined();
    expect(storage.getItem("certquiz.auth.tokens.v1")).toBeNull();
  });

  it("clears browser session data and redirects to the configured Cognito logout endpoint", async () => {
    const { session, storage, assignLocation } = createSession();
    await session.beginLogin("/app");
    storage.setItem("certquiz.auth.tokens.v1", "{}");

    session.logout();

    expect(storage.getItem("certquiz.auth.pending.v1")).toBeNull();
    expect(storage.getItem("certquiz.auth.tokens.v1")).toBeNull();
    const url = new URL(assignLocation.mock.calls.at(-1)?.[0]);
    expect(url.pathname).toBe("/logout");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      client_id: configuration.clientId,
      logout_uri: configuration.logoutUri,
    });
  });
});
