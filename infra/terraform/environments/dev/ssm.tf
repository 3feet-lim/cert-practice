locals {
  runtime_environment = "dev"
  runtime_ssm_prefix  = "/${var.service_name}/${local.runtime_environment}"

  runtime_parameter_descriptions = {
    "cognito-user-pool-id"       = "Cognito user pool ID for ${var.service_name} ${local.runtime_environment}"
    "cognito-client-id"          = "Cognito application client ID for ${var.service_name} ${local.runtime_environment}"
    "cognito-issuer"             = "Cognito JWT issuer for ${var.service_name} ${local.runtime_environment}"
    "cognito-hosted-ui-base-url" = "Cognito Hosted UI base URL for ${var.service_name} ${local.runtime_environment}"
    "lambda-role-arn"            = "Terraform-owned Lambda execution role ARN for ${var.service_name} ${local.runtime_environment}"
    "web-bucket-name"            = "Private S3 web asset bucket for ${var.service_name} ${local.runtime_environment}"
    "cloudfront-distribution-id" = "CloudFront distribution ID for ${var.service_name} ${local.runtime_environment}"
    "cloudfront-domain-name"     = "CloudFront distribution domain for ${var.service_name} ${local.runtime_environment}"
    "web-origin"                 = "Canonical SPA origin for ${var.service_name} ${local.runtime_environment}"
    "markdown-image-origins"     = "Comma-separated trusted Markdown image origins for ${var.service_name} ${local.runtime_environment}"
    "rate-limit-table-name"      = "Shared durable rate limit table for ${var.service_name} ${local.runtime_environment}"
    "rate-limit-policies"        = "JSON fixed-window rate limit policies for ${var.service_name} ${local.runtime_environment}"
    "api-origin"                 = "Optional HTTPS API origin for ${var.service_name} ${local.runtime_environment}"
    "backup-recovery-policy"     = "Recovery policy declaration for ${var.service_name} ${local.runtime_environment}"
  }

  runtime_parameter_values = {
    "cognito-user-pool-id"       = aws_cognito_user_pool.this.id
    "cognito-client-id"          = aws_cognito_user_pool_client.web.id
    "cognito-issuer"             = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
    "cognito-hosted-ui-base-url" = local.cognito_hosted_ui_base_url
    "lambda-role-arn"            = aws_iam_role.api_lambda_execution.arn
    "web-bucket-name"            = aws_s3_bucket.web.id
    "cloudfront-distribution-id" = aws_cloudfront_distribution.web.id
    "cloudfront-domain-name"     = aws_cloudfront_distribution.web.domain_name
    "web-origin"                 = local.web_origin
    "markdown-image-origins"     = join(",", var.markdown_image_origins)
    "rate-limit-table-name"      = aws_dynamodb_table.rate_limit.name
    "rate-limit-policies"        = jsonencode(var.rate_limit_policies)
    "api-origin"                 = var.api_origin == null ? "" : var.api_origin
    "backup-recovery-policy"     = "s3-versioning-noncurrent-${var.noncurrent_asset_retention_days}-days;dsql-provider-managed-pitr"
  }
}

resource "aws_ssm_parameter" "contract" {
  for_each = local.runtime_parameter_values

  name        = "${local.runtime_ssm_prefix}/${each.key}"
  description = local.runtime_parameter_descriptions[each.key]
  type        = "String"
  value       = each.value

  tags = var.tags
}
