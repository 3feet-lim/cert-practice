import { spawn } from "node:child_process";

const stage = process.env.CERTQUIZ_STAGE ?? "dev";
const region = process.env.CERTQUIZ_REGION ?? "ap-northeast-2";
const localDefaults = {
  CERTQUIZ_LAMBDA_ROLE_ARN: "arn:aws:iam::000000000000:role/certquiz-local",
  CERTQUIZ_DSQL_ENDPOINT: "local.dsql.ap-northeast-2.on.aws",
  CERTQUIZ_COGNITO_ISSUER: "https://cognito.localhost",
  CERTQUIZ_COGNITO_CLIENT_ID: "certquiz-local",
  CERTQUIZ_WEB_ORIGIN: "http://localhost:5173",
  CERTQUIZ_MARKDOWN_IMAGE_ORIGINS: "https://images.localhost",
  CERTQUIZ_RATE_LIMIT_TABLE: "certquiz-local-rate-limit",
  CERTQUIZ_RATE_LIMIT_POLICIES: "{}",
  CERTQUIZ_TELEMETRY_NAMESPACE: `CertQuiz/${stage}`,
  CERTQUIZ_TELEMETRY_SERVICE: "certquiz-api",
};

const child = spawn(
  process.platform === "win32" ? "serverless.cmd" : "serverless",
  ["offline", "start", "--stage", stage, "--region", region, ...process.argv.slice(2)],
  {
    env: {
      ...localDefaults,
      ...process.env,
      AWS_REGION: region,
      CERTQUIZ_LOCAL_EMULATION: "true",
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
