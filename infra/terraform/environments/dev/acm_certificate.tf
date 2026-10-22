data "aws_route53_zone" "web" {
  count        = var.web_domain_name == null ? 0 : 1
  name         = var.web_hosted_zone_name
  private_zone = false
}

resource "aws_acm_certificate" "web" {
  count    = var.web_domain_name == null ? 0 : 1
  provider = aws.us_east_1

  domain_name       = var.web_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "web_cert_validation" {
  for_each = var.web_domain_name == null ? {} : {
    for dvo in aws_acm_certificate.web[0].domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      type   = dvo.resource_record_type
      record = dvo.resource_record_value
    }
  }

  zone_id         = data.aws_route53_zone.web[0].zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "web" {
  count    = var.web_domain_name == null ? 0 : 1
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.web[0].arn
  validation_record_fqdns = [for record in aws_route53_record.web_cert_validation : record.fqdn]
}
