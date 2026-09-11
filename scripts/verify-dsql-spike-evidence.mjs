import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const root = new URL("..", import.meta.url);
const input = (relativePath) => new URL(relativePath, root);
const output = input("artifacts/release-candidate/db-adapter-evidence.json");
const notBefore = requiredIsoDate("CERTQUIZ_DSQL_SPIKE_NOT_BEFORE");
const report = await json(input("artifacts/dsql-spike/live-report.json"));
const selection = await json(input("artifacts/dsql-spike/database-adapter.json"));

validateReport(report, notBefore);
const reportSha256 = sha256(canonicalJson(report));
if (selection.adapter !== "dsql" || selection.reportSha256 !== reportSha256) {
  throw new Error(
    "Live DSQL adapter selection is missing or does not match the generated report.",
  );
}

const migrationManifest = await applicationMigrationManifest();
const evidence = {
  schemaVersion: 1,
  kind: "certquiz-dsql-adapter-release-evidence",
  generatedAt: new Date().toISOString(),
  sourceCommit: process.env.GITHUB_SHA ?? null,
  liveSpike: {
    executedAt: report.run.executedAt,
    reportSha256,
    adapter: selection.adapter,
    overallGate: report.gates.overall,
  },
  applicationMigrations: migrationManifest,
};

await mkdir(new URL(".", output), { recursive: true });
await writeFile(output, `${canonicalJson(evidence)}\n`, "utf8");
process.stdout.write(
  `Verified fresh live DSQL evidence and ${migrationManifest.length} application migrations.\n`,
);

function validateReport(candidate, minimumExecutedAt) {
  if (
    candidate?.schemaVersion !== 1 ||
    candidate?.kind !== "aurora-dsql-compatibility-spike" ||
    candidate?.run?.mode !== "live" ||
    candidate?.run?.networkAttempted !== true ||
    candidate?.run?.credentialAccessAttempted !== true
  ) {
    throw new Error("DSQL spike evidence is not a credentialed live report.");
  }

  const executedAt = isoDate(candidate.run.executedAt, "live report executedAt");
  if (executedAt < minimumExecutedAt) {
    throw new Error("DSQL live spike report predates this CI gate.");
  }

  const gates = candidate.gates;
  const requiredGates = [
    "migrationRepeatability",
    "connectorLifecycle",
    "sqlCapabilities",
    "queryPlans",
    "p95Latency",
    "atomicity",
    "overall",
  ];
  if (!gates || requiredGates.some((gate) => gates[gate] !== "pass")) {
    throw new Error("One or more required DSQL compatibility gates did not pass.");
  }
}

async function applicationMigrationManifest() {
  const directory = input("packages/db/migrations/");
  const names = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (names.length === 0) throw new Error("No application migrations were found.");

  return Promise.all(
    names.map(async (name) => ({
      filename: basename(name),
      sha256: sha256(await readFile(join(directory.pathname, name), "utf8")),
    })),
  );
}

async function json(url) {
  return JSON.parse(await readFile(url, "utf8"));
}

function requiredIsoDate(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} must be set to this CI job's start timestamp.`);
  }
  return isoDate(value, name);
}

function isoDate(value, label) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`${label} must be an ISO timestamp.`);
  }
  return parsed;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}
