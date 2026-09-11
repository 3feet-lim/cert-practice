output "cluster_identifier" {
  description = "Aurora DSQL cluster identifier."
  value       = aws_dsql_cluster.this.identifier
}

output "cluster_arn" {
  description = "Aurora DSQL cluster ARN."
  value       = aws_dsql_cluster.this.arn
}

output "endpoint" {
  description = "Aurora DSQL PostgreSQL endpoint hostname."
  value       = local.endpoint
}

output "endpoint_parameter_name" {
  description = "SSM parameter containing the DSQL endpoint."
  value       = aws_ssm_parameter.dsql_endpoint.name
}

output "region_parameter_name" {
  description = "SSM parameter containing the AWS region."
  value       = aws_ssm_parameter.region.name
}

output "vpc_endpoint_service_name" {
  description = "Service name used if a PrivateLink interface endpoint is added later."
  value       = aws_dsql_cluster.this.vpc_endpoint_service_name
}

output "endpoint_parameter_arn" {
  description = "ARN of the SSM parameter containing the DSQL endpoint."
  value       = aws_ssm_parameter.dsql_endpoint.arn
}

output "region_parameter_arn" {
  description = "ARN of the SSM parameter containing the AWS region."
  value       = aws_ssm_parameter.region.arn
}
