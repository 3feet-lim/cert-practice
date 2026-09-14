output "dsql_cluster_identifier" {
  description = "Production Aurora DSQL cluster identifier."
  value       = module.dsql.cluster_identifier
}

output "dsql_cluster_arn" {
  description = "Production Aurora DSQL cluster ARN."
  value       = module.dsql.cluster_arn
}

output "dsql_endpoint" {
  description = "Production Aurora DSQL endpoint hostname."
  value       = module.dsql.endpoint
}

output "api_lambda_execution_role_arn" {
  description = "Production API Lambda execution role ARN."
  value       = aws_iam_role.api_lambda_execution.arn
}

output "cognito_user_pool_id" {
  description = "Production Cognito user pool ID."
  value       = aws_cognito_user_pool.this.id
}

output "cognito_client_id" {
  description = "Production Cognito web application client ID."
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_issuer" {
  description = "Production Cognito JWT issuer."
  value       = local.runtime_parameter_values["cognito-issuer"]
}

output "web_bucket_name" {
  description = "Private S3 bucket containing production SPA assets."
  value       = aws_s3_bucket.web.id
}

output "cloudfront_distribution_id" {
  description = "Production SPA CloudFront distribution ID."
  value       = aws_cloudfront_distribution.web.id
}

output "web_origin" {
  description = "Canonical production SPA origin."
  value       = local.web_origin
}

output "ssm_parameter_names" {
  description = "Complete production application deployment contract in SSM."
  value = merge(
    {
      "dsql-endpoint" = module.dsql.endpoint_parameter_name
      "region"        = module.dsql.region_parameter_name
    },
    { for name, parameter in aws_ssm_parameter.contract : name => parameter.name },
  )
}

output "backup_recovery_policy" {
  description = "Production backup and recovery policy declaration."
  value       = local.runtime_parameter_values["backup-recovery-policy"]
}
