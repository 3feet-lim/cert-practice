terraform {
  required_version = ">= 1.14.0, < 2.0.0"

  backend "s3" {
    bucket       = "smlim-tf-state-bucket"
    key          = "cert-quiz/dev/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "6.63.0"
    }
  }
}
