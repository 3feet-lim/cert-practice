import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

const deploymentEnvironment = {
  STAGE: "dev",
  WEB_ORIGIN: "https://quiz.dev.example.test",
  MARKDOWN_IMAGE_ORIGINS: "https://images.dev.example.test",
  CERTQUIZ_LOCAL_EMULATION: "false",
} as const;

function setDeploymentEnvironment() {
  for (const [name, value] of Object.entries(deploymentEnvironment))
    vi.stubEnv(name, value);
}

function apiGatewayV2Event(path: string) {
  return {
    version: "2.0",
    routeKey: `GET ${path}`,
    rawPath: path,
    rawQueryString: "",
    headers: { origin: deploymentEnvironment.WEB_ORIGIN },
    requestContext: {
      accountId: "123456789012",
      apiId: "api-id",
      domainName: "api.example.test",
      domainPrefix: "api",
      http: {
        method: "GET",
        path,
        protocol: "HTTP/1.1",
        sourceIp: "198.51.100.10",
        userAgent: "vitest",
      },
      requestId: "request-id",
      routeKey: `GET ${path}`,
      stage: "$default",
      time: "01/Jan/2026:00:00:00 +0000",
      timeEpoch: 1_767_225_600_000,
    },
    isBase64Encoded: false,
  };
}

async function invoke(handler: (...args: never[]) => Promise<unknown>, path: string) {
  return (await handler(apiGatewayV2Event(path) as never, {} as never)) as {
    statusCode: number;
    body: string;
    headers: Record<string, string | undefined>;
  };
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  vi.doUnmock("./production.js");
});

describe("deployed Lambda routing", () => {
  it("serves an API Gateway v2 health event with deployed security without loading production composition", async () => {
    setDeploymentEnvironment();
    vi.doMock("./production.js", () => {
      throw new Error("production composition must not load for health checks");
    });

    const { handler } = await import("./lambda.js");
    const response = await invoke(handler as never, "/v1/health");

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toMatchObject({
      data: { status: "ok", service: "cert-quiz-api" },
    });
    expect(response.headers["access-control-allow-origin"]).toBe(
      deploymentEnvironment.WEB_ORIGIN,
    );
    expect(response.headers["strict-transport-security"]).toContain("max-age=");
    expect(response.headers["content-security-policy"]).toContain(
      "https://images.dev.example.test",
    );
  });

  it("delegates non-health API Gateway requests to production composition", async () => {
    setDeploymentEnvironment();
    const productionApp = new Hono();
    productionApp.get("/v1/catalog", (context) => context.json({ delegated: true }));
    const productionComposition = vi.fn().mockResolvedValue({
      app: productionApp,
      cleanupExpiredPracticeResults: async () => 0,
    });
    vi.doMock("./production.js", () => ({ productionComposition }));

    const { handler } = await import("./lambda.js");
    const response = await invoke(handler as never, "/v1/catalog");

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ delegated: true });
    expect(productionComposition).toHaveBeenCalledTimes(1);
  });
});
