import { describe, expect, it } from "vitest";

import { productionConfigurationFromEnvironment } from "./production.js";

const environment = {
  STAGE: "prod",
  DSQL_ENDPOINT: "cluster.dsql.ap-northeast-2.on.aws",
  DSQL_DATABASE: "postgres",
  DSQL_USER: "app",
  COGNITO_ISSUER:
    "https://cognito-idp.ap-northeast-2.amazonaws.com/ap-northeast-2_example",
  COGNITO_CLIENT_ID: "cert-quiz-client",
  WEB_ORIGIN: "https://quiz.example.test",
  MARKDOWN_IMAGE_ORIGINS: "https://images.example.test, https://cdn.example.test",
  RATE_LIMIT_TABLE: "certquiz-prod-rate-limit",
  RATE_LIMIT_POLICIES: JSON.stringify({
    "admin-import": { maxRequests: 10, windowSeconds: 300 },
    "exam-start": { maxRequests: 20, windowSeconds: 60 },
    "exam-submit": { maxRequests: 120, windowSeconds: 60 },
    "practice-start": { maxRequests: 20, windowSeconds: 60 },
    "practice-submit": { maxRequests: 120, windowSeconds: 60 },
  }),
  TELEMETRY_NAMESPACE: "CertQuiz/prod",
  TELEMETRY_SERVICE: "certquiz-api",
} as const;

describe("production runtime configuration", () => {
  it("accepts stage-scoped dynamic configuration and canonicalizes optional origins", () => {
    expect(productionConfigurationFromEnvironment(environment)).toEqual({
      stage: "prod",
      dsqlEndpoint: environment.DSQL_ENDPOINT,
      dsqlDatabase: "postgres",
      dsqlUser: "app",
      cognitoIssuer: environment.COGNITO_ISSUER,
      cognitoClientId: environment.COGNITO_CLIENT_ID,
      webOrigin: environment.WEB_ORIGIN,
      markdownImageOrigins: ["https://images.example.test", "https://cdn.example.test"],
      rateLimitTable: "certquiz-prod-rate-limit",
      rateLimitPolicies: {
        "admin-import": { maxRequests: 10, windowSeconds: 300 },
        "exam-start": { maxRequests: 20, windowSeconds: 60 },
        "exam-submit": { maxRequests: 120, windowSeconds: 60 },
        "practice-start": { maxRequests: 20, windowSeconds: 60 },
        "practice-submit": { maxRequests: 120, windowSeconds: 60 },
      },
      telemetryNamespace: "CertQuiz/prod",
      telemetryService: "certquiz-api",
    });
  });

  it("fails closed before database initialization when a protected-route setting is absent or unsafe", () => {
    const missingIssuer = { ...environment, COGNITO_ISSUER: undefined };
    expect(() => productionConfigurationFromEnvironment(missingIssuer)).toThrow(
      "Missing required COGNITO_ISSUER.",
    );
    expect(() => productionConfigurationFromEnvironment({
      ...environment,
      WEB_ORIGIN: "http://quiz.example.test",
    })).toThrow("allowedOrigins may use HTTP only for localhost.");
  });
});
