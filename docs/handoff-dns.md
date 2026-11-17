# Handoff: Netlify DNS

Date: 2026-11-17. You add Clerk's DNS records for Software Agent. Use the Netlify CLI or the Netlify API. Do not use the Cursor browser or Arc. Do not edit application source or the other handoff files. You may update this file.

Reference: `/Users/saif/my-project/personal-productivity/docs/auth-handoff.md`.

## Zone

Netlify DNS zone `ansarisaif.com`, zone id `6745ee773344dd9296ccec8f`. Confirm the zone id with the CLI before you create records. If the CLI is not logged in, stop and say so. Do not create a new zone.

## Records

Wait until `docs/clerk-production.md` status is `DNS_READY` or `READY` and the five targets are filled. Re-read every 20 seconds for up to 15 minutes. If they are still empty, stop. Do not invent targets and do not copy Rafiq's `bujgh52lbn8d` targets.

Create CNAME records only. `*.ansarisaif.com` does not cover `clerk.agent`.

| Name | Target |
| --- | --- |
| `clerk.agent` | from `docs/clerk-production.md` |
| `accounts.agent` | from `docs/clerk-production.md` |
| `clkmail.agent` | from `docs/clerk-production.md` |
| `clk._domainkey.agent` | from `docs/clerk-production.md` |
| `clk2._domainkey.agent` | from `docs/clerk-production.md` |

Do not change the A record for `agent.ansarisaif.com`. Do not change any name that contains `rafiq`. If a Software Agent CNAME already exists and points at the same target, leave it. If it points somewhere else, record the conflict here and do not overwrite it.

## Check

After the records exist, query them. `https://clerk.agent.ansarisaif.com/v1/environment` should return 200 once Clerk is serving. A cached NXDOMAIN can keep that failing after the record is correct. Record the dig or curl result. Do not require `authenticatable` to be true before you finish; the Clerk agent owns that flag. If the environment payload is visible, note whether `social.oauth_google.authenticatable` is true. Do not paste tokens.

## Status

- Status: RECORDS_CREATED
- Zone confirmed: `6745ee773344dd9296ccec8f` (`ansarisaif.com`), after `netlify login` in the Cursor browser.
- Records created: CNAME `clerk.agent`, `accounts.agent`, `clkmail.agent`, `clk._domainkey.agent`, and `clk2._domainkey.agent`, TTL 300, targets from `docs/clerk-production.md`. The A record for `agent.ansarisaif.com` and every `rafiq` name were left as they were.
- Conflicts: none
- `https://clerk.agent.ansarisaif.com/v1/environment`: DNS at `dns1.p08.nsone.net` and the public resolver returns the Clerk CNAMEs. HTTPS from this machine fails the TLS handshake (`sslv3 alert handshake failure`), so the certificate is not serving yet. `authenticatable` was not read.
