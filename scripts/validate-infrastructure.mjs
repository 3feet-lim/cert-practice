import { mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const terraformRoot = join(root, "infra/terraform");
const environmentRoots = [
  join(terraformRoot, "environments/dev"),
  join(terraformRoot, "environments/prod"),
];
const argumentsSet = new Set(process.argv.slice(2));
const runPlan = argumentsSet.has("--plan");
const runPackage = argumentsSet.has("--package");

for (const argument of argumentsSet) {
  if (argument !== "--plan" && argument !== "--package") {
    throw new Error(`Unknown argument: ${argument}`);
  }
}

function execute(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: { ...process.env, TF_IN_AUTOMATION: "true", ...options.env },
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status ?? "an error"}.`,
    );
  }
}

function planArguments(environment, planPath) {
  const common = [
    "plan",
    "-input=false",
    "-lock=false",
    "-refresh=false",
    `-out=${planPath}`,
  ];
  if (environment === "dev") return common;

  return [
    ...common,
    "-var=cognito_hosted_ui_domain_prefix=certquiz-prod-validation",
    "-var=enable_google_identity_provider=false",
    "-var=web_domain_name=quiz.validation.example.com",
    "-var=route53_zone_id=Z0123456789ABCDEF",
    "-var=acm_certificate_arn=arn:aws:acm:us-east-1:123456789012:certificate/00000000-0000-0000-0000-000000000000",
  ];
}

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required when running --package.`);
  return value;
}

async function validateTerraform() {
  execute("terraform", ["fmt", "-check", "-recursive", terraformRoot]);
  for (const directory of environmentRoots) {
    execute("terraform", ["init", "-backend=false", "-input=false", "-upgrade=false"], {
      cwd: directory,
    });
    execute("terraform", ["validate", "-no-color"], { cwd: directory });
  }
}

async function validatePlans() {
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "certquiz-terraform-"));
  try {
    for (const directory of environmentRoots) {
      const environment = directory.endsWith("/prod") ? "prod" : "dev";
      execute(
        "terraform",
        planArguments(environment, join(temporaryDirectory, `${environment}.tfplan`)),
        {
          cwd: directory,
        },
      );
    }
  } finally {
    await rm(temporaryDirectory, { force: true, recursive: true });
  }
}

function validateServerlessPackage() {
  const lambdaRoleArn = requiredEnvironment("CERTQUIZ_LAMBDA_ROLE_ARN");
  const databaseEndpoint = requiredEnvironment("CERTQUIZ_DSQL_ENDPOINT");
  execute(
    "pnpm",
    [
      "--dir",
      "infra/serverless",
      "exec",
      "node",
      "run-serverless.mjs",
      "package",
      "--stage",
      process.env.CERTQUIZ_INFRA_STAGE ?? "dev",
      "--region",
      process.env.AWS_REGION ?? "ap-northeast-2",
      `--param=lambdaRoleArn=${lambdaRoleArn}`,
      `--param=databaseEndpoint=${databaseEndpoint}`,
    ],
    { env: { SERVERLESS_ACCESS_KEY: requiredEnvironment("SERVERLESS_ACCESS_KEY") } },
  );
}

await validateTerraform();
if (runPlan) await validatePlans();
if (runPackage) validateServerlessPackage();

process.stdout.write(
  `Infrastructure validation completed${runPlan ? " with plans" : ""}${runPackage ? " and Serverless packaging" : ""}.\n`,
);
