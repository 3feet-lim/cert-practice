import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const allowedStages = new Set(["dev", "prod"]);
const manifestSchemaVersion = 1;

function usage() {
  return [
    "Usage:",
    "  node scripts/release-automation.mjs release --stage <dev|prod> --catalog-file <path>",
    "  node scripts/release-automation.mjs rollback --stage <dev|prod> --release-id <id> --catalog-file <path> --confirm-rollback",
    "",
    "Required environment for release/catalog operations:",
    "  CERTQUIZ_ADMIN_TOKEN (approved administrator Cognito ID token)",
    "  CERTQUIZ_API_ORIGIN (optional HTTPS API origin; discovered from API Gateway when omitted)",
    "  SERVERLESS_ACCESS_KEY (Serverless v4 CLI credential)",
  ].join("\n");
}

function fail(message) {
  throw new Error(`${message}\n\n${usage()}`);
}

function parseArguments(argv) {
  const [action, ...rest] = argv;
  if (action !== "release" && action !== "rollback")
    fail("Action must be release or rollback.");
  const options = new Map();
  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (!argument.startsWith("--")) fail(`Unexpected argument: ${argument}`);
    const key = argument.slice(2);
    if (key === "confirm-rollback") {
      options.set(key, true);
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith("--")) fail(`Missing value for --${key}.`);
    if (options.has(key)) fail(`Duplicate option --${key}.`);
    options.set(key, value);
    index += 1;
  }
  const known = new Set(["stage", "catalog-file", "release-id", "confirm-rollback"]);
  for (const key of options.keys())
    if (!known.has(key)) fail(`Unknown option --${key}.`);
  const stage = options.get("stage");
  if (typeof stage !== "string" || !allowedStages.has(stage))
    fail("--stage must be dev or prod.");
  const catalogFile = options.get("catalog-file");
  if (typeof catalogFile !== "string") fail("--catalog-file is required.");
  if (action === "rollback") {
    if (options.get("confirm-rollback") !== true)
      fail("Rollback requires explicit --confirm-rollback.");
    const releaseId = options.get("release-id");
    if (typeof releaseId !== "string" || !isReleaseId(releaseId))
      fail("Rollback requires a valid --release-id.");
  }
  return { action, stage, catalogFile, releaseId: options.get("release-id") };
}

function isReleaseId(value) {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{7,127}$/.test(value);
}

function releaseId() {
  const commit = (process.env.GITHUB_SHA ?? "local").slice(0, 12);
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${commit}-${randomUUID().slice(0, 8)}`;
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value || value.trim() !== value) throw new Error(`Missing required ${name}.`);
  return value;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, ...options.env },
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status ?? "an error"}.`,
    );
  return result.stdout;
}

function aws(args, options) {
  return run("aws", [...args, "--no-cli-pager"], options);
}

function awsJson(args, options) {
  const output = aws([...args, "--output", "json"], options);
  try {
    return JSON.parse(output);
  } catch (error) {
    throw new Error(
      `AWS command did not return JSON: ${error instanceof Error ? error.message : error}`,
    );
  }
}

function httpsOrigin(value, name) {
  const parsed = new URL(value);
  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== value ||
    parsed.pathname !== "/"
  )
    throw new Error(`${name} must be an HTTPS origin without a path.`);
  return parsed.origin;
}

function ssmParameter(stage, name) {
  return aws([
    "ssm",
    "get-parameter",
    "--name",
    `/certquiz/${stage}/${name}`,
    "--query",
    "Parameter.Value",
    "--output",
    "text",
  ]).trim();
}

function apiName(stage) {
  return `certquiz-api-${stage}`;
}

function functionName(stage) {
  return `certquiz-${stage}-api`;
}

function discoverApi(stage, region) {
  const response = awsJson(["apigatewayv2", "get-apis", "--region", region]);
  const api = response.Items?.find((item) => item.Name === apiName(stage));
  if (!api?.ApiId || !api.ApiEndpoint)
    throw new Error(`Unable to find API Gateway HTTP API ${apiName(stage)}.`);
  return {
    id: api.ApiId,
    origin: httpsOrigin(api.ApiEndpoint, "API Gateway endpoint"),
  };
}

function latestPublishedVersion(stage, region) {
  const response = awsJson([
    "lambda",
    "list-versions-by-function",
    "--function-name",
    functionName(stage),
    "--region",
    region,
  ]);
  const versions = (response.Versions ?? [])
    .map((entry) => entry.Version)
    .filter((version) => version && version !== "$LATEST")
    .sort((left, right) => Number(left) - Number(right));
  const version = versions.at(-1);
  if (!version)
    throw new Error(`No published Lambda version exists for ${functionName(stage)}.`);
  return version;
}

function aliasState(stage, region) {
  try {
    const alias = awsJson([
      "lambda",
      "get-alias",
      "--function-name",
      functionName(stage),
      "--name",
      "live",
      "--region",
      region,
    ]);
    return { version: alias.FunctionVersion, arn: alias.AliasArn };
  } catch (error) {
    if (String(error).includes("ResourceNotFoundException")) return null;
    throw error;
  }
}

function invokeUnpublishedVersion(stage, region, version, webOrigin) {
  const payload = JSON.stringify({
    version: "2.0",
    routeKey: "GET /v1/health",
    rawPath: "/v1/health",
    rawQueryString: "",
    headers: {
      host: "release-smoke.invalid",
      origin: webOrigin,
      "x-forwarded-proto": "https",
    },
    requestContext: {
      accountId: "release-smoke",
      apiId: "release-smoke",
      domainName: "release-smoke.invalid",
      domainPrefix: "release-smoke",
      http: {
        method: "GET",
        path: "/v1/health",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "certquiz-release-smoke",
      },
      requestId: "release-smoke",
      routeKey: "GET /v1/health",
      stage: "$default",
      time: "01/Jan/2026:00:00:00 +0000",
      timeEpoch: 1767225600000,
    },
    isBase64Encoded: false,
  });
  const temporaryDirectory = spawnSync("mktemp", ["-d"], {
    encoding: "utf8",
  }).stdout.trim();
  if (!temporaryDirectory)
    throw new Error("Could not create temporary Lambda smoke directory.");
  try {
    const input = join(temporaryDirectory, "event.json");
    const output = join(temporaryDirectory, "response.json");
    run("node", [
      "-e",
      `require('node:fs').writeFileSync(process.argv[1], process.argv[2])`,
      input,
      payload,
    ]);
    aws([
      "lambda",
      "invoke",
      "--function-name",
      functionName(stage),
      "--qualifier",
      version,
      "--region",
      region,
      "--cli-binary-format",
      "raw-in-base64-out",
      "--payload",
      `fileb://${input}`,
      output,
    ]);
    const response = JSON.parse(
      run("node", [
        "-e",
        `process.stdout.write(require('node:fs').readFileSync(process.argv[1], 'utf8'))`,
        output,
      ]),
    );
    const body = JSON.parse(response.body ?? "{}");
    if (response.statusCode !== 200 || body?.data?.status !== "ok")
      throw new Error(`Unpublished Lambda ${version} failed health smoke.`);
  } finally {
    run("rm", ["-rf", temporaryDirectory]);
  }
}

function ensureLiveAlias(stage, region, version) {
  const previous = aliasState(stage, region);
  if (previous) {
    aws([
      "lambda",
      "update-alias",
      "--function-name",
      functionName(stage),
      "--name",
      "live",
      "--function-version",
      version,
      "--region",
      region,
    ]);
  } else {
    aws([
      "lambda",
      "create-alias",
      "--function-name",
      functionName(stage),
      "--name",
      "live",
      "--function-version",
      version,
      "--description",
      "CertQuiz live release alias",
      "--region",
      region,
    ]);
  }
  const functionData = awsJson([
    "lambda",
    "get-function",
    "--function-name",
    functionName(stage),
    "--region",
    region,
  ]);
  return {
    previousVersion: previous?.version ?? null,
    functionArn: functionData.Configuration.FunctionArn,
  };
}

function bindApiGatewayToAlias(stage, region, apiId, functionArn) {
  const accountId = awsJson(["sts", "get-caller-identity", "--region", region]).Account;
  const sourceArn = `arn:aws:execute-api:${region}:${accountId}:${apiId}/*/*/*`;
  const statementId = "api-gateway-live-alias";
  let policy = null;
  try {
    policy = awsJson([
      "lambda",
      "get-policy",
      "--function-name",
      functionName(stage),
      "--qualifier",
      "live",
      "--region",
      region,
    ]);
  } catch (error) {
    if (!String(error).includes("ResourceNotFoundException")) throw error;
  }
  const statements = policy ? (JSON.parse(policy.Policy).Statement ?? []) : [];
  if (!statements.some((statement) => statement.Sid === statementId)) {
    aws([
      "lambda",
      "add-permission",
      "--function-name",
      functionName(stage),
      "--qualifier",
      "live",
      "--statement-id",
      statementId,
      "--action",
      "lambda:InvokeFunction",
      "--principal",
      "apigateway.amazonaws.com",
      "--source-arn",
      sourceArn,
      "--region",
      region,
    ]);
  }
  const integrations =
    awsJson(["apigatewayv2", "get-integrations", "--api-id", apiId, "--region", region])
      .Items ?? [];
  const integration = integrations.find((entry) =>
    entry.IntegrationUri?.includes(functionArn),
  );
  if (!integration?.IntegrationId)
    throw new Error(`Unable to find Lambda integration for ${functionName(stage)}.`);
  aws([
    "apigatewayv2",
    "update-integration",
    "--api-id",
    apiId,
    "--integration-id",
    integration.IntegrationId,
    "--integration-uri",
    `${functionArn}:live`,
    "--region",
    region,
  ]);
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function cacheControl(key) {
  return key.endsWith(".html")
    ? "no-cache, no-store, must-revalidate"
    : "public, max-age=31536000, immutable";
}

function latestObjectVersion(bucket, key, region) {
  const response = awsJson([
    "s3api",
    "list-object-versions",
    "--bucket",
    bucket,
    "--prefix",
    key,
    "--region",
    region,
  ]);
  return (
    (response.Versions ?? []).find((version) => version.Key === key && version.IsLatest)
      ?.VersionId ?? null
  );
}

async function deployWebAssets({ bucket, region, id }) {
  const dist = join(root, "apps/web/dist");
  const files = await listFiles(dist);
  if (files.length === 0)
    throw new Error("apps/web/dist is empty; web build did not produce assets.");
  const previousVersions = {};
  for (const source of files) {
    const key = relative(dist, source).replaceAll("\\", "/");
    previousVersions[key] = latestObjectVersion(bucket, key, region);
    aws([
      "s3",
      "cp",
      source,
      `s3://${bucket}/releases/${id}/web/${key}`,
      "--cache-control",
      cacheControl(key),
      "--region",
      region,
    ]);
    aws([
      "s3",
      "cp",
      source,
      `s3://${bucket}/${key}`,
      "--cache-control",
      cacheControl(key),
      "--region",
      region,
    ]);
  }
  return previousVersions;
}

function invalidateWeb(distributionId, region) {
  aws([
    "cloudfront",
    "create-invalidation",
    "--distribution-id",
    distributionId,
    "--paths",
    "/",
    "/index.html",
    "/assets/*",
    "--region",
    region,
  ]);
}

async function catalogCommit(apiOrigin, catalogFile) {
  const adminToken = requiredEnvironment("CERTQUIZ_ADMIN_TOKEN");
  const content = await readFile(catalogFile, "utf8");
  const request = async (path, payload) => {
    const response = await fetch(`${apiOrigin}${path}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${adminToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Catalog ${path} returned ${response.status}.`);
    return response.json();
  };
  const dryRun = await request("/v1/admin/imports/dry-run", { content });
  const data = dryRun?.data;
  if (!data?.valid || !data.validationId || !data.commitToken)
    throw new Error("Catalog dry-run failed; refusing catalog activation.");
  const commit = await request("/v1/admin/imports/commit", {
    content,
    validationId: data.validationId,
    commitToken: data.commitToken,
  });
  if (!commit?.data?.certificationId)
    throw new Error("Catalog commit did not return a certification ID.");
  return {
    certificationId: commit.data.certificationId,
    validationId: data.validationId,
  };
}

async function writeManifest(bucket, region, id, manifest) {
  const directory = await mkdtemp(join(tmpdir(), "certquiz-release-"));
  const file = join(directory, "release-manifest.json");
  try {
    await writeFile(file, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    aws([
      "s3",
      "cp",
      file,
      `s3://${bucket}/releases/${id}/release-manifest.json`,
      "--cache-control",
      "no-store",
      "--region",
      region,
    ]);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

async function readManifest(bucket, region, id) {
  const directory = await mkdtemp(join(tmpdir(), "certquiz-rollback-"));
  const file = join(directory, "release-manifest.json");
  try {
    aws([
      "s3",
      "cp",
      `s3://${bucket}/releases/${id}/release-manifest.json`,
      file,
      "--region",
      region,
    ]);
    const manifest = JSON.parse(await readFile(file, "utf8"));
    if (
      manifest.schemaVersion !== manifestSchemaVersion ||
      manifest.stage === undefined
    )
      throw new Error("Release manifest has an unsupported shape.");
    return manifest;
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
}

function restoreWebAssets(bucket, region, previousVersions) {
  for (const [key, versionId] of Object.entries(previousVersions)) {
    if (!versionId) {
      aws([
        "s3api",
        "delete-object",
        "--bucket",
        bucket,
        "--key",
        key,
        "--region",
        region,
      ]);
      continue;
    }
    aws([
      "s3api",
      "copy-object",
      "--bucket",
      bucket,
      "--key",
      key,
      "--copy-source",
      `${bucket}/${encodeURIComponent(key)}?versionId=${encodeURIComponent(versionId)}`,
      "--metadata-directive",
      "COPY",
      "--region",
      region,
    ]);
  }
}

function runDeployedSmoke(apiOrigin, webOrigin) {
  run("node", ["scripts/deployed-infrastructure-smoke.mjs"], {
    env: {
      CERTQUIZ_DEPLOYED_API_ORIGIN: apiOrigin,
      CERTQUIZ_DEPLOYED_WEB_ORIGIN: webOrigin,
    },
  });
}

function runMigrations(endpoint, region) {
  run("pnpm", ["--filter", "@cert-quiz/db", "run", "migrate:deploy"], {
    env: { DSQL_ENDPOINT: endpoint, AWS_REGION: region },
  });
}

function deployLambda(stage, region, roleArn, endpoint) {
  requiredEnvironment("SERVERLESS_ACCESS_KEY");
  run("pnpm", [
    "--dir",
    "infra/serverless",
    "exec",
    "node",
    "run-serverless.mjs",
    "deploy",
    "--stage",
    stage,
    "--region",
    region,
    `--param=lambdaRoleArn=${roleArn}`,
    `--param=databaseEndpoint=${endpoint}`,
  ]);
}

async function release(options) {
  const region = process.env.AWS_REGION ?? "ap-northeast-2";
  const id = releaseId();
  const [endpoint, roleArn, bucket, distributionId, webOrigin] = [
    ssmParameter(options.stage, "dsql-endpoint"),
    ssmParameter(options.stage, "lambda-role-arn"),
    ssmParameter(options.stage, "web-bucket-name"),
    ssmParameter(options.stage, "cloudfront-distribution-id"),
    httpsOrigin(ssmParameter(options.stage, "web-origin"), "web-origin SSM parameter"),
  ];
  const api = process.env.CERTQUIZ_API_ORIGIN
    ? {
        ...discoverApi(options.stage, region),
        origin: httpsOrigin(process.env.CERTQUIZ_API_ORIGIN, "CERTQUIZ_API_ORIGIN"),
      }
    : discoverApi(options.stage, region);

  // Expand-only migrations run before new code; this command never executes down migrations.
  runMigrations(endpoint, region);
  run("pnpm", ["build"]);
  deployLambda(options.stage, region, roleArn, endpoint);
  const unpublishedVersion = latestPublishedVersion(options.stage, region);
  invokeUnpublishedVersion(options.stage, region, unpublishedVersion, webOrigin);
  const alias = ensureLiveAlias(options.stage, region, unpublishedVersion);
  bindApiGatewayToAlias(options.stage, region, api.id, alias.functionArn);
  const webPreviousVersions = await deployWebAssets({ bucket, region, id });
  invalidateWeb(distributionId, region);
  const catalog = await catalogCommit(api.origin, options.catalogFile);
  runDeployedSmoke(api.origin, webOrigin);
  const manifest = {
    schemaVersion: manifestSchemaVersion,
    id,
    stage: options.stage,
    createdAt: new Date().toISOString(),
    lambda: {
      functionName: functionName(options.stage),
      version: unpublishedVersion,
      previousAliasVersion: alias.previousVersion,
    },
    web: { bucket, distributionId, previousVersions: webPreviousVersions },
    catalog,
  };
  await writeManifest(bucket, region, id, manifest);
  process.stdout.write(
    `Release ${id} completed. Roll back with this release ID if required.\n`,
  );
}

async function rollback(options) {
  const region = process.env.AWS_REGION ?? "ap-northeast-2";
  const bucket = ssmParameter(options.stage, "web-bucket-name");
  const manifest = await readManifest(bucket, region, options.releaseId);
  if (manifest.stage !== options.stage)
    throw new Error("Release manifest stage does not match rollback stage.");
  if (!manifest.lambda?.previousAliasVersion)
    throw new Error("This release has no earlier live alias version to restore.");
  const distributionId = ssmParameter(options.stage, "cloudfront-distribution-id");
  const webOrigin = httpsOrigin(
    ssmParameter(options.stage, "web-origin"),
    "web-origin SSM parameter",
  );
  const api = process.env.CERTQUIZ_API_ORIGIN
    ? {
        ...discoverApi(options.stage, region),
        origin: httpsOrigin(process.env.CERTQUIZ_API_ORIGIN, "CERTQUIZ_API_ORIGIN"),
      }
    : discoverApi(options.stage, region);
  const alias = ensureLiveAlias(
    options.stage,
    region,
    manifest.lambda.previousAliasVersion,
  );
  bindApiGatewayToAlias(options.stage, region, api.id, alias.functionArn);
  restoreWebAssets(bucket, region, manifest.web.previousVersions);
  invalidateWeb(distributionId, region);
  // Catalog rollback is a new validated revision; immutable Attempts and snapshots are never edited.
  await catalogCommit(api.origin, options.catalogFile);
  runDeployedSmoke(api.origin, webOrigin);
  process.stdout.write(`Rollback of release ${options.releaseId} completed.\n`);
}

const options = parseArguments(process.argv.slice(2));
if (options.action === "release") await release(options);
else await rollback(options);
