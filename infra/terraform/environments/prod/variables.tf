variable "aws_region" {
  description = "AWS region for production resources."
  type        = string
  default     = "ap-northeast-2"
}

variable "service_name" {
  description = "Service name used for tags and SSM paths."
  type        = string
  default     = "certquiz"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.service_name))
    error_message = "service_name must be 2-31 lowercase letters, digits, or hyphens and start with a letter."
  }
}

variable "kms_encryption_key" {
  description = "DSQL KMS key ARN or AWS_OWNED_KMS_KEY."
  type        = string
  default     = "AWS_OWNED_KMS_KEY"
}

variable "cognito_hosted_ui_domain_prefix" {
  description = "Globally unique production Cognito Hosted UI domain prefix."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{1,63}$", var.cognito_hosted_ui_domain_prefix))
    error_message = "cognito_hosted_ui_domain_prefix must contain only lowercase letters, digits, and hyphens."
  }
}

variable "enable_google_identity_provider" {
  description = "Production must create the Google Cognito identity provider after credentials are injected."
  type        = bool
  default     = true
}

variable "google_oauth_client_id" {
  description = "Google OAuth client ID injected by the deployment environment."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = !var.enable_google_identity_provider || (var.google_oauth_client_id != null && trimspace(var.google_oauth_client_id) != "")
    error_message = "google_oauth_client_id is required when enable_google_identity_provider is true."
  }
}

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret injected by a secret-capable deployment environment."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true

  validation {
    condition     = !var.enable_google_identity_provider || (var.google_oauth_client_secret != null && trimspace(var.google_oauth_client_secret) != "")
    error_message = "google_oauth_client_secret is required when enable_google_identity_provider is true."
  }
}

variable "web_domain_name" {
  description = "Production SPA domain, such as quiz.example.com."
  type        = string
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID that owns web_domain_name."
  type        = string
}

variable "acm_certificate_arn" {
  description = "Issued us-east-1 ACM certificate ARN covering web_domain_name for CloudFront."
  type        = string

  validation {
    condition     = var.acm_certificate_arn == null || can(regex("^arn:[^:]+:acm:us-east-1:[0-9]{12}:certificate/.+$", var.acm_certificate_arn))
    error_message = "acm_certificate_arn must be an issued us-east-1 ACM certificate ARN for CloudFront."
  }
}

variable "api_origin" {
  description = "Optional HTTPS API origin published only once Serverless owns the API domain."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.api_origin == null || can(regex("^https://", var.api_origin))
    error_message = "api_origin must be an HTTPS URL when supplied."
  }
}

variable "cloudfront_price_class" {
  description = "CloudFront price class for production."
  type        = string
  default     = "PriceClass_200"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "noncurrent_asset_retention_days" {
  description = "Days that superseded production web assets remain recoverable."
  type        = number
  default     = 90

  validation {
    condition     = var.noncurrent_asset_retention_days >= 7 && var.noncurrent_asset_retention_days <= 365
    error_message = "noncurrent_asset_retention_days must be between 7 and 365."
  }
}

variable "tags" {
  description = "Additional tags for production resources."
  type        = map(string)
  default     = {}
}

variable "markdown_image_origins" {
  description = "Trusted HTTPS origins for admin-authored Markdown images in production; an empty list publishes the fail-closed https://images.invalid sentinel."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for origin in var.markdown_image_origins : can(regex("^https://[^/]+$", origin))])
    error_message = "markdown_image_origins must contain canonical HTTPS origins without paths."
  }
}

variable "rate_limit_policies" {
  description = "Shared durable API rate-limit policies for production."
  type = map(object({
    maxRequests   = number
    windowSeconds = number
  }))
  default = {
    "admin-import"    = { maxRequests = 10, windowSeconds = 300 }
    "exam-start"      = { maxRequests = 20, windowSeconds = 60 }
    "exam-submit"     = { maxRequests = 120, windowSeconds = 60 }
    "practice-start"  = { maxRequests = 20, windowSeconds = 60 }
    "practice-submit" = { maxRequests = 120, windowSeconds = 60 }
  }

  validation {
    condition = (
      toset(keys(var.rate_limit_policies)) == toset([
        "admin-import",
        "exam-start",
        "exam-submit",
        "practice-start",
        "practice-submit",
        ]) && alltrue([
        for policy in values(var.rate_limit_policies) :
        policy.maxRequests >= 1 && policy.windowSeconds >= 1 && policy.windowSeconds <= 3600
      ])
    )
    error_message = "rate_limit_policies must define every protected scope with positive fixed-window limits."
  }
}

variable "cognito_advanced_security_mode" {
  description = "Cognito Hosted UI login-abuse protection mode for production."
  type        = string
  default     = "ENFORCED"

  validation {
    condition     = contains(["AUDIT", "ENFORCED"], var.cognito_advanced_security_mode)
    error_message = "cognito_advanced_security_mode must be AUDIT or ENFORCED."
  }
}
