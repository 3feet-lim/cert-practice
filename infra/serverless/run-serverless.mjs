import { spawn } from "node:child_process";

const SUPPORTED_ACTIONS = new Set(["package", "deploy"]);

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

async function validateDeploymentInputs(action, args) {
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
  if (!endpoint.endsWith(`.dsql.${region}.on.aws`)) {
    throw new Error(`databaseEndpoint must be a DSQL endpoint in ${region}.`);
  }

  process.stdout.write(
    `Validated DSQL deployment inputs for ${action} in ${region}.\n`,
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
