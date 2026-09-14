variable "aws_region" {
  description = "AWS region for the dev DSQL cluster."
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

variable "force_destroy" {
  description = "Allow an intentional terraform destroy to remove the protected dev cluster."
  type        = bool
  default     = false
}

variable "tags" {
  description = "Additional tags for dev resources."
  type        = map(string)
  default     = {}
}

variable "cognito_hosted_ui_domain_prefix" {
  description = "Unique Cognito Hosted UI domain prefix for dev."
  type        = string
  default     = "certquiz-dev"

  validation {
    condition     = can(regex("^[a-z0-9-]{1,63}$", var.cognito_hosted_ui_domain_prefix))
    error_message = "cognito_hosted_ui_domain_prefix must contain only lowercase letters, digits, and hyphens."
  }
}

variable "enable_google_identity_provider" {
  description = "Enable Google Cognito IdP only after injecting OAuth credentials."
  type        = bool
  default     = false
}

variable "google_oauth_client_id" {
  description = "Google OAuth client ID injected from CI or TF_VAR when the IdP is enabled."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = !var.enable_google_identity_provider || (var.google_oauth_client_id != null && trimspace(var.google_oauth_client_id) != "")
    error_message = "google_oauth_client_id is required when enable_google_identity_provider is true."
  }
}

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret injected from a secret-capable CI runner when the IdP is enabled."
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
  description = "Optional custom DNS name for the dev SPA."
  type        = string
  default     = null
  nullable    = true
}

variable "route53_zone_id" {
  description = "Optional Route 53 zone ID for the dev SPA DNS alias."
  type        = string
  default     = null
  nullable    = true
}

variable "acm_certificate_arn" {
  description = "Optional issued us-east-1 ACM certificate ARN for the dev custom domain."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.acm_certificate_arn == null || can(regex("^arn:[^:]+:acm:us-east-1:[0-9]{12}:certificate/.+$", var.acm_certificate_arn))
    error_message = "acm_certificate_arn must be an issued us-east-1 ACM certificate ARN for CloudFront."
  }
}

variable "api_origin" {
  description = "Optional HTTPS API origin published for browser configuration."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.api_origin == null || can(regex("^https://", var.api_origin))
    error_message = "api_origin must be an HTTPS URL when supplied."
  }
}

variable "cloudfront_price_class" {
  description = "CloudFront price class for dev."
  type        = string
  default     = "PriceClass_100"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "noncurrent_asset_retention_days" {
  description = "Days that superseded web assets remain recoverable in dev."
  type        = number
  default     = 30

  validation {
    condition     = var.noncurrent_asset_retention_days >= 7 && var.noncurrent_asset_retention_days <= 365
    error_message = "noncurrent_asset_retention_days must be between 7 and 365."
  }
}

variable "markdown_image_origins" {
  description = "Trusted HTTPS origins for admin-authored Markdown images in dev."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for origin in var.markdown_image_origins : can(regex("^https://[^/]+$", origin))])
    error_message = "markdown_image_origins must contain canonical HTTPS origins without paths."
  }
}

variable "rate_limit_policies" {
  description = "Shared durable API rate-limit policies for dev."
  type = map(object({
    maxRequests   = number
    windowSeconds = number
  }))
  default = {
    "admin-import"    = { maxRequests = 30, windowSeconds = 300 }
    "exam-start"      = { maxRequests = 60, windowSeconds = 60 }
    "exam-submit"     = { maxRequests = 240, windowSeconds = 60 }
    "practice-start"  = { maxRequests = 60, windowSeconds = 60 }
    "practice-submit" = { maxRequests = 240, windowSeconds = 60 }
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
  description = "Cognito Hosted UI login-abuse protection mode for dev."
  type        = string
  default     = "AUDIT"

  validation {
    condition     = contains(["AUDIT", "ENFORCED"], var.cognito_advanced_security_mode)
    error_message = "cognito_advanced_security_mode must be AUDIT or ENFORCED."
  }
}
