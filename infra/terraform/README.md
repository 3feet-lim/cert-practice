# Terraform infrastructure

Aurora DSQL is provisioned through a reusable module with a separate Terraform root per environment. The dev root also defines its Lambda execution role directly; a one-off role does not have a dedicated module. Separate roots keep dev and production state isolated.

## Dev infrastructure

The dev root creates:

- one single-Region Aurora DSQL cluster in `ap-northeast-2`
- `/<service>/dev/dsql-endpoint` and `/<service>/dev/region` in SSM Parameter Store
- one Lambda execution role trusted only by Lambda
- an inline policy granting `dsql:DbConnect` only on the dev DSQL cluster
- log stream write permissions scoped to `/aws/lambda/<service>-dev-api`

The cluster uses the AWS-owned KMS key and has deletion protection enabled. Terraform will not remove it unless `force_destroy=true` is deliberately supplied. The Lambda role does not receive `dsql:DbConnectAdmin`, `logs:CreateLogGroup`, or the broad `AWSLambdaBasicExecutionRole` managed policy. Serverless owns the Lambda log group and its retention setting.

```bash
terraform -chdir=infra/terraform/environments/dev init
terraform -chdir=infra/terraform/environments/dev plan -out=tfplan
terraform -chdir=infra/terraform/environments/dev apply tfplan
```

Use the outputs after apply to configure the live DSQL spike and Serverless deployment. The endpoint is published at `/certquiz/dev/dsql-endpoint`; retrieve the role with `terraform output -raw api_lambda_execution_role_arn`.

Terraform must be applied before the first Serverless deployment so the execution role exists. The deployment principal also needs `iam:PassRole` for that role; this permission does not belong on the Lambda role itself.

To intentionally remove the dev cluster after testing:

```bash
terraform -chdir=infra/terraform/environments/dev destroy -var='force_destroy=true'
```

## Production

Production must create a separate DSQL module instance and define its execution role in an independent `environments/prod` root and remote state. Production must keep DSQL deletion protection enabled and `force_destroy=false`. The production application should read `/certquiz/prod/dsql-endpoint`; application code and the database adapter do not change.

Schema migrations and the IAM-to-database-role mapping must still be applied independently to each cluster.

## References

- [Terraform AWS Provider `aws_dsql_cluster`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dsql_cluster)
- [AWS Aurora DSQL authentication tokens](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_authentication-token.html)
