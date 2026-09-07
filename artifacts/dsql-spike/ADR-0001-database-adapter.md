# ADR-0001: Database adapter selection

- **Status:** accepted
- **Decision:** dsql
- **Region:** ap-northeast-2
- **Report SHA-256:** `d5dff7d56c5e1adeaf9e12a8017f866aab2e86ea2f74a269667023bba0eb8107`

## Context

The Task 9 spike ran against the live dev Aurora DSQL endpoint using the official AWS node-postgres connector, IAM authentication, TLS certificate and hostname validation, versioned candidate DDL, representative query plans, latency samples, and barrier/fault-injection atomicity probes.

The connector gate combines the local pool lifecycle probe with deployed Lambda evidence: a warm execution environment reused the same backend connection, remained active beyond the 15-minute token window, then successfully opened a fresh IAM-authenticated TLS connection after forced eviction. The temporary Lambda, IAM role, and log group were deleted after evidence capture.

## Gates

| Gate | Result |
|---|---|
| migrationRepeatability | pass |
| connectorLifecycle | pass |
| sqlCapabilities | pass |
| queryPlans | pass |
| p95Latency | pass |
| atomicity | pass |
| overall | pass |

## Query evidence

| Query | Expected index | Index used | Contract verified | Workload | p95 ms | Limit ms |
|---|---|---:|---:|---|---:|---:|
| history-query | spike_attempt_history_cursor | true | true | 12000 attempts / 1200 retention rows | 58.26 | 500 |
| leaderboard-query | spike_attempt_leaderboard_candidates | true | true | 12000 attempts / 1200 retention rows | 206.29 | 500 |
| retention-cleanup-query | spike_practice_result_expiry | true | true | 12000 attempts / 1200 retention rows | 29 | 500 |

## Cost estimate

Aurora DSQL is usage-based and scales database activity to zero when idle. The current AWS free tier includes the first 100,000 DPUs and 1 GB of storage per month; this disposable dev spike is expected to remain within that allowance unless the account has already consumed it. Aurora Serverless v2 retains provisioned ACU capacity and is therefore the fallback only when a required compatibility gate fails. Verify current Seoul Region rates before production provisioning.

## Decision

Every required live DSQL compatibility gate passed.

Application deployments must set `CERT_QUIZ_DATABASE_ADAPTER=dsql` explicitly. Dev and prod use separate clusters, migrations, IAM database-role mappings, and SSM endpoint parameters.
