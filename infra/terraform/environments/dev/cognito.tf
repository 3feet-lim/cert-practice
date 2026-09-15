locals {
  cognito_hosted_ui_base_url = "https://${aws_cognito_user_pool_domain.hosted_ui.domain}.auth.${var.aws_region}.amazoncognito.com"
  google_provider_name       = "Google"
}

resource "aws_cognito_user_pool" "this" {
  name                     = "${var.service_name}-${local.runtime_environment}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  user_pool_add_ons {
    # Cognito owns Hosted UI login; enhanced protection is the login abuse policy.
    advanced_security_mode = var.cognito_advanced_security_mode
  }

  password_policy {
    minimum_length    = 32
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
    require_uppercase = true
  }

  schema {
    attribute_data_type = "String"
    name                = "email"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 320
    }
  }

  schema {
    attribute_data_type = "String"
    name                = "name"
    required            = false
    mutable             = true

    string_attribute_constraints {
      min_length = 1
      max_length = 256
    }
  }

  tags = merge(var.tags, {
    Name = "${var.service_name}-${local.runtime_environment}-users"
  })
}

resource "aws_cognito_user_pool_domain" "hosted_ui" {
  domain       = var.cognito_hosted_ui_domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_identity_provider" "google" {
  count = var.enable_google_identity_provider ? 1 : 0

  user_pool_id  = aws_cognito_user_pool.this.id
  provider_name = local.google_provider_name
  provider_type = "Google"

  provider_details = {
    authorize_scopes              = "openid email profile"
    authorize_url                 = "https://accounts.google.com/o/oauth2/v2/auth"
    token_url                     = "https://www.googleapis.com/oauth2/v4/token"
    token_request_method          = "POST"
    oidc_issuer                   = "https://accounts.google.com"
    attributes_url                = "https://people.googleapis.com/v1/people/me?personFields="
    attributes_url_add_attributes = "true"
    client_id                     = var.google_oauth_client_id
    client_secret                 = var.google_oauth_client_secret
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "sub"
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name                                 = "${var.service_name}-${local.runtime_environment}-web"
  user_pool_id                         = aws_cognito_user_pool.this.id
  generate_secret                      = false
  prevent_user_existence_errors        = "ENABLED"
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = concat(["COGNITO"], var.enable_google_identity_provider ? [local.google_provider_name] : [])
  callback_urls                        = ["${local.web_origin}/auth/callback"]
  logout_urls                          = ["${local.web_origin}/login"]

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH"]

  depends_on = [aws_cognito_identity_provider.google]
}
