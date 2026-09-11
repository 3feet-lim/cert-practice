variable "aws_region" {
  description = "AWS region for the dev DSQL cluster."
  type        = string
  default     = "ap-northeast-2"
}

variable "service_name" {
  description = "Service name used for tags and SSM paths."
  type        = string
  default     = "certquiz"
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
}

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret injected from a secret-capable CI runner when the IdP is enabled."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true
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
}

variable "api_origin" {
  description = "Optional HTTPS API origin published for browser configuration."
  type        = string
  default     = null
  nullable    = true
}

variable "cloudfront_price_class" {
  description = "CloudFront price class for dev."
  type        = string
  default     = "PriceClass_100"
}

variable "noncurrent_asset_retention_days" {
  description = "Days that superseded web assets remain recoverable in dev."
  type        = number
  default     = 30
}

variable "markdown_image_origins" {
  description = "Trusted HTTPS origins for admin-authored Markdown images in dev."
  type        = list(string)
  default     = []
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
}

variable "cognito_advanced_security_mode" {
  description = "Cognito Hosted UI login-abuse protection mode for dev."
  type        = string
  default     = "AUDIT"
}
