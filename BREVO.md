# Setting up Brevo for transactional email

This app sends all transactional email — email verification, password reset,
and account-approved notices — through [Brevo](https://www.brevo.com)'s
**HTTPS API** by default (`MAIL_TRANSPORT=brevo-api`). It never uses SMTP in
production: Railway blocks outbound SMTP below the Pro plan, but HTTPS (443)
works on every plan, so the Brevo API path is what makes email work regardless
of which Railway plan the project is on.

Locally, mail defaults to plain SMTP against the [Mailpit](https://mailpit.axllent.org/)
catcher in `infra/docker-compose.yml` — you don't need a Brevo account just to
run the app on your machine. This guide is for setting up the real Brevo
account and wiring its API into a deployment (or into local testing, if you
want to exercise the real path before deploying).

## 1. Create a Brevo account and verify a sender domain

1. Sign up at [brevo.com](https://www.brevo.com) (the free tier is enough to
   get started — see [Sending limits](#sending-limits-and-costs) below).
2. In the Brevo dashboard, go to **Senders, Domains & Dedicated IPs** and add
   the domain your mail will come from — e.g. `mail.yourdomain.com`, or just
   `yourdomain.com` if you don't need a subdomain.
3. Brevo shows you a handful of DNS records (typically a DKIM `TXT` record and
   an SPF-related record). Add those at your DNS provider.
4. Wait for Brevo to detect and verify the records — this is usually quick,
   but DNS propagation can take longer depending on your provider. The domain
   shows as **Verified** in the dashboard once it's ready.

**Mail sent from an unverified domain is rejected by Brevo.** Every address
you configure as `MAIL_FROM_ADDRESS` (see below) must be on a domain that
shows as verified here.

## 2. Create an API key (not an SMTP key)

Brevo has two different kinds of credentials, and this app needs the first
one:

- **API key** — used by the HTTPS API this app calls (`sendViaBrevoApi` in
  `apps/api/src/lib/mailer.ts`, `POST https://api.brevo.com/v3/smtp/email`).
- **SMTP key** — a separate credential for connecting over SMTP. Not used by
  the default `brevo-api` transport; only relevant if you switch to the
  Pro-plan SMTP path (see [Alternative: SMTP relay](#alternative-smtp-relay-pro-plan-only)).

To create the API key: Brevo dashboard → **SMTP & API** → **API Keys** tab →
**Generate a new API key**. Copy it immediately — Brevo only shows the full
value once. It looks like `xkeysib-...`.

## 3. Configure the application

The app reads four environment variables for this (see `.env.example` and
`apps/api/src/config.ts`):

| Variable | Purpose |
|---|---|
| `MAIL_TRANSPORT` | Set to `brevo-api` to use Brevo's HTTPS API. |
| `BREVO_API_KEY` | The API key from step 2. |
| `MAIL_FROM_ADDRESS` | The sender address — must be on the domain you verified in step 1. |
| `MAIL_FROM_NAME` | The sender display name (defaults to `eReader Dictionaries` if unset). |
| `CONTACT_RECIPIENT_EMAIL` | Where Contact form submissions are delivered — your own inbox, not a sender identity (see [§3a](#3a-forwarding-contact-form-submissions-to-your-personal-inbox)). |

### Local development / testing the real Brevo path

By default, `.env` has `MAIL_TRANSPORT=smtp`, which sends to the local Mailpit
container instead of Brevo — no Brevo account needed for everyday local work.

To exercise the real Brevo API locally (e.g. to confirm your domain
verification and API key actually work before deploying), edit your local
`.env`:

```bash
MAIL_TRANSPORT=brevo-api
BREVO_API_KEY=xkeysib-your-real-key
MAIL_FROM_ADDRESS=no-reply@mail.yourdomain.com
MAIL_FROM_NAME=eReader Dictionaries
```

`MAIL_FROM_ADDRESS` must be a real address on your verified domain even for
local testing — config validation only relaxes to permissive defaults when
`NODE_ENV=development`/`test`, but a live call to Brevo's API will still
reject a `localhost`/`.test`/`.example` sender at the Brevo end regardless of
what your own config allows. Restart `pnpm dev:api` after changing `.env`,
then trigger a real send (register an account, use *Forgot password*, or
approve a pending registration as an admin) and check
**Transactional → Logs** in the Brevo dashboard.

Revert `MAIL_TRANSPORT` to `smtp` afterward if you want to go back to
Mailpit-only local testing.

### Production (Railway)

`.railway/railway.ts` already sets `MAIL_TRANSPORT: "brevo-api"` as a literal
in both services' config — you don't set that one yourself. You do need to
set the other three as Railway variables (`BREVO_API_KEY`, `MAIL_FROM_ADDRESS`,
`MAIL_FROM_NAME` are declared `preserve()` in the IaC, so `railway up`/`apply`
never clears them once set) **on both `app` and `worker`** — the worker is
what actually sends mail (it processes the `email` queue's jobs), not the API
process:

```bash
printf '%s' 'xkeysib-your-real-key' | railway variable set BREVO_API_KEY --stdin --service app
printf '%s' 'xkeysib-your-real-key' | railway variable set BREVO_API_KEY --stdin --service worker
railway variable set \
  MAIL_FROM_ADDRESS='no-reply@mail.yourdomain.com' \
  MAIL_FROM_NAME='eReader Dictionaries' \
  --service app
railway variable set \
  MAIL_FROM_ADDRESS='no-reply@mail.yourdomain.com' \
  MAIL_FROM_NAME='eReader Dictionaries' \
  --service worker
```

See `infra/railway/README.md` §5.1 for this in the context of the full
deployment runbook.

## 3a. Forwarding Contact form submissions to your personal inbox

The Contact form (Help → Contact) sends each submission as a normal
transactional email to a destination address you configure — **no Brevo
dashboard changes are needed for this.** Transactional email APIs don't
require the *recipient* address to be pre-verified, only the *sender* domain
(already covered by step 1 above); Brevo will happily deliver to any inbox,
including a personal Gmail/Outlook/etc. address.

Set `CONTACT_RECIPIENT_EMAIL` to your personal address, **on both `app` and
`worker`** (same reason as above — the worker is what actually sends it):

```bash
railway variable set CONTACT_RECIPIENT_EMAIL='you@example.com' --service app
railway variable set CONTACT_RECIPIENT_EMAIL='you@example.com' --service worker
```

Unlike `MAIL_FROM_ADDRESS`, this value isn't checked against Brevo's sender
domain restrictions — it's just where mail is delivered *to*, not a sending
identity. Each message arrives with the subject prefixed
`[eReader Dictionaries]` and its reply-to set to the visitor's own email
address, so replying in your inbox client goes straight back to them.

## 4. What happens if something's misconfigured

Outside `NODE_ENV=development`/`test`, the API validates its configuration at
boot and refuses to start if anything is missing or looks like a placeholder
(see `apps/api/src/config.ts`'s `validateEnv`):

- `BREVO_API_KEY` must be set and non-empty when `MAIL_TRANSPORT=brevo-api`,
  and can't be the literal placeholder value from `.env.example`.
- `MAIL_FROM_ADDRESS` must look like a real `user@domain.tld` address, and its
  domain can't be `localhost`, `127.0.0.1`, end in `.local`/`.test`/`.example`,
  or be one of `example.com`/`example.org`/`example.net`.

This catches an unset or placeholder key before deploy, but it **can't**
verify that the key is actually valid or that the sender domain is actually
verified in Brevo — those only fail at send time. If a send fails, the app
logs the error and returns its normal response anyway (registration,
password-reset, and approval flows are deliberately best-effort about mail —
see `openspec/specs/notifications/email-delivery/spec.md`), so a broken Brevo
setup won't 500 your users, but they also won't get their email until you fix
it. Watch for lines like this in the API logs:

```
Brevo API 401: {"code":"unauthorized","message":"Key not found"}
```

Common causes and fixes:

| Symptom | Likely cause |
|---|---|
| `Brevo API 401: ... Key not found` | Wrong or revoked API key, or an SMTP key was used by mistake. |
| `Brevo API 400: ... sender not valid` | `MAIL_FROM_ADDRESS`'s domain isn't verified in Brevo yet, or the domain verification hasn't finished propagating. |
| Mail never sent, no error logged | Check the app actually reached the "attempt to send" code path — e.g. confirm `MAIL_TRANSPORT` is really `brevo-api` and not still defaulting to `smtp`. |
| Request hangs unusually long before failing | Brevo itself is slow/unreachable — the app bounds every Brevo call to 10 seconds (`BREVO_TIMEOUT_MS` in `mailer.ts`) so this should self-resolve, not hang indefinitely. |

## 5. Post-setup smoke test

Once configured, confirm all three transactional mails actually work:

1. Register a new account and confirm the verification email arrives.
2. Use *Forgot password* on an existing account and confirm the reset email
   arrives.
3. As an admin, approve a pending registration and confirm the
   account-approved email arrives.

Check **Brevo dashboard → Transactional → Logs** to confirm each one shows as
sent from your configured `MAIL_FROM_ADDRESS`.

## Alternative: SMTP relay (Pro plan only)

If your Railway project is on the Pro plan (which allows outbound SMTP) and
you'd rather not use the HTTPS API, Brevo also offers an SMTP relay:

1. Generate an **SMTP key** instead of an API key: Brevo dashboard → **SMTP &
   API** → **SMTP** tab.
2. Set `MAIL_TRANSPORT=smtp` (in `.railway/railway.ts` for production, or your
   local `.env`) and:
   ```
   SMTP_URL=smtp://<brevo-login>:<brevo-smtp-key>@smtp-relay.brevo.com:587
   ```
   Percent-encode any `@`, `:`, or `/` characters in the login or key
   (`@` → `%40`, etc.).
3. `BREVO_API_KEY` is unused in this mode.

The sender-domain verification requirement from step 1 above still applies —
it's a property of your Brevo account and sender identity, not of which
transport you use to reach Brevo.

## Sending limits and costs

Brevo's free tier includes a daily sending cap (see
[Brevo's pricing page](https://www.brevo.com/pricing/) for current limits and
paid-tier options) — plenty for verification/reset/approval-style
transactional volume on a small-to-medium deployment, but worth checking
against your expected registration volume before launch. Sending from an
unverified or newly-verified domain may also be subject to Brevo's own
deliverability warm-up behavior for the first period of sending.

## Reference

- `apps/api/src/lib/mailer.ts` — the actual `sendViaBrevoApi` implementation.
- `apps/api/src/config.ts` — environment validation rules.
- `.env.example` — all mail-related environment variables, annotated.
- `infra/railway/README.md` §5.1 — this setup in the context of the full
  Railway deployment runbook.
- `openspec/specs/notifications/email-delivery/spec.md` — the behavioral
  contract for how the app handles mail delivery and failures.
