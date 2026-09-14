import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

function optionalHttpsOrigin(value, name) {
  if (!value) return undefined;

  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    (parsed.pathname !== "" && parsed.pathname !== "/") ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error(`${name} must be an HTTPS origin without a path.`);
  }
  return parsed.origin;
}

async function resolveApiOrigin() {
  const override = optionalHttpsOrigin(
    process.env.CERTQUIZ_DEPLOYED_API_ORIGIN,
    "CERTQUIZ_DEPLOYED_API_ORIGIN",
  );
  if (override) return { origin: override, source: "CERTQUIZ_DEPLOYED_API_ORIGIN" };

  const stage = process.env.CERTQUIZ_STAGE ?? "dev";
  const region =
    process.env.CERTQUIZ_REGION ?? process.env.AWS_REGION ?? "ap-northeast-2";
  const stackName = `certquiz-api-${stage}`;
  let stdout;
  try {
    ({ stdout } = await run(
      "aws",
      [
        "cloudformation",
        "describe-stacks",
        "--stack-name",
        stackName,
        "--region",
        region,
        "--output",
        "json",
      ],
      { timeout: 15_000 },
    ));
  } catch (error) {
    throw new Error(
      `Could not describe CloudFormation stack ${stackName} in ${region}: ${error.message}`,
    );
  }

  let document;
  try {
    document = JSON.parse(stdout);
  } catch (error) {
    throw new Error(`CloudFormation returned invalid JSON: ${error.message}`);
  }

  const output = document?.Stacks?.[0]?.Outputs?.find(
    ({ OutputKey }) => OutputKey === "HttpApiUrl",
  );
  if (!output?.OutputValue) {
    throw new Error(
      `CloudFormation stack ${stackName} in ${region} has no HttpApiUrl output.`,
    );
  }
  return {
    origin: optionalHttpsOrigin(output.OutputValue, `HttpApiUrl from ${stackName}`),
    source: `CloudFormation stack ${stackName} (${region})`,
  };
}

async function request(url, options = {}) {
  return fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
}

function expectHeader(response, header, expected) {
  const actual = response.headers.get(header);
  if (actual !== expected) {
    throw new Error(
      `${header} must equal ${expected}; received ${actual ?? "<missing>"}.`,
    );
  }
}

async function verifyHealth(apiOrigin, webOrigin) {
  const health = await request(`${apiOrigin}/v1/health`, {
    headers: webOrigin ? { Origin: webOrigin } : undefined,
  });
  if (health.status !== 200) {
    throw new Error(`Health endpoint returned ${health.status}, expected 200.`);
  }
  if (webOrigin) expectHeader(health, "access-control-allow-origin", webOrigin);
  expectHeader(health, "referrer-policy", "no-referrer");
  expectHeader(health, "x-content-type-options", "nosniff");
  expectHeader(health, "x-frame-options", "DENY");
  if (!health.headers.get("strict-transport-security")?.includes("includeSubDomains")) {
    throw new Error("Health endpoint must emit an HSTS policy with includeSubDomains.");
  }
  const csp = health.headers.get("content-security-policy") ?? "";
  for (const directive of [
    "default-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ]) {
    if (!csp.includes(directive)) {
      throw new Error(`Health endpoint CSP is missing ${directive}.`);
    }
  }
  const healthBody = await health.json();
  if (
    healthBody?.data?.status !== "ok" ||
    healthBody?.data?.service !== "cert-quiz-api" ||
    healthBody?.data?.contractVersion !== "v1" ||
    typeof healthBody?.meta?.requestId !== "string" ||
    healthBody.meta.requestId.length === 0
  ) {
    throw new Error(
      "Health endpoint did not return the required public contract envelope.",
    );
  }
}

async function verifyCors(apiOrigin, webOrigin) {
  if (!webOrigin) return;

  const preflight = await request(`${apiOrigin}/v1/catalog`, {
    method: "OPTIONS",
    headers: {
      Origin: webOrigin,
      "Access-Control-Request-Method": "GET",
      "Access-Control-Request-Headers": "authorization, content-type",
    },
  });
  if (preflight.status !== 204) {
    throw new Error(`Trusted preflight returned ${preflight.status}, expected 204.`);
  }
  expectHeader(preflight, "access-control-allow-origin", webOrigin);

  const rejectedPreflight = await request(`${apiOrigin}/v1/catalog`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://untrusted.invalid",
      "Access-Control-Request-Method": "GET",
    },
  });
  if (rejectedPreflight.status !== 403) {
    throw new Error(
      `Untrusted preflight returned ${rejectedPreflight.status}, expected 403.`,
    );
  }
  if (rejectedPreflight.headers.has("access-control-allow-origin")) {
    throw new Error(
      "Untrusted preflight must not receive an access-control-allow-origin header.",
    );
  }
}

const { origin: apiOrigin, source } = await resolveApiOrigin();
const webOrigin = optionalHttpsOrigin(
  process.env.CERTQUIZ_DEPLOYED_WEB_ORIGIN,
  "CERTQUIZ_DEPLOYED_WEB_ORIGIN",
);
await verifyHealth(apiOrigin, webOrigin);
await verifyCors(apiOrigin, webOrigin);

process.stdout.write(
  `Deployed API infrastructure smoke passed for ${apiOrigin} (resolved from ${source}).\n`,
);
