import { spawn } from "node:child_process";

const stage = process.env.CERTFORGE_STAGE ?? "dev";
const region = process.env.CERTFORGE_REGION ?? "ap-northeast-2";
const localDefaults = {
  CERTFORGE_LAMBDA_ROLE_ARN: "arn:aws:iam::000000000000:role/certforge-local",
  CERTFORGE_DSQL_ENDPOINT: "local.dsql.ap-northeast-2.on.aws",
  CERTFORGE_COGNITO_ISSUER: "https://cognito.localhost",
  CERTFORGE_COGNITO_CLIENT_ID: "certforge-local",
  CERTFORGE_WEB_ORIGIN: "http://localhost:5173",
  CERTFORGE_MARKDOWN_IMAGE_ORIGINS: "https://images.localhost",
  CERTFORGE_RATE_LIMIT_TABLE: "certforge-local-rate-limit",
  CERTFORGE_RATE_LIMIT_POLICIES: "{}",
  CERTFORGE_TELEMETRY_NAMESPACE: `CertForge/${stage}`,
  CERTFORGE_TELEMETRY_SERVICE: "certforge-api",
};

const child = spawn(
  process.platform === "win32" ? "serverless.cmd" : "serverless",
  ["offline", "start", "--stage", stage, "--region", region, ...process.argv.slice(2)],
  {
    env: {
      ...localDefaults,
      ...process.env,
      AWS_REGION: region,
      CERTFORGE_LOCAL_EMULATION: "true",
    },
    stdio: "inherit",
  },
);

child.on("error", (error) => {
  process.stderr.write(`Unable to start Serverless Offline: ${error.message}\n`);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  if (signal) {
    process.stderr.write(`Serverless Offline stopped by ${signal}.\n`);
    return;
  }
  process.exitCode = code ?? 1;
});
