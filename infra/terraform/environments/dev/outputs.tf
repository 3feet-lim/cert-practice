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

output "github_actions_dev_deploy_role_arn" {
  description = "Copy into GitHub environment release-dev as CERTQUIZ_RELEASE_ROLE_ARN."
  value       = aws_iam_role.github_actions_dev_deploy.arn
}

output "cognito_user_pool_id" {
  description = "Dev Cognito user pool ID."
  value       = aws_cognito_user_pool.this.id
}

output "cognito_client_id" {
  description = "Dev Cognito web app client ID."
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_issuer" {
  description = "Dev Cognito JWT issuer."
  value       = local.runtime_parameter_values["cognito-issuer"]
}

output "cognito_hosted_ui_base_url" {
  description = "Dev Cognito Hosted UI base URL."
  value       = local.cognito_hosted_ui_base_url
}

output "web_bucket_name" {
  description = "Private S3 bucket containing dev SPA assets."
  value       = aws_s3_bucket.web.id
}

output "cloudfront_distribution_id" {
  description = "Dev SPA CloudFront distribution ID."
  value       = aws_cloudfront_distribution.web.id
}

output "web_origin" {
  description = "Canonical dev SPA origin."
  value       = local.web_origin
}

output "ssm_parameter_names" {
  description = "Complete dev application deployment contract in SSM."
  value = merge(
    {
      "dsql-endpoint" = module.dsql.endpoint_parameter_name
      "region"        = module.dsql.region_parameter_name
    },
    { for name, parameter in aws_ssm_parameter.contract : name => parameter.name },
  )
}

output "backup_recovery_policy" {
  description = "Dev backup and recovery policy declaration."
  value       = local.runtime_parameter_values["backup-recovery-policy"]
}
