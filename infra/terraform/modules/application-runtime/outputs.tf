output "cognito_user_pool_id" {
  description = "Cognito user pool ID."
  value       = aws_cognito_user_pool.this.id
}

output "cognito_user_pool_arn" {
  description = "Cognito user pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "cognito_client_id" {
  description = "Cognito web application client ID."
  value       = aws_cognito_user_pool_client.web.id
}

output "cognito_issuer" {
  description = "Cognito JWT issuer URL."
  value       = local.parameter_values["cognito-issuer"]
}

output "cognito_hosted_ui_base_url" {
  description = "Cognito Hosted UI base URL."
  value       = local.cognito_hosted_ui_base_url
}

output "web_bucket_name" {
  description = "Private S3 bucket for versioned SPA assets."
  value       = aws_s3_bucket.web.id
}

output "web_bucket_arn" {
  description = "Private S3 bucket ARN for SPA assets."
  value       = aws_s3_bucket.web.arn
}

output "cloudfront_distribution_id" {
  description = "CloudFront distribution ID for the SPA."
  value       = aws_cloudfront_distribution.web.id
}

output "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN for the SPA."
  value       = aws_cloudfront_distribution.web.arn
}

output "cloudfront_domain_name" {
  description = "CloudFront distribution domain name."
  value       = aws_cloudfront_distribution.web.domain_name
}

output "web_origin" {
  description = "Canonical SPA HTTPS origin."
  value       = local.web_origin
}

output "rate_limit_table_name" {
  description = "DynamoDB table used for shared durable API rate limits."
  value       = aws_dynamodb_table.rate_limit.name
}

output "rate_limit_table_arn" {
  description = "ARN of the shared durable API rate limit table."
  value       = aws_dynamodb_table.rate_limit.arn
}

output "ssm_parameter_names" {
  description = "Complete stage-specific application contract, including the DSQL endpoint and region parameters."
  value = merge(
    {
      "dsql-endpoint" = var.dsql_endpoint_parameter_name
      "region"        = var.region_parameter_name
    },
    { for name, parameter in aws_ssm_parameter.contract : name => parameter.name },
  )
}

output "ssm_parameter_arns" {
  description = "ARNs for Terraform-owned runtime contract parameters."
  value       = { for name, parameter in aws_ssm_parameter.contract : name => parameter.arn }
}

output "google_identity_provider_enabled" {
  description = "Whether the Google Cognito identity provider is enabled by configuration."
  value       = var.enable_google_identity_provider
}

output "backup_recovery_policy" {
  description = "Published recovery posture: versioned S3 assets plus DSQL provider-managed point-in-time recovery."
  value       = local.parameter_values["backup-recovery-policy"]
}
