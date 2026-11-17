# Clerk production status

Shared status for the Clerk, Google, and DNS agents. No secrets in this file.

- Status: READY
- App: `app_3MEG99ge0BPqpSa3C1oG2Pgdo6s` (Software Agent). `app_2u8YPZAwqjurFgi5r3vi0aP4JCf` is bolt and was left alone.
- Production instance: `ins_3MEGEAyzz3iqZ7Uh38s8eZFZ4z8`
- Development instance (do not use for the public site): `ins_3MEG9H1J14Q8yKdTpRcELGI2vhW`
- Application domain: agent.ansarisaif.com
- Frontend API host: clerk.agent.ansarisaif.com
- Google redirect URI: `https://clerk.agent.ansarisaif.com/v1/oauth_callback`
- Enable for sign-up and sign-in (`authenticatable`): on
- Account selector: on

## DNS records

Copy the targets from the Clerk production instance. Do not reuse Rafiq's records.

| Name | Target |
| --- | --- |
| `clerk.agent.ansarisaif.com` | `frontend-api.clerk.services` |
| `accounts.agent.ansarisaif.com` | `accounts.clerk.services` |
| `clkmail.agent.ansarisaif.com` | `mail.0mucrr5w5ngg.clerk.services` |
| `clk._domainkey.agent.ansarisaif.com` | `dkim1.0mucrr5w5ngg.clerk.services` |
| `clk2._domainkey.agent.ansarisaif.com` | `dkim2.0mucrr5w5ngg.clerk.services` |

## Google client

- Cloud project: `level-works-424204-t9`
- Client name: Software Agent
- Client id: `292297803121-kbqtqskdg41e8s0jeni19g2qms0o6g1a.apps.googleusercontent.com`
- Secret location: pasted into Clerk custom credentials, then `.local/google-oauth.env` was deleted. Never copy the secret here.
