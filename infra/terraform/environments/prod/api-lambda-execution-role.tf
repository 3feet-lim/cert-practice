data "aws_partition" "current" {}

data "aws_caller_identity" "current" {}

locals {
  api_lambda_function_name = "${var.service_name}-prod-api"
  api_lambda_role_name     = "${var.service_name}-prod-api-lambda-execution"
  api_lambda_log_group_arn = "arn:${data.aws_partition.current.partition}:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${local.api_lambda_function_name}:*"
}

data "aws_iam_policy_document" "api_lambda_assume_role" {
  statement {
    sid     = "LambdaAssumeRole"
    effect  = "Allow"
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.${data.aws_partition.current.dns_suffix}"]
    }
  }
}

resource "aws_iam_role" "api_lambda_execution" {
  name               = local.api_lambda_role_name
  description        = "Execution role for ${local.api_lambda_function_name}"
  assume_role_policy = data.aws_iam_policy_document.api_lambda_assume_role.json

  tags = merge(var.tags, {
    Name     = local.api_lambda_role_name
    Function = local.api_lambda_function_name
  })
}

data "aws_iam_policy_document" "api_lambda_runtime" {
  statement {
    sid       = "ConnectToDsql"
    effect    = "Allow"
    actions   = ["dsql:DbConnect"]
    resources = [module.dsql.cluster_arn]
  }

  statement {
    sid     = "ReadRuntimeContract"
    effect  = "Allow"
    actions = ["ssm:GetParameter"]
    resources = concat(
      [
        module.dsql.endpoint_parameter_arn,
        module.dsql.region_parameter_arn,
      ],
      values(module.application_runtime.ssm_parameter_arns),
    )
  }

  statement {
    sid       = "ConsumeSharedRateLimit"
    effect    = "Allow"
    actions   = ["dynamodb:TransactWriteItems"]
    resources = [module.application_runtime.rate_limit_table_arn]
  }

  statement {
    sid    = "WriteFunctionLogs"
    effect = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = [local.api_lambda_log_group_arn]
  }
}

resource "aws_iam_role_policy" "api_lambda_runtime" {
  name   = "${local.api_lambda_role_name}-runtime"
  role   = aws_iam_role.api_lambda_execution.id
  policy = data.aws_iam_policy_document.api_lambda_runtime.json
}
