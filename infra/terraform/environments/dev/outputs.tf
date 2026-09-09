output "dsql_cluster_identifier" {
  description = "Dev Aurora DSQL cluster identifier."
  value       = module.dsql.cluster_identifier
}

output "dsql_cluster_arn" {
  description = "Dev Aurora DSQL cluster ARN."
  value       = module.dsql.cluster_arn
}

output "dsql_endpoint" {
  description = "Dev Aurora DSQL PostgreSQL endpoint hostname."
  value       = module.dsql.endpoint
}

output "dsql_endpoint_parameter_name" {
  description = "SSM parameter read by the dev application deployment."
  value       = module.dsql.endpoint_parameter_name
}

output "dsql_vpc_endpoint_service_name" {
  description = "Service name for a future DSQL PrivateLink endpoint."
  value       = module.dsql.vpc_endpoint_service_name
}

output "api_lambda_execution_role_arn" {
  description = "Dev API Lambda execution role ARN."
  value       = aws_iam_role.api_lambda_execution.arn
}

output "api_lambda_execution_role_name" {
  description = "Dev API Lambda execution role name."
  value       = aws_iam_role.api_lambda_execution.name
}
