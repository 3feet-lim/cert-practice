locals {
  cluster_name = "${var.service_name}-${var.environment}-dsql"
  endpoint     = "${aws_dsql_cluster.this.identifier}.dsql.${var.aws_region}.on.aws"
  ssm_prefix   = "/${var.service_name}/${var.environment}"
}

resource "aws_dsql_cluster" "this" {
  region                      = var.aws_region
  deletion_protection_enabled = var.deletion_protection_enabled
  force_destroy               = var.force_destroy
  kms_encryption_key          = var.kms_encryption_key

  tags = merge(var.tags, {
    Name = local.cluster_name
  })
}

resource "aws_ssm_parameter" "dsql_endpoint" {
  name        = "${local.ssm_prefix}/dsql-endpoint"
  description = "Aurora DSQL endpoint for ${var.service_name} ${var.environment}"
  type        = "String"
  value       = local.endpoint

  tags = var.tags
}

resource "aws_ssm_parameter" "region" {
  name        = "${local.ssm_prefix}/region"
  description = "AWS region for ${var.service_name} ${var.environment}"
  type        = "String"
  value       = var.aws_region

  tags = var.tags
}
