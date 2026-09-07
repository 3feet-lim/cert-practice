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
