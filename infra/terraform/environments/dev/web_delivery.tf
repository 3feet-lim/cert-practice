locals {
  cloudfront_aliases        = var.web_domain_name == null ? [] : [var.web_domain_name]
  web_origin                = var.web_domain_name == null ? "https://${aws_cloudfront_distribution.web.domain_name}" : "https://${var.web_domain_name}"
  certificate_configuration = var.web_domain_name == null ? null : var.acm_certificate_arn
}

resource "aws_s3_bucket" "web" {
  bucket_prefix = "${var.service_name}-${local.runtime_environment}-web-"

  tags = merge(var.tags, {
    Name = "${var.service_name}-${local.runtime_environment}-web"
  })
}

resource "aws_s3_bucket_public_access_block" "web" {
  bucket                  = aws_s3_bucket.web.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_versioning" "web" {
  bucket = aws_s3_bucket.web.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "web" {
  bucket = aws_s3_bucket.web.id

  rule {
    id     = "retain-noncurrent-web-assets"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = var.noncurrent_asset_retention_days
    }
  }
}

resource "aws_cloudfront_origin_access_control" "web" {
  name                              = "${var.service_name}-${local.runtime_environment}-web"
  description                       = "CloudFront access control for the private ${var.service_name} ${local.runtime_environment} web bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_response_headers_policy" "web_security" {
  name = "${var.service_name}-${local.runtime_environment}-web-security"

  security_headers_config {
    content_security_policy {
      content_security_policy = "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; object-src 'none'; img-src 'self' https:; script-src 'self'; style-src 'self'; connect-src 'self' https:"
      override                = true
    }

    content_type_options {
      override = true
    }

    frame_options {
      frame_option = "DENY"
      override     = true
    }

    referrer_policy {
      referrer_policy = "no-referrer"
      override        = true
    }

    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = true
      override                   = true
    }
  }
}

resource "aws_cloudfront_distribution" "web" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "${var.service_name} ${local.runtime_environment} SPA"
  default_root_object = "index.html"
  price_class         = var.cloudfront_price_class
  aliases             = local.cloudfront_aliases

  origin {
    domain_name              = aws_s3_bucket.web.bucket_regional_domain_name
    origin_id                = "web-assets"
    origin_access_control_id = aws_cloudfront_origin_access_control.web.id
  }

  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD"]
    target_origin_id           = "web-assets"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    response_headers_policy_id = aws_cloudfront_response_headers_policy.web_security.id

    forwarded_values {
      query_string = false

      cookies {
        forward = "none"
      }
    }
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 0
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn            = local.certificate_configuration
    cloudfront_default_certificate = var.web_domain_name == null
    minimum_protocol_version       = var.web_domain_name == null ? "TLSv1" : "TLSv1.2_2021"
    ssl_support_method             = var.web_domain_name == null ? null : "sni-only"
  }

  tags = merge(var.tags, {
    Name = "${var.service_name}-${local.runtime_environment}-web"
  })

  lifecycle {
    precondition {
      condition     = var.web_domain_name == null || var.acm_certificate_arn != null
      error_message = "web_domain_name requires an issued us-east-1 ACM certificate ARN."
    }

    precondition {
      condition     = var.route53_zone_id == null || var.web_domain_name != null
      error_message = "route53_zone_id requires web_domain_name."
    }
  }
}

data "aws_iam_policy_document" "web_bucket" {
  statement {
    sid    = "AllowCloudFrontReadOnly"
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.web.arn}/*"]

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.web.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "web" {
  bucket = aws_s3_bucket.web.id
  policy = data.aws_iam_policy_document.web_bucket.json

  depends_on = [aws_s3_bucket_public_access_block.web]
}

resource "aws_route53_record" "web" {
  count = var.web_domain_name != null && var.route53_zone_id != null ? 1 : 0

  zone_id = var.route53_zone_id
  name    = var.web_domain_name
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.web.domain_name
    zone_id                = aws_cloudfront_distribution.web.hosted_zone_id
    evaluate_target_health = false
  }
}
