variable "aws_region" {
  description = "AWS region for production resources."
  type        = string
  default     = "ap-northeast-2"
}

variable "service_name" {
  description = "Service name used for tags and SSM paths."
  type        = string
  default     = "certquiz"
}

variable "kms_encryption_key" {
  description = "DSQL KMS key ARN or AWS_OWNED_KMS_KEY."
  type        = string
  default     = "AWS_OWNED_KMS_KEY"
}

variable "cognito_hosted_ui_domain_prefix" {
  description = "Globally unique production Cognito Hosted UI domain prefix."
  type        = string
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
}

variable "google_oauth_client_secret" {
  description = "Google OAuth client secret injected by a secret-capable deployment environment."
  type        = string
  default     = null
  nullable    = true
  sensitive   = true
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
}

variable "api_origin" {
  description = "Optional HTTPS API origin published only once Serverless owns the API domain."
  type        = string
  default     = null
  nullable    = true
}

variable "cloudfront_price_class" {
  description = "CloudFront price class for production."
  type        = string
  default     = "PriceClass_200"
}

variable "noncurrent_asset_retention_days" {
  description = "Days that superseded production web assets remain recoverable."
  type        = number
  default     = 90
}

variable "tags" {
  description = "Additional tags for production resources."
  type        = map(string)
  default     = {}
}

variable "markdown_image_origins" {
  description = "Trusted HTTPS origins for admin-authored Markdown images in production."
  type        = list(string)
  default     = []
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
}

variable "cognito_advanced_security_mode" {
  description = "Cognito Hosted UI login-abuse protection mode for production."
  type        = string
  default     = "ENFORCED"
}
