terraform {
  backend "s3" {
    bucket       = "smlim-terraform-state-bucket"
    key          = "cert-forge/dev/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
