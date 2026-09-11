provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.tags, {
      Environment = "dev"
      ManagedBy   = "Terraform"
      Project     = var.service_name
    })
  }
}

module "dsql" {
  source = "../../modules/dsql"

  service_name                = var.service_name
  environment                 = "dev"
  aws_region                  = var.aws_region
  deletion_protection_enabled = true
  force_destroy               = var.force_destroy
  kms_encryption_key          = "AWS_OWNED_KMS_KEY"
  tags                        = var.tags
}

module "application_runtime" {
  source = "../../modules/application-runtime"

  service_name                    = var.service_name
  environment                     = "dev"
  aws_region                      = var.aws_region
  dsql_endpoint                   = module.dsql.endpoint
  dsql_endpoint_parameter_name    = module.dsql.endpoint_parameter_name
  region_parameter_name           = module.dsql.region_parameter_name
  lambda_role_arn                 = aws_iam_role.api_lambda_execution.arn
  cognito_hosted_ui_domain_prefix = var.cognito_hosted_ui_domain_prefix
  enable_google_identity_provider = var.enable_google_identity_provider
  google_oauth_client_id          = var.google_oauth_client_id
  google_oauth_client_secret      = var.google_oauth_client_secret
  web_domain_name                 = var.web_domain_name
  route53_zone_id                 = var.route53_zone_id
  acm_certificate_arn             = var.acm_certificate_arn
  api_origin                      = var.api_origin
  markdown_image_origins          = var.markdown_image_origins
  rate_limit_policies             = var.rate_limit_policies
  cognito_advanced_security_mode  = var.cognito_advanced_security_mode
  cloudfront_price_class          = var.cloudfront_price_class
  noncurrent_asset_retention_days = var.noncurrent_asset_retention_days
  tags                            = var.tags
}
