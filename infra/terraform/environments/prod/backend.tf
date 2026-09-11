terraform {
  # The bucket is deliberately supplied with -backend-config or backend.hcl.
  # Do not run production against local state.
  backend "s3" {
    key          = "certquiz/prod/terraform.tfstate"
    region       = "ap-northeast-2"
    encrypt      = true
    use_lockfile = true
  }
}
