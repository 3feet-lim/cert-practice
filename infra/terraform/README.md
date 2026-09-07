# Terraform infrastructure

Aurora DSQL is provisioned through a reusable module with a separate Terraform root per environment. Separate roots keep dev and production state isolated so a production deployment cannot replace the dev cluster.

## Dev DSQL

The dev root creates:

- one single-Region Aurora DSQL cluster in `ap-northeast-2`
- `/<service>/dev/dsql-endpoint` in SSM Parameter Store
- `/<service>/dev/region` in SSM Parameter Store

The cluster uses the AWS-owned KMS key and has deletion protection enabled. Terraform will not remove it unless `force_destroy=true` is deliberately supplied.

```bash
terraform -chdir=infra/terraform/environments/dev init
terraform -chdir=infra/terraform/environments/dev plan -out=tfplan
terraform -chdir=infra/terraform/environments/dev apply tfplan
```

Use the outputs after apply to configure the live DSQL spike. The endpoint is also published at `/certquiz/dev/dsql-endpoint`.

To intentionally remove the dev cluster after testing:

```bash
terraform -chdir=infra/terraform/environments/dev destroy -var='force_destroy=true'
```

## Production

Create a separate `environments/prod` root using the same `modules/dsql` module and an independent remote state. Production must keep deletion protection enabled and `force_destroy=false`. The production application should read `/certquiz/prod/dsql-endpoint`; application code and the database adapter do not change.

Schema migrations and the IAM-to-database-role mapping must still be applied independently to each cluster.

## References

- [Terraform AWS Provider `aws_dsql_cluster`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/dsql_cluster)
- [AWS Aurora DSQL authentication tokens](https://docs.aws.amazon.com/aurora-dsql/latest/userguide/SECTION_authentication-token.html)
