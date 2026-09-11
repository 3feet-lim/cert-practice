data "aws_partition" "current" {}

locals {
  ssm_prefix                 = "/${var.service_name}/${var.environment}"
  cloudfront_aliases         = var.web_domain_name == null ? [] : [var.web_domain_name]
  web_origin                 = var.web_domain_name == null ? "https://${aws_cloudfront_distribution.web.domain_name}" : "https://${var.web_domain_name}"
  cognito_hosted_ui_base_url = "https://${aws_cognito_user_pool_domain.hosted_ui.domain}.auth.${var.aws_region}.amazoncognito.com"
  certificate_configuration  = var.web_domain_name == null ? null : var.acm_certificate_arn
  google_provider_name       = "Google"
  parameter_descriptions = {
    "cognito-user-pool-id"       = "Cognito user pool ID for ${var.service_name} ${var.environment}"
    "cognito-client-id"          = "Cognito application client ID for ${var.service_name} ${var.environment}"
    "cognito-issuer"             = "Cognito JWT issuer for ${var.service_name} ${var.environment}"
    "cognito-hosted-ui-base-url" = "Cognito Hosted UI base URL for ${var.service_name} ${var.environment}"
    "lambda-role-arn"            = "Terraform-owned Lambda execution role ARN for ${var.service_name} ${var.environment}"
    "web-bucket-name"            = "Private S3 web asset bucket for ${var.service_name} ${var.environment}"
    "cloudfront-distribution-id" = "CloudFront distribution ID for ${var.service_name} ${var.environment}"
    "cloudfront-domain-name"     = "CloudFront distribution domain for ${var.service_name} ${var.environment}"
    "web-origin"                 = "Canonical SPA origin for ${var.service_name} ${var.environment}"
    "markdown-image-origins"     = "Comma-separated trusted Markdown image origins for ${var.service_name} ${var.environment}"
    "rate-limit-table-name"      = "Shared durable rate limit table for ${var.service_name} ${var.environment}"
    "rate-limit-policies"        = "JSON fixed-window rate limit policies for ${var.service_name} ${var.environment}"
    "api-origin"                 = "Optional HTTPS API origin for ${var.service_name} ${var.environment}"
    "backup-recovery-policy"     = "Recovery policy declaration for ${var.service_name} ${var.environment}"
  }
  parameter_values = {
    "cognito-user-pool-id"       = aws_cognito_user_pool.this.id
    "cognito-client-id"          = aws_cognito_user_pool_client.web.id
    "cognito-issuer"             = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
    "cognito-hosted-ui-base-url" = local.cognito_hosted_ui_base_url
    "lambda-role-arn"            = var.lambda_role_arn
    "web-bucket-name"            = aws_s3_bucket.web.id
    "cloudfront-distribution-id" = aws_cloudfront_distribution.web.id
    "cloudfront-domain-name"     = aws_cloudfront_distribution.web.domain_name
    "web-origin"                 = local.web_origin
    "markdown-image-origins"     = join(",", var.markdown_image_origins)
    "rate-limit-table-name"      = aws_dynamodb_table.rate_limit.name
    "rate-limit-policies"        = jsonencode(var.rate_limit_policies)
    "api-origin"                 = coalesce(var.api_origin, "")
    "backup-recovery-policy"     = "s3-versioning-noncurrent-${var.noncurrent_asset_retention_days}-days;dsql-provider-managed-pitr"
  }
}

# The table is an application-security primitive, not a cache. Every Lambda
# concurrency instance consumes the same actor/IP fixed-window buckets.
resource "aws_dynamodb_table" "rate_limit" {
  name         = "${var.service_name}-${var.environment}-rate-limit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "bucketKey"

  attribute {
    name = "bucketKey"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = var.environment == "prod"
  }

  tags = merge(var.tags, {
    Name    = "${var.service_name}-${var.environment}-rate-limit"
    Purpose = "shared-durable-rate-limit"
  })
}

resource "aws_cognito_user_pool" "this" {
  name                     = "${var.service_name}-${var.environment}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  user_pool_add_ons {
    # Cognito owns Hosted UI login; enhanced protection is the login abuse policy.
    advanced_security_mode = var.cognito_advanced_security_mode
  }

  password_policy {
    minimum_length    = 32
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 320
    }
  }

  schema {
    attribute_data_type = "String"
    name                = "name"
    required            = false
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = merge(var.tags, {
    Name = "${var.service_name}-${var.environment}-users"
  })
}

resource "aws_cognito_user_pool_domain" "hosted_ui" {
  domain       = var.cognito_hosted_ui_domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_identity_provider" "google" {
  count = var.enable_google_identity_provider ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = local.google_provider_name
  provider_type = "Google"

  provider_details = {
    authorize_scopes = "openid email profile"
    client_id        = var.google_oauth_client_id
    client_secret    = var.google_oauth_client_secret
  }

  attribute_mapping = {
    email = "email"
    name  = "name"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.service_name}-${var.environment}-web"
  user_pool_id                         = aws_cognito_user_pool.this.id
  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = concat(["COGNITO"], var.enable_google_identity_provider ? [local.google_provider_name] : [])
  callback_urls                        = ["${local.web_origin}/auth/callback"]
  logout_urls                          = ["${local.web_origin}/login"]

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  depends_on = [aws_cognito_identity_provider.google]
}

resource "aws_s3_bucket" "web" {
  bucket_prefix = "${var.service_name}-${var.environment}-web-"

  tags = merge(var.tags, {
    Name = "${var.service_name}-${var.environment}-web"
  })
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    id     = "retain-noncurrent-web-assets"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_asset_retention_days
    }
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.service_name}-${var.environment}-web"
  description                       = "CloudFront access control for the private ${var.service_name} ${var.environment} web bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "web_security" {
  name = "${var.service_name}-${var.environment}-web-security"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' https:; script-src 'self'; style-src 'self'; connect-src 'self' https:"
      override                = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.service_name} ${var.environment} SPA"
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  aliases             = local.cloudfront_aliases

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web-assets"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "web-assets"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.web_security.id

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = local.certificate_configuration
    cloudfront_default_certificate = var.web_domain_name == null
    minimum_protocol_version       = var.web_domain_name == null ? "TLSv1" : "TLSv1.2_2021"
    ssl_support_method             = var.web_domain_name == null ? null : "sni-only"
  }

  tags = merge(var.tags, {
    Name = "${var.service_name}-${var.environment}-web"
  })

  lifecycle {
    precondition {
      condition     = var.web_domain_name == null || var.acm_certificate_arn != null
      error_message = "web_domain_name requires an issued us-east-1 ACM certificate ARN."
    }

    precondition {
      condition     = var.route53_zone_id == null || var.web_domain_name != null
      error_message = "route53_zone_id requires web_domain_name."
    }
  }
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    sid    = "AllowCloudFrontReadOnly"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.web]
}

resource "aws_route53_record" "web" {
  count = var.web_domain_name != null && var.route53_zone_id != null ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.web_domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_ssm_parameter" "contract" {
  for_each = local.parameter_values

  name        = "${local.ssm_prefix}/${each.key}"
  description = local.parameter_descriptions[each.key]
  type        = "String"
  value       = each.value

  tags = var.tags
}
