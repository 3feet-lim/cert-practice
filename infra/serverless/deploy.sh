#!/usr/bin/env bash
set -euo pipefail

REGION=${REGION:-ap-northeast-2}
STAGE=${STAGE:-dev}

ACCESS_KEY_PARAM=${ACCESS_KEY_PARAM:-/certforge/${STAGE}/serverless-framework-access-key}
LAMBDA_ROLE_ARN_PARAM=${LAMBDA_ROLE_ARN_PARAM:-/certforge/${STAGE}/lambda-role-arn}
DATABASE_ENDPOINT_PARAM=${DATABASE_ENDPOINT_PARAM:-/certforge/${STAGE}/dsql-endpoint}

export SERVERLESS_ACCESS_KEY=$(aws ssm get-parameter \
  --name ${ACCESS_KEY_PARAM} --with-decryption \
  --region ${REGION} --query 'Parameter.Value' --output text)

LAMBDA_ROLE_ARN=$(aws ssm get-parameter \
  --name ${LAMBDA_ROLE_ARN_PARAM} \
  --region ${REGION} --query 'Parameter.Value' --output text)

DATABASE_ENDPOINT=$(aws ssm get-parameter \
  --name ${DATABASE_ENDPOINT_PARAM} \
  --region ${REGION} --query 'Parameter.Value' --output text)

node ./run-serverless.mjs deploy --stage ${STAGE} --region ${REGION} \
  --param=lambdaRoleArn=${LAMBDA_ROLE_ARN} \
  --param=databaseEndpoint=${DATABASE_ENDPOINT}
