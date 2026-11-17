# Handoff: Clerk production

Date: 2026-11-17. You configure Clerk for Software Agent. Use the Cursor browser (`cursor-ide-browser`: list tabs, navigate, lock, snapshot, click, type). Do not use Computer Use, Arc, or the Netlify CLI. Do not edit application source. Do not edit `docs/handoff-access.md`, `docs/handoff-google.md`, or `docs/handoff-dns.md`. You may update this file and `docs/clerk-production.md`.

Reference: `/Users/saif/my-project/personal-productivity/docs/auth-handoff.md`.

## Leave these alone

- Clerk app **Rafiq**, `app_3MDoaSoiSp52PtjDO3wdXKDhJ1o`, instance `ins_3MDouspqEdIG4yIGgUZs5YPqfpa`, domain `rafiq.ansarisaif.com`.
- Rafiq's development instance `ins_3MDoaXxfeQY873j66mE9hZrZ3xN`.
- Any DNS record whose name contains `rafiq`.

`app_2u8YPZAwqjurFgi5r3vi0aP4JCf` might be Software Agent. Open it and check. Use it only if it is this product. If it is something else, leave it and create or use the Software Agent app.

## Production instance

Public site: `https://agent.ansarisaif.com`. API: `https://agent-api.ansarisaif.com`.

- Application domain `agent.ansarisaif.com`.
- Frontend API host should be `clerk.agent.ansarisaif.com` unless the dashboard assigns a different host. Record the real host.
- Accounts host `accounts.agent.ansarisaif.com`.
- Development instance (`*.clerk.accounts.dev`) stays for localhost. Do not put `pk_live_` keys into `.env` or `.env.local`. Production keys do not work on `http://localhost:3000`.
- Allowed origin / authorized party for production: `https://agent.ansarisaif.com`.

Google SSO, on the production instance only:

- Turn the connection on.
- **Enable for sign-up and sign-in** must be on. That flag is `authenticatable`. If it is off, `POST /v1/client/sign_ins` returns 422 because `oauth_google` is not an allowed strategy, even when the connection says Enabled.
- **Always show account selector prompt** on.
- Custom credentials are required in production. The client id and secret come from the Google agent, in gitignored `.local/google-oauth.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, mode 600). Wait until that file exists (check every 20 seconds, up to 10 minutes). Paste them into the Clerk Google connection. Then delete `.local/google-oauth.env`. Do not write the secret into any doc or into your final summary.

Session token, production instance: add claim `email` = `{{user.primary_email_address}}` so the API can read it without a Clerk API call.

## Keys

Copy production `pk_live_`, `sk_live_`, and the JWT public key into `.local/clerk-production.env` (mode 600). Names:

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_JWT_PUBLIC_KEY=
CLERK_ISSUER=
```

`CLERK_ISSUER` is the production Frontend API origin, for example `https://clerk.agent.ansarisaif.com`.

Do not commit that file. Do not print the values. Do not change GitHub Actions variables. Do not SSH to the server and do not edit `/opt/software-agent/.env`. The access gate has to ship before those keys replace the live ones. Switching the live site first would let every Google account in.

## DNS block

As soon as the dashboard shows the five CNAME targets, write them into `docs/clerk-production.md` and set that file's status to `DNS_READY`. The mail and DKIM targets are per instance. Do not copy Rafiq's `bujgh52lbn8d` targets. `*.ansarisaif.com` does not cover `clerk.agent`.

Then set status to `READY` after the Google secret is saved in Clerk and the secret file is deleted. Also record app id, production instance id, and whether `authenticatable` is on. No secrets.

## If you need a sign-in

Stop on the Clerk sign-in page and say so. Do not invent credentials. Do not use the Rafiq app while you wait.

## Status

- Status: READY
- App: `app_3MEG99ge0BPqpSa3C1oG2Pgdo6s` (Software Agent). `app_2u8YPZAwqjurFgi5r3vi0aP4JCf` is bolt and was left alone.
- Production instance: `ins_3MEGEAyzz3iqZ7Uh38s8eZFZ4z8`
- Frontend API: `clerk.agent.ansarisaif.com`
- `authenticatable`: on
- Keys file: `.local/clerk-production.env` written, mode 600 (values not recorded here)
- Secret file deleted: yes
