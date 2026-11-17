# ADR 0005: Portal access allowlist

- Status: Accepted
- Date: 2026-11-17

## Context

Clerk proves that a session is real. It does not decide who may use Software Agent. Any Google account that could complete sign-in would otherwise be able to create projects, start runs, and open sandboxes. The product needs one operator who can let people in, and everyone else locked out until that happens.

## Decision

- One superadmin email lives in the API (`saifhussainansari6@gmail.com`), compared case-insensitively. It is not a `PortalAccess` row and cannot be removed.
- Everyone else is `none` until they request access, then `pending`, then `member` once the superadmin enables their email. Emails are stored lowercased. A request uses `ON CONFLICT DO NOTHING`, so an enabled person stays enabled. Enable upserts `ENABLED`. Remove deletes an enabled row. Dismiss deletes a pending row.
- The check runs after the Clerk JWT check and before project routes. `superadmin` and `member` can use the existing `/v1` product routes, then the existing owner check. `pending` and `none` get 403. Access admin routes are superadmin only. `GET /v1/me` and `POST /v1/access/request` work for any verified Clerk user. `/health` and `/ready` stay public.
- Clerk session tokens often omit email. The API reads the `email` claim, then a 5-minute in-memory cache keyed by the Clerk user id, then `GET https://api.clerk.com/v1/users/{userId}` with `CLERK_SECRET_KEY`. The Clerk request and response are not logged. If the email still cannot be resolved, the API returns 401. The role is not cached. The user row is upserted only for `superadmin` and `member`.
- The access store is injected through `ApiDeps` and defaults to Prisma, so security tests do not need Postgres.
- The web app signs in with Google and returns through `/sso-callback`, which stays public. Signed-out visitors start Google from the home primary action (`oauth_google`, account picker). `none` sees Request access in place of the composer. `pending` sees "Waiting for Saif". The superadmin has an Access view. A member who opens it sees a forbidden state.

## Consequences

- A valid Clerk session is no longer enough to create a project. Enabling or removing someone takes effect on the next request.
- The email cache is per API process and lasts five minutes. A new process asks Clerk again when the token has no email claim.
- `CLERK_SECRET_KEY` is required for users whose session token does not include an email. It is already on the api service.
- The allowlist is a new table, `PortalAccess`, in a migration after the initial one. It is not a foreign key to `User`, so an email can be enabled before that person has signed in.
