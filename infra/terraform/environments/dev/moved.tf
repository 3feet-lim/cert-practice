# Preserve all deployed application-runtime addresses while ownership moves into
# this stage root. Data sources are read-only and have no remote object to move.
moved {
  from = module.application_runtime.aws_dynamodb_table.rate_limit
  to   = aws_dynamodb_table.rate_limit
}

moved {
  from = module.application_runtime.aws_cognito_user_pool.this
  to   = aws_cognito_user_pool.this
}

moved {
  from = module.application_runtime.aws_cognito_user_pool_domain.hosted_ui
  to   = aws_cognito_user_pool_domain.hosted_ui
}

moved {
  from = module.application_runtime.aws_cognito_identity_provider.google[0]
  to   = aws_cognito_identity_provider.google[0]
}

moved {
  from = module.application_runtime.aws_cognito_user_pool_client.web
  to   = aws_cognito_user_pool_client.web
}

moved {
  from = module.application_runtime.aws_s3_bucket.web
  to   = aws_s3_bucket.web
}

moved {
  from = module.application_runtime.aws_s3_bucket_public_access_block.web
  to   = aws_s3_bucket_public_access_block.web
}

moved {
  from = module.application_runtime.aws_s3_bucket_ownership_controls.web
  to   = aws_s3_bucket_ownership_controls.web
}

moved {
  from = module.application_runtime.aws_s3_bucket_server_side_encryption_configuration.web
  to   = aws_s3_bucket_server_side_encryption_configuration.web
}

moved {
  from = module.application_runtime.aws_s3_bucket_versioning.web
  to   = aws_s3_bucket_versioning.web
}

moved {
  from = module.application_runtime.aws_s3_bucket_lifecycle_configuration.web
  to   = aws_s3_bucket_lifecycle_configuration.web
}

moved {
  from = module.application_runtime.aws_cloudfront_origin_access_control.web
  to   = aws_cloudfront_origin_access_control.web
}

moved {
  from = module.application_runtime.aws_cloudfront_response_headers_policy.web_security
  to   = aws_cloudfront_response_headers_policy.web_security
}

moved {
  from = module.application_runtime.aws_cloudfront_distribution.web
  to   = aws_cloudfront_distribution.web
}

moved {
  from = module.application_runtime.aws_s3_bucket_policy.web
  to   = aws_s3_bucket_policy.web
}

moved {
  from = module.application_runtime.aws_route53_record.web[0]
  to   = aws_route53_record.web[0]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["cognito-user-pool-id"]
  to   = aws_ssm_parameter.contract["cognito-user-pool-id"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["cognito-client-id"]
  to   = aws_ssm_parameter.contract["cognito-client-id"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["cognito-issuer"]
  to   = aws_ssm_parameter.contract["cognito-issuer"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["cognito-hosted-ui-base-url"]
  to   = aws_ssm_parameter.contract["cognito-hosted-ui-base-url"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["lambda-role-arn"]
  to   = aws_ssm_parameter.contract["lambda-role-arn"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["web-bucket-name"]
  to   = aws_ssm_parameter.contract["web-bucket-name"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["cloudfront-distribution-id"]
  to   = aws_ssm_parameter.contract["cloudfront-distribution-id"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["cloudfront-domain-name"]
  to   = aws_ssm_parameter.contract["cloudfront-domain-name"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["web-origin"]
  to   = aws_ssm_parameter.contract["web-origin"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["markdown-image-origins"]
  to   = aws_ssm_parameter.contract["markdown-image-origins"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["rate-limit-table-name"]
  to   = aws_ssm_parameter.contract["rate-limit-table-name"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["rate-limit-policies"]
  to   = aws_ssm_parameter.contract["rate-limit-policies"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["api-origin"]
  to   = aws_ssm_parameter.contract["api-origin"]
}

moved {
  from = module.application_runtime.aws_ssm_parameter.contract["backup-recovery-policy"]
  to   = aws_ssm_parameter.contract["backup-recovery-policy"]
}
