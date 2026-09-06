# ADR-0001: Database adapter selection

- **Status:** pending
- **Report SHA-256:** `350ae2eb547469de929272a276a0f61a39d38e6b813596467c4c904829b0db10`

## Local preflight scope

This report ran only deterministic manifest and in-memory model checks. It did not attempt network access, AWS credential access, TLS, IAM token generation, or a database connection.

## Required live evidence

- `connector-lifecycle`: not_run — Requires approved IAM, TLS, and Lambda freeze/thaw target execution.
- `sql-capabilities`: not_run — Requires a target DSQL migration transaction and DDL inspection.
- `migration-replay`: not_run — Requires repeated migration and recovery runs against the target engine.
- `history-query`: not_run — Requires EXPLAIN ANALYZE against representative target data.
- `leaderboard-query`: not_run — Requires window-function query plan and latency evidence on the target engine.
- `retention-cleanup-query`: not_run — Requires bounded delete plan and latency evidence on the target engine.
- `profile-get-or-create`: not_run — Requires concurrent target transactions and rollback observation.
- `active-practice-slot`: not_run — Requires concurrent target transactions and active-slot constraint evidence.
- `practice-replace`: not_run — Requires target transaction rollback after snapshot insertion failure.
- `exam-finalize`: not_run — Requires manual/expiry target concurrency and idempotent attempt evidence.
- `import-head-switch`: not_run — Requires target transaction rollback and staged revision visibility evidence.

## Decision

No target-engine evidence; local preflight cannot select DSQL or PostgreSQL.
