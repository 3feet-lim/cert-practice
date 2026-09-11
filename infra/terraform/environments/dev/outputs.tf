output "dsql_cluster_identifier" {
  description = "Dev Aurora DSQL cluster identifier."
  value       = module.dsql.cluster_identifier
}

output "dsql_cluster_arn" {
  description = "Dev Aurora DSQL cluster ARN."
  value       = module.dsql.cluster_arn
}

output "dsql_endpoint" {
  description = "Dev Aurora DSQL PostgreSQL endpoint hostname."
  value       = module.dsql.endpoint
}

output "dsql_endpoint_parameter_name" {
  description = "SSM parameter read by the dev application deployment."
  value       = module.dsql.endpoint_parameter_name
}

output "dsql_vpc_endpoint_service_name" {
  description = "Service name for a future DSQL PrivateLink endpoint."
  value       = module.dsql.vpc_endpoint_service_name
}

output "api_lambda_execution_role_arn" {
  description = "Dev API Lambda execution role ARN."
  value       = aws_iam_role.api_lambda_execution.arn
}

output "api_lambda_execution_role_name" {
  description = "Dev API Lambda execution role name."
  value       = aws_iam_role.api_lambda_execution.name
}

output "cognito_user_pool_id" {
  description = "Dev Cognito user pool ID."
  value       = module.application_runtime.cognito_user_pool_id
}

output "cognito_client_id" {
  description = "Dev Cognito web app client ID."
  value       = module.application_runtime.cognito_client_id
}

output "cognito_issuer" {
  description = "Dev Cognito JWT issuer."
  value       = module.application_runtime.cognito_issuer
}

output "cognito_hosted_ui_base_url" {
  description = "Dev Cognito Hosted UI base URL."
  value       = module.application_runtime.cognito_hosted_ui_base_url
}

output "web_bucket_name" {
  description = "Private S3 bucket containing dev SPA assets."
  value       = module.application_runtime.web_bucket_name
}

output "cloudfront_distribution_id" {
  description = "Dev SPA CloudFront distribution ID."
  value       = module.application_runtime.cloudfront_distribution_id
}

output "web_origin" {
  description = "Canonical dev SPA origin."
  value       = module.application_runtime.web_origin
}

output "ssm_parameter_names" {
  description = "Complete dev application deployment contract in SSM."
  value       = module.application_runtime.ssm_parameter_names
}

output "backup_recovery_policy" {
  description = "Dev backup and recovery policy declaration."
  value       = module.application_runtime.backup_recovery_policy
}
