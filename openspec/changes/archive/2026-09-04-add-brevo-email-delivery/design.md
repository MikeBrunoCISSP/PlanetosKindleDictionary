## Context

See proposal.md — Why. Design-relevant current state:

- `apps/api/src/lib/mailer.ts` — a lazily-created Nodemailer transporter over `config.smtpUrl`, and three helpers (`sendPasswordResetEmail`, `sendVerificationEmail`, `sendAccountApprovedEmail`) that each call `getTransporter().sendMail({ from: "eReader Dictionaries <no-reply@planetos.local>", to, subject, text })`.
- Call sites: `routes/auth.ts` — register (`await sendVerificationEmail`, **unguarded**, right before `return 201`), forgot-password (`await sendPasswordResetEmail` inside `if (user)`, unguarded), resend-verification (`await sendVerificationEmail` inside `if (user)`, unguarded); `routes/admin.ts` — approve (`await sendAccountApprovedEmail`, **already** in `try/catch` with `request.log.error`). The worker (`worker.ts` + `jobs/*`) sends no mail.
- `apps/api/src/config.ts` (from PROD-002): one zod-ish parser, `strict` unless `NODE_ENV` is `development`/`test`, `assertConfigValid(scope: "api" | "worker")`, per-scope `WORKER_REQUIRED` allow-list. `smtpUrl` is currently an unconditional strict-required `smtp`/`smtps` URL. Placeholder secrets rejected via a `PLACEHOLDER_SECRETS` set. Exports pure `validateEnv(env, scope)` / `parseEnv(env)` used by `tests/config.test.ts`.
- `apps/api/src/lib/turnstile.ts` — the precedent for an outbound HTTPS call: plain module, global `fetch`, returns a small typed result, swallows network errors into a typed failure. No HTTP-client dependency.
- `tests/lib/mailer.test.ts` — sends real mail and asserts arrival via the Mailpit REST API (`http://localhost:8025`). Mailpit is SMTP-only.
- Brevo: HTTPS API is `POST https://api.brevo.com/v3/smtp/email`, header `api-key: <key>`, body `{ sender: { email, name }, to: [{ email }], subject, textContent }`, `201` on success with `{ messageId }`. SMTP relay is `smtp-relay.brevo.com` :587/:2525 (or :465 TLS), auth = Brevo login + an **SMTP key** (not the API key). Both require a sender that is a verified domain / authorized sender in the Brevo dashboard.
- Railway: outbound SMTP is Pro-plan-only; HTTPS (443) works on every plan.

## Goals / Non-Goals

**Goals:**

- Production mail that works on any Railway plan, with a real sender.
- One `sendEmail()` seam; the three helpers and their bodies are otherwise untouched.
- A registration/reset/resend flow that cannot `500` (or leak account existence) because of a mail outage.
- Local dev unchanged: `MAIL_TRANSPORT` defaults to `smtp`, `mailer.test.ts` keeps hitting Mailpit.

**Non-Goals:**

- Queuing/retrying mail on the worker (best-effort + the existing resend endpoint was the chosen trade-off).
- HTML bodies, Brevo templates, attachments, or per-message sender overrides.
- A generic provider abstraction — exactly two transports (`brevo-api`, `smtp`); any other SMTP service is reachable through `smtp`.

## Decisions

### 1. `MAIL_TRANSPORT` selector + a single `sendEmail()` seam

`config.ts` gains `mailTransport: "brevo-api" | "smtp"`. Dev/test default `"smtp"`; **required** in strict mode (no default) so an operator must choose. `mailer.ts` exposes an internal:

```ts
async function sendEmail(msg: { to: string; subject: string; text: string }): Promise<void>
```

that dispatches on `config.mailTransport`. The three public helpers keep their exact signatures, subjects, and `text` bodies — they just build `msg` and call `sendEmail`.

- **`smtp`**: the current lazy Nodemailer transporter, but `from` becomes `` `${config.mailFromName} <${config.mailFromAddress}>` ``.
- **`brevo-api`**: `fetch("https://api.brevo.com/v3/smtp/email", { method: "POST", headers: { "api-key": config.brevoApiKey, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ sender: { email: config.mailFromAddress, name: config.mailFromName }, to: [{ email: msg.to }], subject: msg.subject, textContent: msg.text }) })`. On a non-2xx response, `throw new Error("Brevo API <status>: <body snippet>")`. Unlike `turnstile.ts` this does **not** swallow errors — the caller (best-effort try/catch, Decision 3) decides what to do, and `mailer.test.ts`-style tests need the throw.

`Config` additions: `mailTransport`, `brevoApiKey: string`, `mailFromAddress: string`, `mailFromName: string`. All **API-scope** (not in `WORKER_REQUIRED`).

### 2. Config validation is transport-conditional

In `validateEnv` (strict + api scope only):

- `MAIL_TRANSPORT` — required; must be `"brevo-api"` or `"smtp"`.
- `SMTP_URL` — the existing `smtp`/`smtps` URL check runs **only when** `MAIL_TRANSPORT === "smtp"`.
- `BREVO_API_KEY` — non-empty and not in a `PLACEHOLDER_SECRETS`-style set, **only when** `MAIL_TRANSPORT === "brevo-api"`.
- `MAIL_FROM_ADDRESS` — required; must match a basic `x@y.tld` shape and its host must not be `localhost` / `127.0.0.1`, nor end in `.local` / `.test` / `.example`, nor be `example.com` / `example.org` / `example.net`.
- `MAIL_FROM_NAME` — required (non-empty) in strict mode; dev default `"eReader Dictionaries"`.

`parseEnv` fills the dev defaults (`smtp`, `eReader Dictionaries`, blank key/address) so `config` is always well-shaped; `assertConfigValid("api")` is the gate.

*Alternative — a separate `mail.ts` config island*: rejected; the whole point of PROD-002 was one parsed source.

### 3. Best-effort sends at the three unguarded call sites

Wrap each `await send…` in `routes/auth.ts` exactly like `routes/admin.ts` already does:

```ts
try { await sendVerificationEmail(user.email, verifyUrl); }
catch (err) { request.log.error(err, "Failed to send verification email"); }
```

- register → still `return reply.status(201).send(toUserDto(user))`.
- forgot-password / resend-verification → still fall through to the generic `200`. Because the failure is now swallowed, a matching account and a non-matching identifier return byte-identical responses.

No new column, no "was it sent" flag on the DTO — the frontend already renders the check-your-email card with a resend action unconditionally (per `auth/login-registration`).

### 4. Railway wiring + runbook

`.railway/railway.ts` `app` service `env`: add `MAIL_TRANSPORT: "brevo-api"` (literal) and `BREVO_API_KEY` / `MAIL_FROM_ADDRESS` / `MAIL_FROM_NAME` as `preserve()`. Worker unchanged. `infra/railway/README.md` §5-ish email steps become: (1) add + verify a sender domain in Brevo, (2) create an **API key** (SMTP settings → API keys), (3) set the four vars. Keep a short "Pro-plan alternative: `MAIL_TRANSPORT=smtp` + `SMTP_URL=smtp://<login>:<smtp-key>@smtp-relay.brevo.com:587`" note.

## Risks / Trade-offs

- [Risk] A silently-failing verification email leaves a user unable to log in until they find the resend action. → Acceptable vs. the current `500` + orphan row; the resend UI is already prominent, and the log line gives operators a signal. Queued delivery is a documented follow-up.
- [Risk] Brevo sender-verification is a manual dashboard step the runbook can describe but not automate; a deploy with an unverified sender will send `4xx` from Brevo on every message (now logged, not fatal). → The acceptance smoke test in tasks catches it before go-live.
- [Risk] `MAIL_FROM_ADDRESS` domain heuristic could reject a legitimate internal TLD. → Only well-known non-routable patterns are blocked; documented, and an operator on an unusual domain can widen the check in a follow-up.
- [Trade-off] Two transports = two code paths and a test matrix. Kept minimal: `smtp` is the unchanged existing path, `brevo-api` is ~15 lines of `fetch`.
- [Risk] `mailer.test.ts` would break if `MAIL_TRANSPORT` were ever `brevo-api` in CI. → It defaults to `smtp` in `test`; a new stubbed-`fetch` test covers the `brevo-api` path in isolation.

## Migration Plan

Additive; `development`/`test` behaviour is unchanged (default `smtp` → Mailpit). Rollout:

1. Land mailer + config + auth + tests + docs + `.railway/railway.ts`.
2. Operator, before/with the next deploy: verify a sender domain in Brevo, create an API key, set `MAIL_TRANSPORT=brevo-api`, `BREVO_API_KEY`, `MAIL_FROM_ADDRESS` (on the verified domain), `MAIL_FROM_NAME`.
3. First strict boot fails fast if any are missing (PROD-002 behaviour).
4. Post-deploy smoke: trigger a registration, a forgot-password, and an admin approval; confirm all three arrive from the configured sender (Brevo dashboard → Logs).

Rollback: set `MAIL_TRANSPORT=smtp` with a working `SMTP_URL`, or revert the change.

## Open Questions

- Exact `.local`/`.test`/`.example` block list vs. a stricter "MX-resolvable" check — a refinement that doesn't change the spec or tasks; the static list ships first.
