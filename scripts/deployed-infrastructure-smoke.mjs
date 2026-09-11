const required = (name) => {
  const value = process.env[name];
  if (!value)
    throw new Error(`${name} is required for deployed infrastructure smoke testing.`);
  return value;
};

function httpsOrigin(name) {
  const value = required(name);
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== value ||
    parsed.pathname !== "/"
  ) {
    throw new Error(`${name} must be an HTTPS origin without a path.`);
  }
  return parsed.origin;
}

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  return response;
}

function expectHeader(response, header, expected) {
  const actual = response.headers.get(header);
  if (actual !== expected)
    throw new Error(
      `${header} must equal ${expected}; received ${actual ?? "<missing>"}.`,
    );
}

const apiOrigin = httpsOrigin("CERTQUIZ_DEPLOYED_API_ORIGIN");
const webOrigin = httpsOrigin("CERTQUIZ_DEPLOYED_WEB_ORIGIN");

const health = await request(`${apiOrigin}/v1/health`, {
  headers: { Origin: webOrigin },
});
if (health.status !== 200)
  throw new Error(`Health endpoint returned ${health.status}, expected 200.`);
expectHeader(health, "access-control-allow-origin", webOrigin);
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
  if (!csp.includes(directive))
    throw new Error(`Health endpoint CSP is missing ${directive}.`);
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

const preflight = await request(`${apiOrigin}/v1/catalog`, {
  method: "OPTIONS",
  headers: {
    Origin: webOrigin,
    "Access-Control-Request-Method": "GET",
    "Access-Control-Request-Headers": "authorization, content-type",
  },
});
if (preflight.status !== 204)
  throw new Error(`Trusted preflight returned ${preflight.status}, expected 204.`);
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

process.stdout.write(`Deployed API infrastructure smoke passed for ${apiOrigin}.\n`);
