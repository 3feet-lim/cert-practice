# The table is an application-security primitive, not a cache. Every Lambda
# concurrency instance consumes the same actor/IP fixed-window buckets.
resource "aws_dynamodb_table" "rate_limit" {
  name         = "${var.service_name}-${local.runtime_environment}-rate-limit"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "bucketKey"

  attribute {
    name = "bucketKey"
    type = "S"
  }

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  server_side_encryption {
    enabled = true
  }

  point_in_time_recovery {
    enabled = local.runtime_environment == "prod"
  }

  tags = merge(var.tags, {
    Name    = "${var.service_name}-${local.runtime_environment}-rate-limit"
    Purpose = "shared-durable-rate-limit"
  })
}
