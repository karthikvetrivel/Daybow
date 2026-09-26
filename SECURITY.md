# Security

## Report a problem

Report security problems privately through [GitHub's private vulnerability reporting](https://github.com/karthikvetrivel/Daybow/security/advisories/new). Do not open a public issue.

## What the project protects

- Google tokens. The web app encrypts refresh tokens with AES-256-GCM, with a key derived from `APP_SECRET`. The extension keeps a short-lived access token in `chrome.storage.local`.
- Sessions. The web app signs its session cookie with HMAC. The cookie is `HttpOnly` and `SameSite=Lax`, and `Secure` when the app runs on HTTPS.
- Webhooks. Each Google push channel carries a token signed with HMAC. The webhook ignores notifications with any other token. The cron route requires `CRON_SECRET`.
- Scope. The app asks for your email address and for the `calendar.events` and `calendar.calendars` scopes. It changes only an event's label or color, with `sendUpdates=none`.

## Known limits

- An extension build made with `EMBED_JEV_KEY=1` contains a Jev key. Keep such builds private.
- The Google OAuth client secret belongs on the server only. The extension uses the implicit flow and does not need the secret.
