# Handoff: Google OAuth

Date: 2026-11-17. You create the Google web client for Software Agent. Use Arc through Computer Use (`cursor-computer-use`): resolve Arc, then pass `scope: app` with its pid on every action. Do not call `computer_start_control`. Do not use the Cursor browser. Do not open Netlify. Do not edit application source or the other handoff files. You may update this file. You may write `.local/google-oauth.env` and nothing else under `.local/`.

Reference: `/Users/saif/my-project/personal-productivity/docs/auth-handoff.md`.

## Cloud project

Use the existing project `level-works-424204-t9`. The consent screen name is `ansarisaif` because the project is shared. Do not rename it. Do not edit the OAuth client named Rafiq. Do not change its redirect URI `https://clerk.rafiq.ansarisaif.com/v1/oauth_callback`.

## Client

Create a web client named `Software Agent`.

Read `docs/clerk-production.md`. When `Frontend API host` is filled, the redirect URI is `https://<that-host>/v1/oauth_callback`. If the file is still `PENDING`, re-read it every 20 seconds for up to 10 minutes. If it is still empty, stop and say the Clerk agent has not published the host. Do not guess a Rafiq host.

Authorized JavaScript origin: `https://agent.ansarisaif.com`.

## Secret handoff

Write only this, mode 600, to `.local/google-oauth.env`:

```
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

The Clerk agent reads that file and deletes it. Do not put the secret in this document, in `docs/clerk-production.md`, or in your final summary. You may record the client id in both this file and `docs/clerk-production.md` under Google client. Do not record the secret.

## If you need a sign-in

Stop on the Google account chooser and say so. Prefer the account that already owns `level-works-424204-t9`. Do not create a new Cloud project.

## Status

- Status: DONE
- Client name: Software Agent
- Client id: 292297803121-kbqtqskdg41e8s0jeni19g2qms0o6g1a.apps.googleusercontent.com
- Redirect URI: https://clerk.agent.ansarisaif.com/v1/oauth_callback
- Secret file written: yes (`.local/google-oauth.env`, mode 600). The Clerk agent then deleted it after pasting the secret into custom credentials.
