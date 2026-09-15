import { createHttpCertQuizApi, type BearerTokenProvider } from "./api/http-adapter";
import {
  createMockAuthController,
  createMockCertQuizApi,
  type MockAuthActor,
} from "./api/mock-adapter";
import type { CertQuizApi } from "./api/port";
import type { MockAuthCallbackCapability } from "./app/mock-auth-capability";
export type WebRuntimeMode = "http" | "mock";
export interface HttpWebRuntimeConfiguration {
  readonly mode: "http";
  /** Public API origin or base URL. It must not contain credentials, a query, or a fragment. */
  readonly apiBaseUrl: string;
  /** Public Cognito Hosted UI origin, retained for the later OAuth/PKCE flow. */
  readonly cognitoHostedUiBaseUrl: string;
  /** Public Cognito app-client identifier, retained for the later OAuth/PKCE flow. */
  readonly cognitoClientId: string;
  /** Same-origin callback URL derived from the configured browser path. */
  readonly redirectUri: string;
  /** Same-origin logout URL derived from the configured browser path. */
  readonly logoutUri: string;
}
export interface MockWebRuntimeConfiguration {
  readonly mode: "mock";
}
export type WebRuntimeConfiguration =
  HttpWebRuntimeConfiguration | MockWebRuntimeConfiguration;
export interface BrowserRuntimeEnvironment {
  readonly PROD?: boolean;
  readonly VITE_CERTQUIZ_RUNTIME_MODE?: string;
  readonly VITE_CERTQUIZ_API_BASE_URL?: string;
  readonly VITE_CERTQUIZ_COGNITO_HOSTED_UI_BASE_URL?: string;
  readonly VITE_CERTQUIZ_COGNITO_CLIENT_ID?: string;
  readonly VITE_CERTQUIZ_AUTH_REDIRECT_PATH?: string;
  readonly VITE_CERTQUIZ_AUTH_LOGOUT_PATH?: string;
}
export class RuntimeConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeConfigurationError";
  }
}
function required(
  environment: BrowserRuntimeEnvironment,
  key: keyof BrowserRuntimeEnvironment,
) {
  const value = environment[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RuntimeConfigurationError(`${key} must be configured.`);
  }
  return value.trim();
}
function parseUrl(key: string, value: string, allowPath: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RuntimeConfigurationError(`${key} must be a valid HTTPS URL.`);
  }
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    (!allowPath && url.pathname !== "/")
  ) {
    throw new RuntimeConfigurationError(
      `${key} must be an HTTPS ${allowPath ? "origin or base URL" : "origin"} without credentials, a query, or a fragment.`,
    );
  }
  return url;
}
function parseBrowserOrigin(browserOrigin: string): URL {
  let url: URL;
  try {
    url = new URL(browserOrigin);
  } catch {
    throw new RuntimeConfigurationError("The browser origin is invalid.");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new RuntimeConfigurationError(
      "The browser origin must be a valid HTTP or HTTPS origin.",
    );
  }
  return url;
}
function parseSameOriginPath(key: string, value: string, browserOrigin: URL): string {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) {
    throw new RuntimeConfigurationError(`${key} must be a same-origin absolute path.`);
  }
  const url = new URL(value, browserOrigin);
  if (url.origin !== browserOrigin.origin || url.search !== "" || url.hash !== "") {
    throw new RuntimeConfigurationError(
      `${key} must be a same-origin path without a query or fragment.`,
    );
  }
  return url.toString();
}
/**
 * Resolves only public browser configuration. OAuth secrets and tokens are
 * deliberately excluded from this contract.
 */
export function resolveWebRuntimeConfiguration(
  environment: BrowserRuntimeEnvironment,
  browserOrigin: string,
): WebRuntimeConfiguration {
  const mode = required(environment, "VITE_CERTQUIZ_RUNTIME_MODE");
  if (mode === "mock") {
    if (environment.PROD) {
      throw new RuntimeConfigurationError(
        "Mock runtime mode is unavailable in a production build. Configure VITE_CERTQUIZ_RUNTIME_MODE=http.",
      );
    }
    return { mode: "mock" };
  }
  if (mode !== "http") {
    throw new RuntimeConfigurationError(
      "VITE_CERTQUIZ_RUNTIME_MODE must be either http or mock.",
    );
  }
  const origin = parseBrowserOrigin(browserOrigin);
  const apiBaseUrl = parseUrl(
    "VITE_CERTQUIZ_API_BASE_URL",
    required(environment, "VITE_CERTQUIZ_API_BASE_URL"),
    true,
  ).toString();
  const cognitoHostedUiBaseUrl = parseUrl(
    "VITE_CERTQUIZ_COGNITO_HOSTED_UI_BASE_URL",
    required(environment, "VITE_CERTQUIZ_COGNITO_HOSTED_UI_BASE_URL"),
    false,
  ).origin;
  const cognitoClientId = required(environment, "VITE_CERTQUIZ_COGNITO_CLIENT_ID");
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(cognitoClientId)) {
    throw new RuntimeConfigurationError(
      "VITE_CERTQUIZ_COGNITO_CLIENT_ID must be a public Cognito client identifier.",
    );
  }
  return {
    mode: "http",
    apiBaseUrl,
    cognitoHostedUiBaseUrl,
    cognitoClientId,
    redirectUri: parseSameOriginPath(
      "VITE_CERTQUIZ_AUTH_REDIRECT_PATH",
      required(environment, "VITE_CERTQUIZ_AUTH_REDIRECT_PATH"),
      origin,
    ),
    logoutUri: parseSameOriginPath(
      "VITE_CERTQUIZ_AUTH_LOGOUT_PATH",
      required(environment, "VITE_CERTQUIZ_AUTH_LOGOUT_PATH"),
      origin,
    ),
  };
}
export interface WebRuntime {
  readonly api: CertQuizApi;
  readonly authCallbackCapability?: MockAuthCallbackCapability;
}
export interface CreateWebRuntimeOptions {
  readonly bearerTokenProvider?: BearerTokenProvider;
  readonly mockActor?: string | null;
  readonly mockScenario?: string | null;
}
function isMockActor(value: string | null | undefined): value is MockAuthActor {
  return (
    value === "approved" ||
    value === "admin" ||
    value === "pending" ||
    value === "unauthenticated"
  );
}
/** Creates mock dependencies only for an explicitly resolved non-production mock mode. */
export function createWebRuntime(
  configuration: WebRuntimeConfiguration,
  options: CreateWebRuntimeOptions = {},
): WebRuntime {
  if (configuration.mode === "http") {
    return {
      api: createHttpCertQuizApi({
        baseUrl: configuration.apiBaseUrl,
        getBearerToken: options.bearerTokenProvider,
      }),
    };
  }
  const authController = createMockAuthController(
    isMockActor(options.mockActor) ? options.mockActor : "unauthenticated",
  );
  const mockScenario = options.mockScenario;
  return {
    api: createMockCertQuizApi({
      authController,
      e2eScenario:
        mockScenario === "completed-results" ||
        mockScenario === "catalog-loading" ||
        mockScenario === "catalog-empty" ||
        mockScenario === "catalog-retry-once"
          ? mockScenario
          : undefined,
    }),
    authCallbackCapability: authController,
  };
}
