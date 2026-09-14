terraform {
  # Do not run production against local state.
  backend "s3" {
    bucket       = "smlim-tf-state-bucket"
    key          = "cert-quiz/prod/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
