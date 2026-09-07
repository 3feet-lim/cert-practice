import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveWorkspaceOutput } from "./cli.js";
import { createLiveSpikeReport, renderLiveAdr } from "./live-report.js";
import { canonicalJson, reportDigest } from "./report.js";
import type { AdapterDecision } from "./types.js";

export function endpointParameterNameForAdapter(
  adapter: AdapterDecision["adapter"],
): string | null {
  if (adapter === "dsql") return "/certquiz/dev/dsql-endpoint";
  if (adapter === "postgres") return "/certquiz/dev/postgres-endpoint";
  return null;
}

export type LiveCliOptions = {
  endpoint: string;
  region: string;
  database: string;
  user: string;
  caPath: string;
  out: string;
  adrOut: string;
  selectionOut: string;
  lambdaEvidence: string;
  keepData: boolean;
};

export function parseLiveCliOptions(
  args: readonly string[],
  environment: NodeJS.ProcessEnv = process.env,
): LiveCliOptions {
  const options: LiveCliOptions = {
    endpoint: environment.DSQL_ENDPOINT ?? "",
    region:
      environment.AWS_REGION ?? environment.AWS_DEFAULT_REGION ?? "ap-northeast-2",
    database: environment.DSQL_DATABASE ?? "postgres",
    user: environment.DSQL_USER ?? "admin",
    caPath: environment.PGSSLROOTCERT ?? "/etc/ssl/certs/ca-certificates.crt",
    out: "artifacts/dsql-spike/live-report.json",
    adrOut: "artifacts/dsql-spike/ADR-0001-database-adapter.md",
    selectionOut: "artifacts/dsql-spike/database-adapter.json",
    lambdaEvidence:
      environment.DSQL_LAMBDA_EVIDENCE ??
      "artifacts/dsql-spike/lambda-lifecycle-evidence.json",
    keepData: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--keep-data") {
      options.keepData = true;
      continue;
    }
    if (argument === "--endpoint" && value) options.endpoint = value;
    else if (argument === "--region" && value) options.region = value;
    else if (argument === "--database" && value) options.database = value;
    else if (argument === "--user" && value) options.user = value;
    else if (argument === "--ca" && value) options.caPath = value;
    else if (argument === "--out" && value) options.out = value;
    else if (argument === "--adr-out" && value) options.adrOut = value;
    else if (argument === "--selection-out" && value) options.selectionOut = value;
    else if (argument === "--lambda-evidence" && value) options.lambdaEvidence = value;
    else throw new Error(`Unsupported live spike option: ${argument ?? ""}`);
    index += 1;
  }

  if (!options.endpoint.endsWith(`.dsql.${options.region}.on.aws`)) {
    throw new Error(
      "A DSQL endpoint matching the configured region is required via DSQL_ENDPOINT or --endpoint.",
    );
  }
  return options;
}

export async function runLiveCli(args: readonly string[]): Promise<void> {
  const options = parseLiveCliOptions(args);
  const workspaceRoot = resolve(process.cwd(), "../..");
  const reportPath = resolveWorkspaceOutput(workspaceRoot, options.out);
  const adrPath = resolveWorkspaceOutput(workspaceRoot, options.adrOut);
  const selectionPath = resolveWorkspaceOutput(workspaceRoot, options.selectionOut);
  const lambdaEvidencePath = resolveWorkspaceOutput(
    workspaceRoot,
    options.lambdaEvidence,
  );
  const report = await createLiveSpikeReport({
    endpoint: options.endpoint,
    region: options.region,
    database: options.database,
    user: options.user,
    caPath: options.caPath,
    keepData: options.keepData,
    lambdaEvidencePath,
  });

  await Promise.all([
    mkdir(resolve(reportPath, ".."), { recursive: true }),
    mkdir(resolve(adrPath, ".."), { recursive: true }),
    mkdir(resolve(selectionPath, ".."), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(reportPath, `${canonicalJson(report)}\n`, "utf8"),
    writeFile(adrPath, renderLiveAdr(report), "utf8"),
    writeFile(
      selectionPath,
      `${canonicalJson({
        adapter: report.decision.adapter,
        reportSha256: reportDigest(report),
        region: report.run.region,
        endpointParameterName: endpointParameterNameForAdapter(report.decision.adapter),
      })}\n`,
      "utf8",
    ),
  ]);
  process.stdout.write(
    `Live DSQL spike decision=${report.decision.adapter}; report=${reportPath}\n`,
  );
  if (report.decision.adapter === "unselected") process.exitCode = 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runLiveCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
