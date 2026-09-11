# Terraform infrastructure

Terraform owns CertQuiz's persistent infrastructure: Aurora DSQL, Cognito, the optional Google identity-provider binding, private versioned SPA storage, CloudFront, optional Route 53 aliases, the stage SSM deployment contract, and permanent Lambda execution roles. Serverless Framework owns only Lambda/API Gateway/EventBridge resources and consumes this contract; neither tool creates the other's resources.

## Roots and state

- `environments/dev` is an isolated development root. It can use its existing local state for the current spike environment.
- `environments/prod` is a separate production root with an S3 backend configuration. Its state bucket is deliberately provided through `-backend-config=backend.hcl` or equivalent protected CI configuration, never committed as an account-specific value. The remote bucket must be versioned, encrypted, and restricted to Terraform operators. S3 native locking (`use_lockfile = true`) is enabled.

Initialize and validate without applying cloud changes:

```bash
terraform -chdir=infra/terraform/environments/dev init
terraform -chdir=infra/terraform/environments/dev validate

terraform -chdir=infra/terraform/environments/prod init \
  -backend-config=backend.hcl
terraform -chdir=infra/terraform/environments/prod validate
```

`backend.hcl.example` documents the sole non-secret backend input. Copy it outside the repository or generate it in CI.

## Stage deployment contract

Every stage publishes only non-secret values below `/<service>/<stage>/`:

- `dsql-endpoint`, `region`
- `cognito-user-pool-id`, `cognito-client-id`, `cognito-issuer`, `cognito-hosted-ui-base-url`
- `lambda-role-arn`
- `web-bucket-name`, `cloudfront-distribution-id`, `cloudfront-domain-name`, `web-origin`, `api-origin`
- `backup-recovery-policy`

`terraform output ssm_parameter_names` is the canonical list for Serverless and deployment automation. The Lambda role has narrowly scoped `ssm:GetParameter` permission for this exact list, DSQL connect permission for its own cluster, and log-stream write permission for its own function. It does not receive `dsql:DbConnectAdmin`, broad log-group creation, wildcard SSM, or `iam:PassRole`.

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
