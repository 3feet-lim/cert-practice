provider "aws" {
  region = var.aws_region

  default_tags {
    tags = merge(var.tags, {
      Environment = "prod"
      ManagedBy   = "Terraform"
      Project     = var.service_name
    })
  }
}

module "dsql" {
  source = "../../modules/dsql"

  service_name                = var.service_name
  environment                 = "prod"
  aws_region                  = var.aws_region
  deletion_protection_enabled = true
  force_destroy               = false
  kms_encryption_key          = var.kms_encryption_key
  tags                        = var.tags
}
