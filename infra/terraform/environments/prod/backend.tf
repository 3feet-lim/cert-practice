terraform {
  # Do not run production against local state.
  backend "s3" {
    bucket       = "smlim-terraform-state-bucket"
    key          = "cert-forge/prod/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
