variable "service_name" {
  description = "Lowercase service name used in tags and SSM parameter paths."
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
  description = "AWS region in which the DSQL cluster and SSM parameters are managed."
  type        = string

  validation {
    condition     = can(regex("^[a-z]{2}(-[a-z]+)+-[0-9]+$", var.aws_region))
    error_message = "aws_region must be a valid AWS region name."
  }
}

variable "deletion_protection_enabled" {
  description = "Protect the DSQL cluster from direct deletion."
  type        = bool
  default     = true
}

variable "force_destroy" {
  description = "Allow Terraform destroy to disable deletion protection and remove the cluster."
  type        = bool
  default     = false
}

variable "kms_encryption_key" {
  description = "DSQL encryption key ARN or AWS_OWNED_KMS_KEY."
  type        = string
  default     = "AWS_OWNED_KMS_KEY"

  validation {
    condition = (
      var.kms_encryption_key == "AWS_OWNED_KMS_KEY" ||
      can(regex("^arn:[^:]+:kms:[^:]+:[0-9]{12}:key/.+$", var.kms_encryption_key))
    )
    error_message = "kms_encryption_key must be AWS_OWNED_KMS_KEY or a KMS key ARN."
  }
}

variable "tags" {
  description = "Additional tags applied to the DSQL and SSM resources."
  type        = map(string)
  default     = {}
}
