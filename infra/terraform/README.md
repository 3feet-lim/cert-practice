# Terraform infrastructure

Terraform owns CertQuiz's persistent infrastructure: Aurora DSQL, Cognito, the optional Google identity-provider binding, private versioned SPA storage, CloudFront, optional Route 53 aliases, the stage SSM deployment contract, and permanent Lambda execution roles. Each environment root owns the application runtime directly in role-specific `cognito.tf`, `web_delivery.tf`, `rate_limit.tf`, and `ssm.tf` files; only DSQL remains a shared module. Serverless Framework owns only Lambda/API Gateway/EventBridge resources and consumes this contract; neither tool creates the other's resources.

## Roots and state

- `environments/dev` and `environments/prod` use the `smlim-tf-state-bucket` S3 backend in `ap-northeast-2` with backend encryption and S3 native locking (`use_lockfile = true`).
- Development state is stored at `cert-quiz/dev/terraform.tfstate`; production state is isolated at `cert-quiz/prod/terraform.tfstate`. Initialize production without `-migrate-state` until a separately approved production migration is performed.

Initialize and validate without applying cloud changes:

```bash
terraform -chdir=infra/terraform/environments/dev init
terraform -chdir=infra/terraform/environments/dev validate

terraform -chdir=infra/terraform/environments/prod init -reconfigure
terraform -chdir=infra/terraform/environments/prod validate
```

The backend bucket and keys are committed in each environment root. Do not override them with alternate backend configuration.

## Stage deployment contract

Every stage publishes only non-secret values below `/<service>/<stage>/`:

- `dsql-endpoint`, `region`
- `cognito-user-pool-id`, `cognito-client-id`, `cognito-issuer`, `cognito-hosted-ui-base-url`
- `lambda-role-arn`
- `web-bucket-name`, `cloudfront-distribution-id`, `cloudfront-domain-name`, `web-origin`, `markdown-image-origins`
- `api-origin` only when `api_origin` is supplied
- `backup-recovery-policy`

`api-origin` is genuinely optional: a `null` `api_origin` omits the `aws_ssm_parameter.contract["api-origin"]` resource rather than writing an empty SSM value. Supplying it creates that same keyed resource with the supplied HTTPS origin. `markdown-image-origins` is always published because Serverless consumes it: configured canonical HTTPS origins are joined with commas, while an empty list publishes the documented fail-closed `https://images.invalid` sentinel. The `.invalid` origin cannot be a real image source and keeps Markdown image loading denied until an allowlist is configured.

`terraform output ssm_parameter_names` is the canonical list for Serverless and deployment automation. The Lambda role has narrowly scoped `ssm:GetParameter` permission for this exact list, DSQL connect permission for its own cluster, and log-stream write permission for its own function. It does not receive `dsql:DbConnectAdmin`, broad log-group creation, wildcard SSM, or `iam:PassRole`.

## GitHub Actions DEV deployment role

`environments/dev` manages a GitHub Actions OIDC provider and a deployment role that accepts repository-wide OIDC subjects matching exactly `repo:3feet-lim@139703302/cert-practice@1354159331:*`, with the `sts.amazonaws.com` audience. This trust is branch, tag, and GitHub environment independent, while remaining locked to the immutable GitHub owner and repository identifiers `139703302` and `1354159331`; it does not trust other repositories or organizations. Its sole `ssm:GetParameter` permission covers `arn:<partition>:ssm:<region>:<account>:parameter/*`: every SSM parameter name in the configured deployment account and region, never another account or region. This wider name scope is required because Serverless Framework reads its framework-managed `/serverless-framework/deployment/s3-bucket` parameter before deployment; it avoids framework-path failures while leaving all unrelated actions and resource permissions unchanged. Serverless Framework v4 may create and manage its deployment bucket, so the role grants `s3:*` only to the current partition's `serverless-framework-deployments-<region>-*` bucket-name pattern and its objects; this bounded exception prevents repeated missing-S3-action failures without granting access to unrelated buckets, accounts, or stages. The same role has a separate least-privilege statement for the Terraform-owned `aws_s3_bucket.web`: it can list that bucket and read, upload, or delete only its objects. It can create and wait for invalidations only on the Terraform-owned `aws_cloudfront_distribution.web`; it cannot alter CloudFront infrastructure or access production resources. It is separate from, and never replaces, the dev Lambda execution role. The `.github/workflows/deploy-dev.yml` workflow triggers on pushes to `main`: it builds both DEV API and SPA assets, deploys and smokes the DEV API, then publishes the SPA only after that smoke succeeds. CloudFront distribution configuration is Terraform-owned and the workflow only invalidates the existing distribution after upload; it never creates or modifies CloudFront infrastructure.

After the user applies the dev Terraform root, perform the one AWS-to-GitHub handoff: copy `terraform -chdir=infra/terraform/environments/dev output -raw github_actions_dev_deploy_role_arn` into GitHub **Environment** `release-dev` as the secret `CERTQUIZ_RELEASE_ROLE_ARN`. The automatic `deploy-dev.yml` workflow also separately requires the `SERVERLESS_ACCESS_KEY` secret in `release-dev`; it is a Serverless Framework credential, not an AWS credential or Terraform output.

## Cognito and Google identity provider

Each root creates a Cognito user pool, OAuth authorization-code web client, and Hosted UI domain. Google is parameterized but credentials are never stored in Terraform files or SSM:

- set `enable_google_identity_provider=true`;
- inject `google_oauth_client_id` and sensitive `google_oauth_client_secret` through a protected CI secret store or `TF_VAR_*` environment variables;
- register the generated Cognito redirect endpoint with Google before apply.

Dev defaults the Google binding off so static validation needs no credentials. Production defaults it on and fails planning until credentials are supplied. This is an intentional configuration gate, not a fallback login path.

## SPA, DNS, certificate, and recovery posture

The web bucket is private, owner-enforced, AES256-encrypted, versioned, and blocks every public access mechanism. Only the CloudFront distribution's Origin Access Control may read assets. CloudFront redirects viewers to HTTPS, serves SPA deep links through `index.html`, and supplies CSP, HSTS, no-sniff, no-referrer, and frame-deny headers.

A custom web domain requires an issued `us-east-1` ACM certificate ARN. Supplying `route53_zone_id` creates the A alias; leave it unset only when DNS is operated outside Route 53. Production requires explicit `web_domain_name`, `route53_zone_id`, and `acm_certificate_arn` variables, making domain ownership and ACM issuance configuration gates rather than resources Terraform guesses at.

S3 noncurrent versions are retained for rollback (`30` days in dev, `90` in prod). Aurora DSQL deletion protection is always enabled and production cannot set `force_destroy`. Aurora DSQL does not expose an RDS-style Terraform `backup_retention_period`; its point-in-time recovery capability is provider-managed, so Terraform publishes the recovery posture rather than pretending to configure an unsupported retention value. Any recovery run must be executed and evidenced through the approved AWS DSQL operational procedure.

## External configuration gates

No apply is attempted by repository automation. An apply additionally requires AWS permissions, a unique Cognito Hosted UI prefix, Google OAuth credentials when enabled, an issued ACM certificate/domain authority for a custom domain, and a protected production state bucket. These are intentionally external operational inputs, not repository secrets.

## References

- [Terraform AWS Provider: Aurora DSQL cluster](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dsql_cluster)
- [AWS Backup point-in-time recovery overview](https://docs.aws.amazon.com/aws-backup/latest/devguide/point-in-time-recovery.html)

Content was rephrased for compliance with licensing restrictions.
