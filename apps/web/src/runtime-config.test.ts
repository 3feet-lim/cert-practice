import { describe, expect, it } from "vitest";

import { createWebRuntime, resolveWebRuntimeConfiguration } from "./runtime-config";
import { createMockWebRuntime } from "./runtime-mock";

const browserOrigin = "https://quiz.dev.example.com";
const httpEnvironment = {
  PROD: true,
  VITE_CERTQUIZ_RUNTIME_MODE: "http",
  VITE_CERTQUIZ_API_BASE_URL: "https://api.dev.example.com/v1-base",
  VITE_CERTQUIZ_COGNITO_HOSTED_UI_BASE_URL:
    "https://certquiz-dev.auth.ap-northeast-2.amazoncognito.com",
  VITE_CERTQUIZ_COGNITO_CLIENT_ID: "public-client_123",
  VITE_CERTQUIZ_AUTH_REDIRECT_PATH: "/auth/callback",
  VITE_CERTQUIZ_AUTH_LOGOUT_PATH: "/login",
} as const;

describe("web runtime configuration", () => {
  it("resolves an explicit HTTP configuration with same-origin OAuth return URLs", () => {
    expect(resolveWebRuntimeConfiguration(httpEnvironment, browserOrigin)).toEqual({
      mode: "http",
      apiBaseUrl: "https://api.dev.example.com/v1-base",
      cognitoHostedUiBaseUrl:
        "https://certquiz-dev.auth.ap-northeast-2.amazoncognito.com",
      cognitoClientId: "public-client_123",
      redirectUri: "https://quiz.dev.example.com/auth/callback",
      logoutUri: "https://quiz.dev.example.com/login",
    });
  });

  it.each([
    [
      { ...httpEnvironment, VITE_CERTQUIZ_RUNTIME_MODE: undefined },
      "VITE_CERTQUIZ_RUNTIME_MODE must be configured.",
    ],
    [
      { ...httpEnvironment, VITE_CERTQUIZ_API_BASE_URL: "http://api.dev.example.com" },
      "VITE_CERTQUIZ_API_BASE_URL must be an HTTPS origin or base URL",
    ],
    [
      { ...httpEnvironment, VITE_CERTQUIZ_AUTH_REDIRECT_PATH: "//outside.example.com" },
      "VITE_CERTQUIZ_AUTH_REDIRECT_PATH must be a same-origin absolute path.",
    ],
  ])("fails closed for invalid HTTP configuration", (environment, message) => {
    expect(() => resolveWebRuntimeConfiguration(environment, browserOrigin)).toThrow(
      message,
    );
  });

  it("permits mocks only when explicitly configured outside production", () => {
    expect(
      resolveWebRuntimeConfiguration(
        { PROD: false, VITE_CERTQUIZ_RUNTIME_MODE: "mock" },
        "http://127.0.0.1:4173",
      ),
    ).toEqual({ mode: "mock" });
    expect(() =>
      resolveWebRuntimeConfiguration(
        { PROD: true, VITE_CERTQUIZ_RUNTIME_MODE: "mock" },
        browserOrigin,
      ),
    ).toThrow("Mock runtime mode is unavailable in a production build");
  });

  it("selects the HTTP adapter without creating a mock callback capability", () => {
    const configuration = resolveWebRuntimeConfiguration(
      httpEnvironment,
      browserOrigin,
    );
    if (configuration.mode !== "http") throw new Error("Expected HTTP configuration.");
    const runtime = createWebRuntime(configuration);
    expect(runtime.authCallbackCapability).toBeUndefined();
  });

  it("selects a mock callback capability only for explicit mock configuration", () => {
    const runtime = createMockWebRuntime();
    expect(runtime.authCallbackCapability).toBeDefined();
    expect(runtime.authCallbackCapability?.completeMockLogin).toBeTypeOf("function");
  });
});
