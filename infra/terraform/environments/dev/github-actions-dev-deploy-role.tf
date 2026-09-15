# The existing Serverless stack publishes the deployment bucket name. Reading that
# output prevents this role from gaining access to another account's bucket.
data "aws_cloudformation_stack" "serverless_dev" {
  name = "${var.service_name}-api-dev"
}

locals {
  github_actions_dev_deploy_role_name = "${var.service_name}-dev-github-actions-deploy"
  github_actions_dev_stack_name       = "${var.service_name}-api-dev"
  github_actions_dev_stack_arn        = "arn:${data.aws_partition.current.partition}:cloudformation:${var.aws_region}:${data.aws_caller_identity.current.account_id}:stack/${local.github_actions_dev_stack_name}/*"
  github_actions_dev_change_set_arn   = "arn:${data.aws_partition.current.partition}:cloudformation:${var.aws_region}:${data.aws_caller_identity.current.account_id}:changeSet/*/*"
  github_actions_dev_function_arn     = "arn:${data.aws_partition.current.partition}:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:${var.service_name}-dev-*"
  github_actions_dev_log_group_arn    = "arn:${data.aws_partition.current.partition}:logs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:log-group:/aws/lambda/${var.service_name}-dev-*"
  github_actions_dev_event_rule_arn   = "arn:${data.aws_partition.current.partition}:events:${var.aws_region}:${data.aws_caller_identity.current.account_id}:rule/${var.service_name}-dev-*"
  github_actions_dev_bucket_name      = data.aws_cloudformation_stack.serverless_dev.outputs["ServerlessDeploymentBucketName"]
  github_actions_dev_bucket_arn       = "arn:${data.aws_partition.current.partition}:s3:::${local.github_actions_dev_bucket_name}"
}

resource "aws_iam_openid_connect_provider" "github_actions" {
  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = merge(var.tags, {
    Name = "github-actions"
  })
}

data "aws_iam_policy_document" "github_actions_dev_deploy_assume_role" {
  statement {
    sid     = "GitHubActionsRepositoryWide"
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github_actions.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:3feet-lim@139703302/cert-practice@1354159331:*"]
    }
  }
}

resource "aws_iam_role" "github_actions_dev_deploy" {
  name               = local.github_actions_dev_deploy_role_name
  description        = "GitHub Actions OIDC deployment role for the ${local.github_actions_dev_stack_name} stack"
  assume_role_policy = data.aws_iam_policy_document.github_actions_dev_deploy_assume_role.json

  tags = merge(var.tags, {
    Name  = local.github_actions_dev_deploy_role_name
    Stage = "dev"
  })
}

data "aws_iam_policy_document" "github_actions_dev_deploy" {
  statement {
    sid = "DeployDevServerlessStack"
    actions = [
      "cloudformation:CreateChangeSet",
      "cloudformation:CreateStack",
      "cloudformation:DeleteChangeSet",
      "cloudformation:DescribeChangeSet",
      "cloudformation:DescribeStackEvents",
      "cloudformation:DescribeStackResource",
      "cloudformation:DescribeStackResources",
      "cloudformation:DescribeStacks",
      "cloudformation:ExecuteChangeSet",
      "cloudformation:GetTemplate",
      "cloudformation:ListStackResources",
      "cloudformation:UpdateStack",
    ]
    resources = [
      local.github_actions_dev_stack_arn,
      local.github_actions_dev_change_set_arn,
    ]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.aws_region]
    }
  }

  # ValidateTemplate has no resource-level IAM model. Its requested region is
  # nevertheless fixed to the dev deployment region.
  statement {
    sid       = "ValidateDevServerlessTemplate"
    actions   = ["cloudformation:ValidateTemplate"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.aws_region]
    }
  }

  statement {
    sid = "UploadDevServerlessArtifacts"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:GetBucketLocation",
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
      "s3:PutObject",
    ]
    resources = [
      local.github_actions_dev_bucket_arn,
      "${local.github_actions_dev_bucket_arn}/serverless/${var.service_name}-api/dev/*",
    ]
  }

  statement {
    sid = "ManageDevLambdaFunctions"
    actions = [
      "lambda:AddPermission",
      "lambda:CreateAlias",
      "lambda:CreateFunction",
      "lambda:DeleteAlias",
      "lambda:DeleteFunction",
      "lambda:GetAlias",
      "lambda:GetFunction",
      "lambda:GetFunctionConfiguration",
      "lambda:GetPolicy",
      "lambda:ListAliases",
      "lambda:ListVersionsByFunction",
      "lambda:PublishVersion",
      "lambda:RemovePermission",
      "lambda:TagResource",
      "lambda:UntagResource",
      "lambda:UpdateAlias",
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
    ]
    resources = [local.github_actions_dev_function_arn]
  }

  statement {
    sid = "ManageDevLambdaLogGroups"
    actions = [
      "logs:CreateLogGroup",
      "logs:DeleteLogGroup",
      "logs:DescribeLogGroups",
      "logs:PutRetentionPolicy",
    ]
    resources = [local.github_actions_dev_log_group_arn]
  }

  # API Gateway v2 ARNs do not include an account ID. Scope its management API
  # to the configured deployment region; the surrounding CloudFormation stack
  # ARN remains account-specific.
  statement {
    sid = "ManageDevHttpApi"
    actions = [
      "apigateway:DELETE",
      "apigateway:GET",
      "apigateway:PATCH",
      "apigateway:POST",
    ]
    resources = ["arn:${data.aws_partition.current.partition}:apigateway:${var.aws_region}::/apis/*"]
  }

  statement {
    sid = "ManageDevRetentionSchedule"
    actions = [
      "events:DeleteRule",
      "events:DescribeRule",
      "events:PutRule",
      "events:PutTargets",
      "events:RemoveTargets",
      "events:TagResource",
      "events:UntagResource",
    ]
    resources = [local.github_actions_dev_event_rule_arn]
  }

  # CloudWatch alarm and dashboard APIs do not support resource-level IAM
  # scoping; constrain them to the Terraform-known deployment region.
  statement {
    sid = "ManageDevObservability"
    actions = [
      "cloudwatch:DeleteAlarms",
      "cloudwatch:DeleteDashboards",
      "cloudwatch:DescribeAlarms",
      "cloudwatch:GetDashboard",
      "cloudwatch:PutDashboard",
      "cloudwatch:PutMetricAlarm",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.aws_region]
    }
  }

  statement {
    sid       = "PassOnlyDevLambdaExecutionRole"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.api_lambda_execution.arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["lambda.amazonaws.com"]
    }
  }

  statement {
    sid = "ReadDevDeploymentInputs"
    actions = [
      "ssm:GetParameter",
    ]
    resources = [
      "arn:${data.aws_partition.current.partition}:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/${var.service_name}/dev/*",
    ]
  }

  statement {
    sid       = "IdentifyDeploymentAccount"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_actions_dev_deploy" {
  name   = "${local.github_actions_dev_deploy_role_name}-policy"
  role   = aws_iam_role.github_actions_dev_deploy.id
  policy = data.aws_iam_policy_document.github_actions_dev_deploy.json
}
