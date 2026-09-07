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
