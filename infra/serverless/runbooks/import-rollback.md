# Import rollback

1. Verify the active catalog head is unchanged and the import validation token was not consumed.
2. Inspect only redacted operational metadata; do not copy import payloads to logs.
3. Correct the source data and run a new dry-run before retrying commit.
