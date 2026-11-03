# worker

pg-boss consumer that executes agent runs. It has no public port.

For each queued run it loads the project and its message history, then drives the agent loop from `@repo/agent-core` (Anthropic native tool use). Every tool call is executed inside the project's sandbox through the sandbox-controller (`CONTROLLER_URL`, authenticated with `INTERNAL_API_TOKEN`). Run events are persisted so `api` can stream them over SSE. The worker never executes model output locally.

Limits: `MAX_CONCURRENT_RUNS`, `AGENT_MAX_STEPS`, `AGENT_MAX_STEP_TOKENS`, `AGENT_MAX_RUN_OUTPUT_TOKENS` and `DAILY_TOKEN_QUOTA`.

An internal health endpoint is served at `GET /health` on port 9091, used by the container healthcheck only.

```bash
pnpm --filter worker dev       # watch mode
pnpm --filter worker test
pnpm --filter worker build     # tsc -> dist/
node dist/index.js             # production entrypoint (Docker target `worker`)
```

Required env: `DATABASE_URL`, `INTERNAL_API_TOKEN`, `CONTROLLER_URL`, `ANTHROPIC_API_KEY`. See the root `.env.example`.
