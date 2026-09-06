import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, createLocalSpikeReport, renderAdrDraft } from "./report.js";
import type { FaultPoint } from "./types.js";

type CliOptions = {
  mode: "local";
  dryRun: true;
  out: string;
  adrOut: string;
  faultAt?: FaultPoint;
};

const defaultOptions: CliOptions = {
  mode: "local",
  dryRun: true,
  out: "artifacts/dsql-spike/local-preflight.json",
  adrOut: "artifacts/dsql-spike/ADR-0001-database-adapter.md",
};

const faultPoints = new Set<FaultPoint>([
  "profile-insert",
  "practice-slot-insert",
  "practice-replace-snapshot",
  "exam-finalize-attempt",
  "import-head-update",
]);

export function parseCliOptions(args: readonly string[]): CliOptions {
  const options = { ...defaultOptions };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const value = args[index + 1];
    if (argument === "--mode=local") continue;
    if (argument === "--dry-run") continue;
    if (argument === "--out" && value) {
      options.out = value;
      index += 1;
      continue;
    }
    if (argument === "--adr-out" && value) {
      options.adrOut = value;
      index += 1;
      continue;
    }
    if (argument === "--fail-at" && value && faultPoints.has(value as FaultPoint)) {
      options.faultAt = value as FaultPoint;
      index += 1;
      continue;
    }
    throw new Error(`Unsupported local-only spike option: ${argument ?? ""}`);
  }

  return options;
}

export function resolveWorkspaceOutput(workspaceRoot: string, output: string): string {
  if (isAbsolute(output))
    throw new Error("Spike output paths must be relative to the workspace.");
  const resolved = resolve(workspaceRoot, output);
  const fromRoot = relative(workspaceRoot, resolved);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new Error("Spike output paths must remain inside the workspace.");
  }
  return resolved;
}

export async function runCli(args: readonly string[]): Promise<void> {
  const options = parseCliOptions(args);
  const workspaceRoot = resolve(process.cwd(), "../..");
  const report = await createLocalSpikeReport({ faultAt: options.faultAt });
  const reportPath = resolveWorkspaceOutput(workspaceRoot, options.out);
  const adrPath = resolveWorkspaceOutput(workspaceRoot, options.adrOut);

  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await mkdir(resolve(adrPath, ".."), { recursive: true });
  await writeFile(reportPath, `${canonicalJson(report)}\n`, "utf8");
  await writeFile(adrPath, renderAdrDraft(report), "utf8");
  process.stdout.write(`Local-only DSQL preflight written to ${reportPath}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runCli(process.argv.slice(2)).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
