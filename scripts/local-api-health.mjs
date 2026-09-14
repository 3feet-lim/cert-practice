const configuredOrigin =
  process.env.CERTQUIZ_LOCAL_API_ORIGIN ?? "http://127.0.0.1:3000";
const origin = new URL(configuredOrigin);

if (
  !["http:", "https:"].includes(origin.protocol) ||
  origin.username ||
  origin.password ||
  origin.pathname !== "/" ||
  origin.search ||
  origin.hash
) {
  throw new Error(
    "CERTQUIZ_LOCAL_API_ORIGIN must be an HTTP(S) origin without a path.",
  );
}

const response = await fetch(`${origin.origin}/v1/health`, {
  redirect: "error",
  signal: AbortSignal.timeout(15_000),
});
if (response.status !== 200) {
  throw new Error(`Local health endpoint returned ${response.status}, expected 200.`);
}

const body = await response.json();
if (
  body?.data?.status !== "ok" ||
  body?.data?.service !== "cert-quiz-api" ||
  body?.data?.contractVersion !== "v1" ||
  typeof body?.meta?.requestId !== "string" ||
  body.meta.requestId.length === 0
) {
  throw new Error(
    "Local health endpoint did not return the required contract envelope.",
  );
}

process.stdout.write(`Local API health passed for ${origin.origin}.\n`);
