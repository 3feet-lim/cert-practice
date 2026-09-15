import type { HttpFetch } from "../api/http-adapter";

export interface CognitoPkceConfiguration {
  readonly hostedUiBaseUrl: string;
  readonly clientId: string;
  readonly redirectUri: string;
  readonly logoutUri: string;
}

export interface BrowserAuthSession {
  beginLogin(returnTo: string): Promise<void>;
  completeCallback(search: string): Promise<AuthCallbackResult>;
  getIdToken(): Promise<string | undefined>;
  logout(): void;
  clear(): void;
}

export type AuthCallbackResult =
  | { readonly ok: true; readonly returnTo: string }
  | { readonly ok: false };

type PendingTransaction = {
  readonly state: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
};

type TokenSession = {
  readonly idToken: string;
  readonly refreshToken?: string;
  readonly expiresAtMs: number;
};

type BrowserDependencies = {
  readonly crypto: Pick<Crypto, "getRandomValues" | "subtle">;
  readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  readonly fetch: HttpFetch;
  readonly assignLocation: (url: string) => void;
  readonly now: () => number;
};

export interface CognitoPkceSessionOptions {
  readonly dependencies?: Partial<BrowserDependencies>;
}

const PENDING_TRANSACTION_KEY = "certquiz.auth.pending.v1";
const TOKEN_SESSION_KEY = "certquiz.auth.tokens.v1";
const REFRESH_LEEWAY_MS = 60_000;

function browserDependencies(): BrowserDependencies {
  return {
    crypto: globalThis.crypto,
    storage: globalThis.sessionStorage,
    fetch: globalThis.fetch.bind(globalThis),
    assignLocation: (url) => window.location.assign(url),
    now: () => Date.now(),
  };
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value: string): Uint8Array | undefined {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return undefined;
  try {
    const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
      Math.ceil(value.length / 4) * 4,
      "=",
    );
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return undefined;
  }
}

function randomBase64Url(crypto: Pick<Crypto, "getRandomValues">, byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return encodeBase64Url(bytes);
}

async function createCodeChallenge(
  crypto: Pick<Crypto, "subtle">,
  verifier: string,
): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return encodeBase64Url(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;
  for (let index = 0; index < maxLength; index += 1) {
    mismatch |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return mismatch === 0;
}

function parseStoredValue<T>(storage: Pick<Storage, "getItem">, key: string): T | undefined {
  const value = storage.getItem(key);
  if (!value) return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

function parseIdTokenExpiry(idToken: string): number | undefined {
  const parts = idToken.split(".");
  if (parts.length !== 3) return undefined;
  const payloadBytes = decodeBase64Url(parts[1] ?? "");
  if (!payloadBytes) return undefined;
  try {
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes)) as { exp?: unknown };
    if (
      typeof payload.exp !== "number" ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp <= 0
    ) {
      return undefined;
    }
    const expiry = payload.exp * 1000;
    return Number.isSafeInteger(expiry) ? expiry : undefined;
  } catch {
    return undefined;
  }
}

function parseTokenSession(
  payload: unknown,
  now: number,
  previousRefreshToken?: string,
): TokenSession | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const data = payload as { id_token?: unknown; refresh_token?: unknown };
  if (typeof data.id_token !== "string" || data.id_token.length === 0) return undefined;
  const expiresAtMs = parseIdTokenExpiry(data.id_token);
  if (expiresAtMs === undefined || expiresAtMs <= now) return undefined;
  const refreshToken =
    typeof data.refresh_token === "string" && data.refresh_token.length > 0
      ? data.refresh_token
      : previousRefreshToken;
  return {
    idToken: data.id_token,
    ...(refreshToken ? { refreshToken } : {}),
    expiresAtMs,
  };
}

function isPendingTransaction(value: PendingTransaction | undefined): value is PendingTransaction {
  return Boolean(
    value &&
      typeof value.state === "string" &&
      value.state.length >= 32 &&
      typeof value.codeVerifier === "string" &&
      value.codeVerifier.length >= 43 &&
      typeof value.returnTo === "string" &&
      value.returnTo.startsWith("/"),
  );
}

function isTokenSession(value: TokenSession | undefined): value is TokenSession {
  return Boolean(
    value &&
      typeof value.idToken === "string" &&
      typeof value.expiresAtMs === "number" &&
      Number.isSafeInteger(value.expiresAtMs) &&
      (value.refreshToken === undefined || typeof value.refreshToken === "string"),
  );
}

function formBody(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}

/**
 * Browser-only OAuth 2.0 authorization-code + PKCE session. It never writes
 * credentials to URLs, source configuration, localStorage, or logs.
 */
export function createCognitoPkceSession(
  configuration: CognitoPkceConfiguration,
  options: CognitoPkceSessionOptions = {},
): BrowserAuthSession {
  const defaults = browserDependencies();
  const dependencies: BrowserDependencies = { ...defaults, ...options.dependencies };
  let callbackInFlight: Promise<AuthCallbackResult> | undefined;
  let refreshInFlight: Promise<string | undefined> | undefined;

  const clear = () => {
    dependencies.storage.removeItem(PENDING_TRANSACTION_KEY);
    dependencies.storage.removeItem(TOKEN_SESSION_KEY);
  };

  const getPendingTransaction = (): PendingTransaction | undefined => {
    const transaction = parseStoredValue<PendingTransaction>(
      dependencies.storage,
      PENDING_TRANSACTION_KEY,
    );
    if (!isPendingTransaction(transaction)) {
      dependencies.storage.removeItem(PENDING_TRANSACTION_KEY);
      return undefined;
    }
    return transaction;
  };

  const getTokenSession = (): TokenSession | undefined => {
    const session = parseStoredValue<TokenSession>(dependencies.storage, TOKEN_SESSION_KEY);
    if (
      !isTokenSession(session) ||
      parseIdTokenExpiry(session.idToken) !== session.expiresAtMs
    ) {
      dependencies.storage.removeItem(TOKEN_SESSION_KEY);
      return undefined;
    }
    return session;
  };

  const exchange = async (
    body: Record<string, string>,
    previousRefreshToken?: string,
  ): Promise<TokenSession | undefined> => {
    try {
      const response = await dependencies.fetch(
        new URL("/oauth2/token", configuration.hostedUiBaseUrl).toString(),
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          body: formBody(body),
        },
      );
      if (!response.ok) return undefined;
      return parseTokenSession(await response.json().catch(() => undefined), dependencies.now(), previousRefreshToken);
    } catch {
      return undefined;
    }
  };

  const refresh = async (): Promise<string | undefined> => {
    const session = getTokenSession();
    if (!session?.refreshToken) {
      dependencies.storage.removeItem(TOKEN_SESSION_KEY);
      return undefined;
    }
    const renewed = await exchange(
      {
        grant_type: "refresh_token",
        client_id: configuration.clientId,
        refresh_token: session.refreshToken,
      },
      session.refreshToken,
    );
    if (!renewed) {
      dependencies.storage.removeItem(TOKEN_SESSION_KEY);
      return undefined;
    }
    dependencies.storage.setItem(TOKEN_SESSION_KEY, JSON.stringify(renewed));
    return renewed.idToken;
  };

  return {
    async beginLogin(returnTo) {
      const state = randomBase64Url(dependencies.crypto, 32);
      const codeVerifier = randomBase64Url(dependencies.crypto, 64);
      const codeChallenge = await createCodeChallenge(dependencies.crypto, codeVerifier);
      dependencies.storage.setItem(
        PENDING_TRANSACTION_KEY,
        JSON.stringify({ state, codeVerifier, returnTo }),
      );
      const authorizeUrl = new URL("/oauth2/authorize", configuration.hostedUiBaseUrl);
      authorizeUrl.search = new URLSearchParams({
        response_type: "code",
        client_id: configuration.clientId,
        redirect_uri: configuration.redirectUri,
        scope: "openid email profile",
        identity_provider: "Google",
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      }).toString();
      dependencies.assignLocation(authorizeUrl.toString());
    },

    completeCallback(search) {
      callbackInFlight ??= (async () => {
        const transaction = getPendingTransaction();
        const query = new URLSearchParams(search);
        const callbackState = query.get("state");
        const code = query.get("code");
        const providerError = query.get("error");
        dependencies.storage.removeItem(PENDING_TRANSACTION_KEY);
        if (
          !transaction ||
          !callbackState ||
          !constantTimeEqual(transaction.state, callbackState) ||
          providerError !== null ||
          !code
        ) {
          return { ok: false };
        }
        const tokens = await exchange({
          grant_type: "authorization_code",
          client_id: configuration.clientId,
          code,
          redirect_uri: configuration.redirectUri,
          code_verifier: transaction.codeVerifier,
        });
        if (!tokens) return { ok: false };
        dependencies.storage.setItem(TOKEN_SESSION_KEY, JSON.stringify(tokens));
        return { ok: true, returnTo: transaction.returnTo };
      })();
      return callbackInFlight;
    },

    async getIdToken() {
      const session = getTokenSession();
      if (session && session.expiresAtMs > dependencies.now() + REFRESH_LEEWAY_MS) {
        return session.idToken;
      }
      refreshInFlight ??= refresh().finally(() => {
        refreshInFlight = undefined;
      });
      return refreshInFlight;
    },

    logout() {
      clear();
      const logoutUrl = new URL("/logout", configuration.hostedUiBaseUrl);
      logoutUrl.search = new URLSearchParams({
        client_id: configuration.clientId,
        logout_uri: configuration.logoutUri,
      }).toString();
      dependencies.assignLocation(logoutUrl.toString());
    },

    clear,
  };
}
