# Handoff: access gate

Date: 2026-11-17. Repo: `/Users/saif/my-project/software-agent`. You own the application code. Do not open Clerk, Google, or Netlify. Do not edit `docs/handoff-clerk.md`, `docs/handoff-google.md`, `docs/handoff-dns.md`, or `docs/clerk-production.md`.

Pattern to copy: `/Users/saif/my-project/personal-productivity/docs/auth-handoff.md`. That product is Rafiq. This product is Software Agent. Do not copy Rafiq's domain, Clerk app, or phone token.

## Who gets in

Google sign-in stays with Clerk. One email is superadmin, in code, compared case-insensitively:

`saifhussainansari6@gmail.com`

Everyone else is locked out of projects, runs, sandboxes, and files until the superadmin enables their email. A signed-in person who is not enabled can request access. The superadmin can also enable any email directly, including someone who never requested. Enabled people use the product. Remove deletes the enabled row. Dismiss deletes a pending row. The superadmin email is not an access row and cannot be removed.

## Roles

`superadmin`, `member`, `pending`, `none`.

- The superadmin email is `superadmin` even when no row exists.
- A row with status `PENDING` is `pending`.
- A row with status `ENABLED` is `member`.
- No row and not the superadmin is `none`.

Store emails lowercased. Request must not downgrade an enabled row (`ON CONFLICT DO NOTHING`). Enable upserts `ENABLED`.

## API

Auth today is `createUserAuthMiddleware` in `packages/auth` plus `requireProjectOwner` in `apps/api/src/app.ts`. Keep both. Add the access check after the JWT check and before project routes.

Clerk session tokens often omit email. Resolve it in this order, and do not log the Clerk request or response:

1. `email` claim on the verified JWT.
2. A 5-minute in-memory cache keyed by the Clerk user id.
3. `GET https://api.clerk.com/v1/users/{userId}` with `Authorization: Bearer ${CLERK_SECRET_KEY}`, then the primary email address.

If the email still cannot be resolved, return 401. `CLERK_SECRET_KEY` is already on the api service in `docker-compose.yml`.

| Method | Path | Who | Result |
| --- | --- | --- | --- |
| GET | `/v1/me` | any verified Clerk user | `{ email, role }` |
| POST | `/v1/access/request` | any verified Clerk user | `{ ok: true }` |
| GET | `/v1/access` | superadmin | `{ requests, enabled }` |
| POST | `/v1/access` | superadmin | body `{ email }` enables that person |
| DELETE | `/v1/access` | superadmin | body `{ email }` removes an enabled row |
| DELETE | `/v1/access/request` | superadmin | body `{ email }` dismisses a pending row |

Every other `/v1` route:

- `superadmin` and `member`: allowed, then the existing owner check.
- `member` on `/v1/access` write or list: 403 `FORBIDDEN`.
- `pending` or `none`: 403 `FORBIDDEN` with message that access has not been granted.
- `/health` and `/ready` stay public. `scripts/smoke-test.sh` still expects 401 with no bearer.

Put request and response schemas in `packages/contracts` first. Add a Prisma model and a new migration under `packages/db/prisma/migrations/`. Do not edit `20261103000000_init`. Follow the existing migration SQL style. If `pnpm --filter db migrate` cannot reach a database, write the migration SQL by hand and say so in the status below.

Inject the access store through `ApiDeps` so `apps/api/src/security.test.ts` does not need Postgres. Default to Prisma. Update `apps/api/src/integration.test.ts` so Alice and Mallory are enabled members (their JWTs must carry email). A stranger with a valid JWT and no row gets 403, not a project. `createTestKeys().sign` must be able to set `email`.

Upsert the `User` row only for `superadmin` and `member`. Do not cache the role. The existing `knownUsers` set may still skip a repeated user upsert. It must not skip the access check.

## Web

`apps/web` is Next.js with Clerk. Keep the current dark layout, Space Grotesk, and the home hero.

- Add `/sso-callback` for Clerk's Google redirect. Leave it public in `apps/web/middleware.ts`.
- Signed out, the home primary action starts Google (`oauth_google`, callback `/sso-callback`, `oidcPrompt: 'select_account'`).
- Signed in, call `GET /v1/me` through `useApi`.
- `member` and `superadmin` keep the composer and project routes.
- `none` sees Request access in place of the composer.
- `pending` sees "Waiting for Saif".
- Superadmin gets an Access view that lists requests and enabled people, enables any email, dismisses a request, and removes an enabled person. A member who opens it sees a forbidden state.

## Also

- Write `docs/adr/0005-portal-access.md` in the same shape as `docs/adr/0004-per-project-workspaces-with-git-snapshots.md`.
- Run `pnpm --filter @repo/contracts test`, `pnpm --filter api test`, and `pnpm --filter @repo/auth test`. Fix what you break.
- Do not commit, push, or edit `.env`.

## Status

- Status: DONE
- Migration: Added `packages/db/prisma/migrations/20261117100000_portal_access/migration.sql` by hand (`PortalAccess`, `AccessStatus`). `pnpm --filter db exec prisma migrate status` could not reach Postgres at localhost:5432, so the migration was not applied. `20261103000000_init` was not edited.
- Tests: `pnpm --filter @repo/contracts test` 5 passed. `pnpm --filter api test` 58 passed, 18 integration tests skipped (`RUN_DB_TESTS` unset; Postgres down). `pnpm --filter @repo/auth test` 4 passed. `pnpm --filter api check-types` and `pnpm --filter @repo/web check-types` passed.
