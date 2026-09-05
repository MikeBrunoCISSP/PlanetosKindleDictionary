## Why

All transactional mail (`apps/api/src/lib/mailer.ts`) is sent from a hardcoded `eReader Dictionaries <no-reply@planetos.local>` over Nodemailer, with `SMTP_URL` as the only delivery mechanism (finding PROD-003):

- **Brevo will reject `no-reply@planetos.local`** — it is not a real domain and not a verified/authorized sender.
- **Railway blocks outbound SMTP (ports 25/465/587) on Free, Trial, and Hobby plans** — only Pro+ permits it — and recommends HTTPS transactional APIs for all plans. A non-Pro deployment cannot send any mail.
- **Registration `await`s `sendVerificationEmail` inside the request handler, after `prisma.user.create`.** A send failure throws → `500`, leaving an orphaned, unverifiable user row. Forgot-password and resend-verification have the same unguarded `await` (a 500 there also leaks account existence, since the success path returns a generic 200).

## What Changes

- **Mail transport abstraction.** New `MAIL_TRANSPORT` config: `brevo-api` | `smtp`.
  - `brevo-api` — `POST https://api.brevo.com/v3/smtp/email` with an `api-key: BREVO_API_KEY` header (HTTPS, port 443). Works on **every** Railway plan. Built on the global `fetch`, matching `lib/turnstile.ts`.
  - `smtp` — the existing Nodemailer path over `SMTP_URL` (local dev against Mailpit; or Brevo's `smtp-relay.brevo.com` on a Railway Pro plan).
- **Sender identity is required, validated configuration.** `MAIL_FROM_ADDRESS` and `MAIL_FROM_NAME` replace the hardcoded string. In strict mode `MAIL_FROM_ADDRESS` must be a syntactically valid email whose domain is not `localhost`, a `.local` / `.test` / `.example` TLD, or an `example.*` domain — the operator points it at a domain they have verified in Brevo.
- **Sends are best-effort.** `sendVerificationEmail` / `sendPasswordResetEmail` (and the resend-verification path) are wrapped so a delivery failure is logged and the endpoint still returns its normal response — `201` for register (the "check your email / resend" card and the resend endpoint are the recovery path), a generic `200` for forgot-password and resend-verification. This mirrors the account-approved send, which is already best-effort. No orphaned-user `500`; no account-existence leak.
- **`config.ts` gains the mail settings.** `SMTP_URL` is required in strict mode only when `MAIL_TRANSPORT=smtp`; `BREVO_API_KEY` is required (non-empty, non-placeholder) only when `MAIL_TRANSPORT=brevo-api`; `MAIL_TRANSPORT` itself is required in strict mode. All mail settings are API-scope — the worker sends no mail.
- **`.railway/railway.ts`** — the `app` service gets `MAIL_TRANSPORT="brevo-api"` and `BREVO_API_KEY` / `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME` as `preserve()`. **`infra/railway/README.md`** — the email section is rewritten for Brevo: verify a sender domain, create an API key, set the four vars; the SMTP-relay path is kept as the Pro-plan alternative.
- **Docs** — `.env.example` and `SPEC.md` gain the mail settings and the transport note.

Not in scope: queuing mail on the worker (best-effort + resend was chosen); HTML bodies or Brevo templates; providers other than Brevo (the `smtp` transport already covers any SMTP service).

## Capabilities

### New Capabilities

- `notifications/email-delivery`: How the application delivers transactional email — a selectable transport (Brevo HTTPS API or SMTP), a required and validated sender identity, credentials supplied only as environment variables, and best-effort sending so a delivery failure never fails or corrupts the triggering operation.

### Modified Capabilities

- `security/configuration`: `SMTP_URL` is required only under the `smtp` transport; the mail-transport selector, the Brevo API key, and the sender address join the strict-mode validated set (weak / placeholder / bad-domain values rejected).
- `deployment/railway`: the operator-secret list changes from "the SMTP connection URL" to "the email-delivery credentials" (a Brevo API key + verified sender, or an SMTP URL).

## Impact

- **`apps/api`** — `lib/mailer.ts` gains an internal `sendEmail()` that dispatches on `config.mailTransport` (Brevo `fetch` client + the existing Nodemailer path); the three public helpers become thin wrappers and take the sender from config. `routes/auth.ts` wraps three `await send…` calls in `try/catch`. `src/config.ts` gains `mailTransport`, `brevoApiKey`, `mailFromAddress`, `mailFromName` and conditional `SMTP_URL` / `BREVO_API_KEY` validation. No new dependency (`fetch` is built in; `nodemailer` stays for the `smtp` transport).
- **Infra** — `.railway/railway.ts` (`app` env), `infra/railway/README.md` (email section).
- **Docs** — `.env.example`, `SPEC.md` §3 / §6 / §10.
- **Tests** — `config.test.ts` (transport-conditional validation, sender-domain rejection); `mailer` gets a Brevo-API test (stubbed `fetch`: request shape + non-2xx throws); an `auth` test that register returns `201` with the user + token persisted even when the verification send fails. The existing `mailer.test.ts` (SMTP → Mailpit) is unchanged because `MAIL_TRANSPORT` defaults to `smtp` in dev/test.
- **No API route contract, data model, or `apps/web` change.**
