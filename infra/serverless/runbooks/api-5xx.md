# API 5xx

1. Use the request ID and sanitized error code in CloudWatch Logs to determine whether the failure is dependency-related.
2. Check the DB latency dashboard widget and Lambda error/throttle metrics.
3. If the regression follows a deployment, roll the Lambda alias back; do not change immutable attempts or snapshots.
