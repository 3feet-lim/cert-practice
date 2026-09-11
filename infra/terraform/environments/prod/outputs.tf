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
  value       = module.application_runtime.cognito_user_pool_id
}

output "cognito_client_id" {
  description = "Production Cognito web application client ID."
  value       = module.application_runtime.cognito_client_id
}

output "cognito_issuer" {
  description = "Production Cognito JWT issuer."
  value       = module.application_runtime.cognito_issuer
}

output "web_bucket_name" {
  description = "Private S3 bucket containing production SPA assets."
  value       = module.application_runtime.web_bucket_name
}

output "cloudfront_distribution_id" {
  description = "Production SPA CloudFront distribution ID."
  value       = module.application_runtime.cloudfront_distribution_id
}

output "web_origin" {
  description = "Canonical production SPA origin."
  value       = module.application_runtime.web_origin
}

output "ssm_parameter_names" {
  description = "Complete production application deployment contract in SSM."
  value       = module.application_runtime.ssm_parameter_names
}

output "backup_recovery_policy" {
  description = "Production backup and recovery policy declaration."
  value       = module.application_runtime.backup_recovery_policy
}
