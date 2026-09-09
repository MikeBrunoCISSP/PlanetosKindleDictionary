## Context

See proposal.md - Why. Confirmed by reading the current code, and independently reviewed by a Plan-agent pass before finalizing:

- The app's menu (`apps/web/src/components/AppHeader.tsx:88-340`) isn't a real accordion component — it's hand-rolled on shadcn `DropdownMenu` plus an `openSection` state variable and a `toggleSection` helper. "Dictionaries" (visible to all visitors including anonymous), "Entries" (authenticated only), and "Administration" (admin only) are the three existing top-level sections. Nav uses `useNavigate()` + `onClick`, not `<Link>`.
- The app already has a full mail pipeline built this session: `apps/api/src/lib/mailer.ts`'s `sendEmail()` dispatcher (Brevo API or SMTP per `config.mailTransport`), the `EmailOutbox` model + `apps/api/src/lib/outbox.ts`, the `email` BullMQ queue, and `worker.ts`'s hourly `reconcile-pending-emails` job. `config.ts`'s `WORKER_REQUIRED` set had to be fixed once already this session because the **worker**, not the API, is what actually sends mail — every new mail-related config value here follows that same lesson from the start.
- `EmailOutbox`/`processEmailOutbox` (`outbox.ts:20-69`) is hard-coupled to "one AES-256-GCM-encrypted URL string" — `decrypt(row.payloadEncrypted!)` then dispatch to a `(to, url)` sender, and the payload is nulled after sending specifically because it holds an active single-use token. None of that fits a contact message (four plain fields, nothing single-use or secret).
- Turnstile verification (`apps/api/src/routes/auth.ts:72-89`) is currently an inline, self-contained block with no register-specific logic mixed in, used by exactly one route today.
- `packages/shared/src/validation.ts`'s `plainText({min,max})` already rejects HTML-tag markup and enforces length — and `openspec/specs/security/input-hardening/spec.md` already has generically-worded "Free-text input rejects markup" / "...has an enforced maximum length" requirements that this reuse satisfies without a delta.
- Brevo's transactional API doesn't require the **recipient** to be pre-verified — only the **sender** domain, which is already verified (see `BREVO.md`). So "forward to my personal email" needs no Brevo-side configuration at all, only a new destination-address config value.

## Goals / Non-Goals

**Goals:**
- A visitor (anonymous or logged-in) can send a message that reliably reaches the operator's own inbox, asynchronously, reusing the existing durable-outbox-plus-worker-queue architecture rather than a new one.
- The same Turnstile and rate-limiting protections already trusted for registration apply here.
- No Brevo dashboard changes required beyond what's already configured.

**Non-Goals:**
- Pre-filling Name/Email from a logged-in user's own profile — a reasonable follow-up, explicitly deferred, not required by the request.
- A general-purpose "any capability can send arbitrary mail" abstraction — this reuses the existing mailer/queue exactly as-is, adding one new sender function and one new queue job name, not a redesign.
- Broadening `turnstile/registration-protection` into a generic multi-endpoint capability — that capability's Purpose and requirements are explicitly scoped to registration; the contact form's own Turnstile behavior is described within its own new `support/contact-form` spec instead, leaving the existing capability untouched and accurate.

## Decisions

### 1. New `ContactMessage` model, not an extension of `EmailOutbox`

```prisma
model ContactMessage {
  id        String            @id @default(cuid())
  name      String
  email     String
  subject   String
  message   String
  status    EmailOutboxStatus @default(PENDING)
  attempts  Int               @default(0)
  error     String?
  sentAt    DateTime?
  createdAt DateTime          @default(now())

  @@index([status, createdAt])
}
```

Reuses the existing `EmailOutboxStatus` enum (PENDING/SENT/FAILED — identical semantics apply) rather than defining a parallel one. No encryption: nothing here is a single-use secret the way a verify/reset token is, so `EmailOutbox`'s whole reason for encrypting-then-nulling the payload doesn't apply.

Alternative considered and rejected: reusing `EmailOutbox` by JSON-encoding the four fields into `payloadEncrypted` and adding a `CONTACT` type. Rejected — `recipientEmail` there means "the account holder receiving a link"; for a contact message the recipient is a *fixed configured address* and the *submitter's* address is data, not the row's identity. Forcing this through `EmailOutbox` would mean either misusing `recipientEmail`'s meaning or storing the actual recipient somewhere else anyway — a second small model is cleaner than bending an existing one to fit a different shape.

### 2. New `apps/api/src/lib/contactMessages.ts`

Mirrors `outbox.ts`'s shape exactly:

```ts
export function createContactMessage(
  tx: Prisma.TransactionClient,
  data: { name: string; email: string; subject: string; message: string }
) {
  return tx.contactMessage.create({ data, select: { id: true } });
}

export async function processContactMessage(prisma: PrismaClient, id: string): Promise<void> {
  const row = await prisma.contactMessage.findUniqueOrThrow({ where: { id } });
  if (row.status === "SENT") return;

  try {
    await sendContactMessageEmail({ name: row.name, email: row.email, subject: row.subject, message: row.message });
    await prisma.contactMessage.update({ where: { id }, data: { status: "SENT", sentAt: new Date() } });
  } catch (err: unknown) {
    await prisma.contactMessage.update({
      where: { id },
      data: { status: "FAILED", attempts: { increment: 1 }, error: formatError(err) },
    });
    throw err;
  }
}
```

Same idempotency guarantee as `processEmailOutbox` (a row already SENT is a no-op — a stray retry never re-sends).

### 3. `mailer.ts` gains `replyTo` support and `sendContactMessageEmail`

```ts
interface Message {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
}

async function sendViaSmtp(msg: Message): Promise<void> {
  transporter ??= createTransport(config.smtpUrl);
  await transporter.sendMail({
    from: fromHeader(),
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
  });
}

export async function sendViaBrevoApi(msg: Message, timeoutMs = BREVO_TIMEOUT_MS): Promise<void> {
  const res = await fetch(BREVO_API_URL, {
    method: "POST",
    headers: { "api-key": config.brevoApiKey, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      sender: { email: config.mailFromAddress, name: config.mailFromName },
      to: [{ email: msg.to }],
      subject: msg.subject,
      textContent: msg.text,
      ...(msg.replyTo ? { replyTo: { email: msg.replyTo } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  // ...unchanged error handling
}

export async function sendContactMessageEmail(payload: {
  name: string; email: string; subject: string; message: string;
}): Promise<void> {
  await sendEmail({
    to: config.contactRecipientEmail,
    subject: `[eReader Dictionaries] ${payload.subject}`,
    text: `New contact form submission.\n\nName: ${payload.name}\nEmail: ${payload.email}\n\n${payload.message}`,
    replyTo: payload.email,
  });
}
```

`replyTo` is optional and additive — the three existing senders (`sendPasswordResetEmail`, `sendVerificationEmail`, `sendAccountApprovedEmail`) never set it, so their behavior and existing tests (`tests/lib/mailerBrevo.test.ts`, which asserts specific sub-fields via `toEqual`, not the whole payload) are unaffected. **Brevo's API wants `replyTo` as an object (`{email}`), not a bare string** — nodemailer accepts a bare string for the SMTP path; getting this distinction right is exactly why a new test case asserts the literal JSON body shape sent to Brevo when `replyTo` is set.

### 4. Reuse the existing `email` BullMQ queue and its reconciliation job

New job name `"send-contact-message"` carrying `{ contactMessageId }`, handled in `worker.ts`'s existing `processEmailQueueJob` branch alongside `"send-email"`/`"reconcile-pending-emails"`, using the same `EMAIL_JOB_RETRY_OPTIONS` and per-row `deduplication`. The existing `reconcilePendingEmails()` function is broadened to run a **second** query (stale-PENDING `ContactMessage` rows, same 5-minute threshold) and enqueue those too — one hourly scheduler tick, two queries, no new `upsertJobScheduler` registration. A dedicated new queue was considered and rejected: contact submissions are low-volume and rate-limited (5/hour/IP), so there's no concurrency/retry/isolation reason to separate them from the existing queue.

### 5. New `POST /api/contact` route

Modeled on `forgot-password`'s shape (`apps/api/src/routes/auth.ts:229-266`): parse+validate → Turnstile check → create row → best-effort enqueue in try/catch (log-only on failure; the reconciliation sweep is the safety net) → respond. Unlike forgot-password, there's no account-enumeration concern to hide behind a generic response — returns `201` with `{ id }` (matches the identifying-info pattern `register` already uses, and gives the frontend something to reference if a visitor needs to follow up on a specific message).

### 6. Extract `requireTurnstileIfEnabled(prisma, token, ip)` into `lib/turnstile.ts`

```ts
export async function requireTurnstileIfEnabled(
  prisma: PrismaClient,
  token: string | undefined,
  ip: string
): Promise<void> {
  const settings = await prisma.turnstileSettings.findUnique({ where: { id: TURNSTILE_SETTINGS_ID } });
  if (!settings?.enabled) return;
  if (!settings.secretKeyEncrypted) throw Errors.TURNSTILE_MISCONFIGURED();
  if (!token) throw Errors.TURNSTILE_VERIFICATION_FAILED();
  const result = await verify(decrypt(settings.secretKeyEncrypted), token, ip);
  if (!result.success) throw Errors.TURNSTILE_VERIFICATION_FAILED();
}
```

Both `auth.ts`'s register handler and the new `contact.ts` route call this instead of each having their own copy. This is a pure refactor of *where* the logic lives — register's behavior, error types, and existing tests are unchanged. Justification for doing this now rather than deferring: this is the second Turnstile-protected route; a second hand-copied security check is exactly the kind of duplication where a copy-paste slip (e.g. forgetting the `!token` check) silently disables bot protection on one route but not the other. The existing block is fully self-contained with zero register-specific logic mixed in, so the extraction is low-risk.

### 7. New config: `CONTACT_RECIPIENT_EMAIL`

Required in strict mode for **both** `api` and `worker` scopes (added to `WORKER_REQUIRED`, matching the established `MAIL_TRANSPORT`/`SMTP_URL`/`BREVO_API_KEY`/`MAIL_FROM_ADDRESS` precedent — the worker is the actual sender). Validated as non-empty and roughly email-shaped, reusing `MAIL_FROM_ADDRESS`'s format regex (`/^[^@\s]+@([^@\s]+\.[^@\s]+)$/`) — but **not** its domain-blocklist checks (`.local`/`.test`/`example.com`/etc.) or "must be a verified sending domain" framing, since this is a destination address (someone's personal inbox), not a sender identity that Brevo needs to have verified.

### 8. New shared schema `packages/shared/src/contact.ts`

```ts
export const contactMessageSchema = z.object({
  name: plainText({ max: 200 }),
  email: z.string().email(),
  subject: plainText({ max: 200 }),
  message: plainText({ max: 3000 }),
  turnstileToken: z.string().optional(),
});
```

### 9. New frontend page `apps/web/src/routes/contact.tsx`

react-hook-form + zodResolver, matching `login.tsx`'s established form pattern exactly: `Form`/`FormField`/`FormItem`/`FormControl`/`FormMessage` wrappers, the same `@marsidev/react-turnstile` widget + `apiGetTurnstileConfig` query + `turnstileToken` state + pre-submit guard as the Register form, and a success state shown after submit (mirroring the "check your email" confirmation card style already used post-registration).

### 10. New "Help" menu section in `AppHeader.tsx`

Adds `"help"` to the `openSection` union, a toggle `DropdownMenuItem`, and one shelf item ("Contact" → `navigate({ to: "/contact" })`) — following the exact same shape as the existing "Dictionaries" section (visible to every visitor). **Confirmed with the user**: Help/Contact defaults to visible for anonymous visitors too, same tier as Dictionaries.

## Risks / Trade-offs

- **[Risk] A visitor could put a real third party's email address in the Email field and use the contact form to send that person spam with an operator-controlled reply-to.** → Accepted, same exposure any public contact form has; Turnstile + 5/hour/IP rate limiting are the same mitigations this app already trusts for registration abuse, and the delivered email always goes to the operator's own inbox first (not directly to a third party) — the operator sees and controls what happens next.
- **[Risk] `CONTACT_RECIPIENT_EMAIL` typo'd to an unreachable address would silently blackhole all contact messages.** → Accepted: `ContactMessage.status` stays observable (PENDING → FAILED with `error` populated after Brevo/SMTP rejects an unreachable recipient), matching how `EmailOutbox` already surfaces delivery failures for the operator to notice; no additional alerting is introduced here, consistent with `EmailOutbox`'s existing precedent.
- **[Risk] Extracting the Turnstile helper touches `auth.ts`'s register handler, a well-exercised code path.** → Mitigated: the extraction is a pure move (identical logic, same throws, same call signature at the call site), and the existing register test suite re-run after the change is the direct verification that behavior didn't shift.

## Migration Plan

Additive only: one new table (`ContactMessage`), one new column-free config requirement (`CONTACT_RECIPIENT_EMAIL`, required in strict mode going forward), one new route, one new frontend page, one new menu section. No changes to existing data. Rollback is a plain revert — no backfill, no destructive step.
