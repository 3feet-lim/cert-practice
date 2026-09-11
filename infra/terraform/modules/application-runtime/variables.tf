variable "service_name" {
  description = "Lowercase service name used in resource names, tags, and SSM paths."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,30}$", var.service_name))
    error_message = "service_name must be 2-31 lowercase letters, digits, or hyphens and start with a letter."
  }
}

variable "environment" {
  description = "Deployment environment."
  type        = string

  validation {
    condition     = contains(["dev", "prod"], var.environment)
    error_message = "environment must be dev or prod."
  }
}

variable "aws_region" {
  description = "AWS region for Cognito, S3, CloudFront support resources, and SSM parameters."
  type        = string
}

variable "dsql_endpoint" {
  description = "Aurora DSQL endpoint published to the application contract."
  type        = string
}

variable "dsql_endpoint_parameter_name" {
  description = "Existing SSM parameter name containing the Aurora DSQL endpoint."
  type        = string
}

variable "region_parameter_name" {
  description = "Existing SSM parameter name containing the AWS region."
  type        = string
}

variable "lambda_role_arn" {
  description = "Terraform-owned Lambda execution role ARN published to Serverless through SSM."
  type        = string
}

variable "cognito_hosted_ui_domain_prefix" {
  description = "Unique Cognito Hosted UI domain prefix for this environment."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9-]{1,63}$", var.cognito_hosted_ui_domain_prefix))
    error_message = "cognito_hosted_ui_domain_prefix must contain only lowercase letters, digits, and hyphens."
  }
}

variable "enable_google_identity_provider" {
  description = "Create the Google Cognito identity provider. Set true only with Google OAuth credentials supplied out of band."
  type        = bool
  default     = false
}

variable "google_oauth_client_id" {
  description = "Google OAuth client ID. Do not commit a production value."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = !var.enable_google_identity_provider || (var.google_oauth_client_id != null && trimspace(var.google_oauth_client_id) != "")
    error_message = "google_oauth_client_id is required when enable_google_identity_provider is true."
  }
}

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret injected by a secret-capable CI runner or TF_VAR. Never commit this value."
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
  description = "Optional production DNS name for the SPA, for example quiz.example.com. Null keeps the CloudFront distribution domain."
  type        = string
  default     = null
  nullable    = true
}

variable "route53_zone_id" {
  description = "Optional Route 53 hosted zone ID. Required with web_domain_name to manage the DNS alias record."
  type        = string
  default     = null
  nullable    = true
}

variable "acm_certificate_arn" {
  description = "Optional issued ACM certificate ARN in us-east-1 for the CloudFront custom domain."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.acm_certificate_arn == null || can(regex("^arn:[^:]+:acm:us-east-1:[0-9]{12}:certificate/.+$", var.acm_certificate_arn))
    error_message = "acm_certificate_arn must be an issued us-east-1 ACM certificate ARN for CloudFront."
  }
}

variable "api_origin" {
  description = "Optional HTTPS API origin used by the browser. This is published only after Serverless owns the API domain."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.api_origin == null || can(regex("^https://", var.api_origin))
    error_message = "api_origin must be an HTTPS URL when supplied."
  }
}

variable "cloudfront_price_class" {
  description = "CloudFront price class appropriate for the environment."
  type        = string
  default     = "PriceClass_200"

  validation {
    condition     = contains(["PriceClass_100", "PriceClass_200", "PriceClass_All"], var.cloudfront_price_class)
    error_message = "cloudfront_price_class must be PriceClass_100, PriceClass_200, or PriceClass_All."
  }
}

variable "noncurrent_asset_retention_days" {
  description = "Days to retain superseded web assets for rollback and recovery."
  type        = number
  default     = 30

  validation {
    condition     = var.noncurrent_asset_retention_days >= 7 && var.noncurrent_asset_retention_days <= 365
    error_message = "noncurrent_asset_retention_days must be between 7 and 365."
  }
}

variable "tags" {
  description = "Additional tags applied to infrastructure resources."
  type        = map(string)
  default     = {}
}

variable "markdown_image_origins" {
  description = "Explicit HTTPS origins permitted for Markdown images; the SPA origin is not implied."
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for origin in var.markdown_image_origins : can(regex("^https://[^/]+$", origin))])
    error_message = "markdown_image_origins must contain canonical HTTPS origins without paths."
  }
}

variable "rate_limit_policies" {
  description = "Stage-specific shared durable limiter policies for protected start, submit, and admin-import routes."
  type = map(object({
    maxRequests   = number
    windowSeconds = number
  }))

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
  description = "Cognito Hosted UI login-abuse protection mode."
  type        = string
  default     = "AUDIT"

  validation {
    condition     = contains(["AUDIT", "ENFORCED"], var.cognito_advanced_security_mode)
    error_message = "cognito_advanced_security_mode must be AUDIT or ENFORCED."
  }
}
