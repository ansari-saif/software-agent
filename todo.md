# Backlog

- **gVisor sandbox runtime.** Run sandboxes with `runsc` instead of `runc` so user code no longer shares the host kernel (ADR 0002).
- **Prompt eval harness.** Use a fixed set of build tasks scored automatically (does it build, do the tests pass, how many steps and tokens) and run it in CI against prompt and model changes.
- **Playwright E2E on staging.** Cover sign-in, create project, stream a run, open the sandbox IDE and preview, and export, against a staging deploy before production.
- **Clerk webhook user sync.** Mirror user create, update and delete into Postgres (verified with Svix signatures), and cascade-delete projects and workspaces when a user is deleted.
- **Billing.** Plans, Stripe checkout and webhooks, with per-plan `DAILY_TOKEN_QUOTA` and sandbox limits enforced from the DB.
