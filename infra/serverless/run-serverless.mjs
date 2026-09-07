import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const REQUIRED_GATE_NAMES = [
  "migrationRepeatability",
  "connectorLifecycle",
  "sqlCapabilities",
  "queryPlans",
  "p95Latency",
  "atomicity",
];
const SELECTION_KEYS = ["adapter", "endpointParameterName", "region", "reportSha256"];
const SUPPORTED_ACTIONS = new Set(["package", "deploy"]);

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
    .join(",")}}`;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireExactKeys(value, expectedKeys, label) {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (
    actualKeys.length !== sortedExpected.length ||
    actualKeys.some((key, index) => key !== sortedExpected[index])
  ) {
    throw new Error(`${label} must contain exactly: ${sortedExpected.join(", ")}.`);
  }
}

function optionValue(args, name, fallback) {
  const prefix = `${name}=`;
  for (let index = 0; index < args.length; index += 1) {
    if (args[index].startsWith(prefix)) return args[index].slice(prefix.length);
    if (args[index] === name && args[index + 1]) return args[index + 1];
  }
  return fallback;
}

function parseParams(args) {
  const params = new Map();
  for (let index = 0; index < args.length; index += 1) {
    let entry;
    if (args[index].startsWith("--param=")) entry = args[index].slice(8);
    else if (args[index] === "--param" && args[index + 1]) {
      entry = args[index + 1];
      index += 1;
    }
    if (!entry) continue;
    const separator = entry.indexOf("=");
    if (separator <= 0) throw new Error(`Invalid Serverless parameter: ${entry}`);
    params.set(entry.slice(0, separator), entry.slice(separator + 1));
  }
  return params;
}

function selectedAdapter(report) {
  if (report.run?.mode !== "live" || report.run?.networkAttempted !== true) {
    return "unselected";
  }
  const statuses = REQUIRED_GATE_NAMES.map((name) => report.gates?.[name]);
  if (statuses.some((status) => status === "fail")) return "postgres";
  if (statuses.every((status) => status === "pass")) return "dsql";
  return "unselected";
}

async function readJson(url, label) {
  try {
    return JSON.parse(await readFile(fileURLToPath(url), "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot read ${label}: ${reason}`);
  }
}

async function validateDeploymentInputs(action, args) {
  const stage = optionValue(args, "--stage", "dev");
  const region = optionValue(args, "--region", "ap-northeast-2");
  const params = parseParams(args);
  const roleArn = params.get("lambdaRoleArn");
  const endpoint = params.get("databaseEndpoint");

  if (!roleArn) throw new Error("Missing required --param=lambdaRoleArn=<arn>.");
  if (!endpoint) {
    throw new Error("Missing required --param=databaseEndpoint=<hostname>.");
  }
  if (!/^arn:(aws|aws-cn|aws-us-gov):iam::\d{12}:role\/[\w+=,.@\/-]+$/.test(roleArn)) {
    throw new Error("lambdaRoleArn must be a syntactically valid IAM role ARN.");
  }
  if (
    action === "deploy" &&
    (/^arn:[^:]+:iam::0{12}:/.test(roleArn) ||
      /(placeholder|package[-/]?only)/i.test(roleArn))
  ) {
    throw new Error(
      "Deploy requires the real Terraform-owned execution role; package-only placeholders are rejected.",
    );
  }

  const [selection, report] = await Promise.all([
    readJson(
      new URL("../../artifacts/dsql-spike/database-adapter.json", import.meta.url),
      "database adapter selection",
    ),
    readJson(
      new URL("../../artifacts/dsql-spike/live-report.json", import.meta.url),
      "live DSQL report",
    ),
  ]);
  requireExactKeys(selection, SELECTION_KEYS, "Database adapter selection");
  if (!isRecord(report) || !isRecord(report.run) || !isRecord(report.gates)) {
    throw new Error("Live DSQL report has an invalid shape.");
  }

  const reportSha256 = createHash("sha256")
    .update(canonicalJson(report), "utf8")
    .digest("hex");
  if (selection.reportSha256 !== reportSha256) {
    throw new Error(
      "Database adapter selection does not match the live report digest.",
    );
  }

  const recomputedAdapter = selectedAdapter(report);
  if (
    recomputedAdapter === "unselected" ||
    selection.adapter !== recomputedAdapter ||
    report.decision?.adapter !== recomputedAdapter
  ) {
    throw new Error(
      "Database adapter selection is incomplete or disagrees with the live report gates.",
    );
  }
  if (selection.region !== region || report.run.region !== region) {
    throw new Error(
      `Selection, report, and requested region must all equal ${region}.`,
    );
  }

  const expectedParameterName = `/certquiz/${stage}/${recomputedAdapter}-endpoint`;
  if (selection.endpointParameterName !== expectedParameterName) {
    throw new Error(
      `Selected endpoint parameter must be ${expectedParameterName} for this stage.`,
    );
  }
  if (recomputedAdapter === "postgres") {
    throw new Error(
      "PostgreSQL was selected by the live gate, but its infrastructure and runtime connector are not wired; refusing to package DSQL settings.",
    );
  }
  if (report.gates.overall !== "pass" || report.live?.cleanup !== "pass") {
    throw new Error("DSQL packaging requires passing overall and cleanup gates.");
  }
  if (!endpoint.endsWith(`.dsql.${region}.on.aws`)) {
    throw new Error(`databaseEndpoint must be a DSQL endpoint in ${region}.`);
  }
  if (endpoint !== report.run.endpoint) {
    throw new Error(
      "databaseEndpoint must match the endpoint qualified by the live report.",
    );
  }

  process.stdout.write(
    `Validated ${recomputedAdapter} deployment inputs against live report ${reportSha256}.\n`,
  );
}

const [action, ...serverlessArgs] = process.argv.slice(2);
if (!SUPPORTED_ACTIONS.has(action)) {
  throw new Error(
    "Usage: node run-serverless.mjs <package|deploy> [serverless options]",
  );
}

await validateDeploymentInputs(action, serverlessArgs);
const child = spawn("serverless", [action, ...serverlessArgs], {
  stdio: "inherit",
  shell: false,
});
child.on("error", (error) => {
  process.stderr.write(`Failed to start Serverless Framework: ${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.stderr.write(`Serverless Framework exited from signal ${signal}.\n`);
    process.exitCode = 1;
  } else {
    process.exitCode = code ?? 1;
  }
});
