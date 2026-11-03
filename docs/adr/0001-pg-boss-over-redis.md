# ADR 0001: Use pg-boss on Postgres for the run queue instead of Redis

- Status: Accepted
- Date: 2026-11-03

## Context

Agent runs take minutes, call a paid model API, and must survive process restarts. The old system ran generation inside HTTP request handlers (backend and worker Express routes), with no queue, retries, cancellation or concurrency limit. That caused unbounded spend and lost work on restart, and it was one of the causes of unauthenticated, uncapped generation (SEC-04, SEC-08).

We need durable jobs, retries with backoff, a concurrency limit per worker, cancellation, and ideally "create the run row and enqueue it" as one atomic step.

The deployment is a single VPS that already runs Postgres. There is no Redis.

## Decision

Use [pg-boss](https://github.com/timgit/pg-boss), backed by the existing Postgres database:

- `api` inserts the `Run` row and the pg-boss job **in the same transaction**, so a run is never queued without a row and a row never exists without a job.
- `worker` is the only consumer. `MAX_CONCURRENT_RUNS` caps the number of runs per worker. `DAILY_TOKEN_QUOTA` is checked before each model step.
- Run events are written to Postgres and fanned out to SSE clients by `api`, with `Last-Event-ID` replay from the table.

## Consequences

- No extra stateful service to run, secure, back up or monitor. The nightly `pg_dump` covers queue state too.
- Exactly one place to look when a run is stuck: the pg-boss tables plus `Run.status`.
- Throughput is bounded by Postgres. At the expected scale (a handful of concurrent runs, each lasting minutes) this is negligible. If we ever need thousands of jobs per second we can revisit, and only the enqueue/consume adapters would change.
- pg-boss creates its own schema (`pgboss`). Migrations of that schema are managed by pg-boss at startup, not by Prisma.
