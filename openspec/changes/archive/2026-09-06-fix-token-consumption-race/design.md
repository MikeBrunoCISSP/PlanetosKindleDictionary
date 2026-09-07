## Context

See proposal.md — Why. Design-relevant current state, confirmed by reading `apps/api/src/routes/auth.ts` directly:

- `reset-password` (lines 261-287) and `verify-email` (lines 289-316) share the identical vulnerable shape: `prisma.passwordResetToken.findFirst({ where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } } })` runs outside any transaction; the subsequent `prisma.$transaction([...])` (array form) updates the token by `{ where: { id: resetToken.id } }` alone — no `usedAt: null` re-check on the write.
- `PasswordResetToken` and `EmailVerificationToken` (`schema.prisma`) are identical in shape: `id`, `userId`, `tokenHash @unique`, `expiresAt`, `usedAt DateTime?`. No unique/partial constraint enforces "at most one active token" at the DB level beyond what `forgot-password`/`resend-verification` already do by invalidating prior tokens on issuance (`updateMany` at line 229, and the equivalent in `resend-verification`).
- No "atomically claim a row" (`updateMany` + count check) pattern exists anywhere in this codebase today. The closest precedent is an **interactive `$transaction(async (tx) => {...}, { isolationLevel: "Serializable" })`** pattern used in `entries.ts`, `entryEditProposals.ts`, and `admin.ts` — built for a different problem shape (multi-row read-then-conditionally-write across entities), not a single-row conditional update.
- `apps/api/tests/passwordReset.test.ts` and `emailVerification.test.ts` both use `buildApp()` against real Postgres/Mailpit and already test sequential reuse ("rejects reusing an already-redeemed token"); neither exercises concurrent requests.

## Goals / Non-Goals

**Goals:**
- Make token redemption an actual atomic claim, closing the race for both endpoints identically.
- Prove it with a real concurrent-request test against real Postgres, per the finding's own request.

**Non-Goals:**
- Changing token *creation* (`forgot-password`, `resend-verification`) — not part of this race.
- Adopting the codebase's Serializable-interactive-transaction convention — a different, heavier tool than this specific problem needs (see Decision 1).
- Any schema change — the existing `usedAt`/`expiresAt` columns are sufficient.

## Decisions

### 1. Atomic claim via `updateMany` inside an interactive transaction, not Serializable isolation

**Decision:** convert both endpoints' `$transaction([...])` (array form) to `$transaction(async (tx) => {...})` (interactive form). Inside, replace the token's plain `update({ where: { id } })` with:
```ts
const claimed = await tx.passwordResetToken.updateMany({
  where: { id: resetToken.id, usedAt: null, expiresAt: { gt: new Date() } },
  data: { usedAt: new Date() },
});
if (claimed.count !== 1) throw Errors.INVALID_RESET_TOKEN();
await tx.user.update({ where: { id: resetToken.userId }, data: { passwordHash } });
```
(verify-email mirrors this with `emailVerificationToken` / `Errors.INVALID_VERIFICATION_TOKEN()` / `{ emailVerified: true }`, no password hash.)

**Reasoning:** this is a single-row conditional `UPDATE ... WHERE id = ? AND usedAt IS NULL AND expiresAt > ?` — the textbook SQL compare-and-swap. Postgres's default Read Committed isolation already guarantees correctness for exactly this shape: an `UPDATE` acquires the target row's lock, and if a concurrent `UPDATE` is already holding it, the second one blocks until the first commits, then **re-evaluates its own `WHERE` clause** against the now-current row before deciding whether to apply. Once the first transaction has committed `usedAt = <timestamp>`, the second transaction's `WHERE usedAt IS NULL` no longer matches, so its `updateMany` affects zero rows and `claimed.count !== 1` triggers the same generic invalid-token error a genuinely-already-used token would get. No Serializable isolation, no explicit row locking (`SELECT ... FOR UPDATE`), and no new schema constraint are needed.

**Alternative — follow the existing Serializable-interactive-transaction convention** (as in `entries.ts`/`admin.ts`): rejected. That pattern earns its cost when a transaction needs to make a decision based on a read that could be invalidated by an unrelated concurrent write to a *different* row or a broader consistency condition. Here the entire "claim" is expressible as a single conditional `UPDATE` on one row, which Read Committed already serializes correctly — reaching for Serializable would add retry-on-conflict handling (Serializable transactions can abort and must be retried) for no correctness benefit over the simpler compare-and-swap.

### 2. Keep the pre-transaction `findFirst` as a fast-fail pre-check only

**Decision:** leave the existing `findFirst` read before the transaction unchanged. Its only job now is to produce a fast, friendly rejection for the overwhelmingly common case (a token that's already invalid/expired/used) without paying for a transaction. The `updateMany` inside the transaction is the actual security boundary; the pre-check is redundant-but-harmless for a losing concurrent request (it may still pass the pre-check, then correctly fail at the atomic claim).

### 3. Password hashing stays outside the transaction

**Decision:** `hash(body.password)` (argon2, CPU-bound) continues to run before `$transaction` starts, exactly as today. Its result doesn't depend on whether this request wins or loses the race, and keeping CPU-bound work out of an open DB transaction avoids holding a DB connection longer than necessary.

### 4. Re-check expiry with a fresh timestamp at claim time

**Decision:** the `updateMany`'s `expiresAt: { gt: new Date() }` uses a timestamp taken at claim time, not the one from the initial `findFirst`. This closes the (already narrow) window where a token could expire between the pre-check and the claim — a strict improvement over today's behavior, not a new risk introduced by this change.

## Risks / Trade-offs

- **[Trade-off]** The interactive transaction form is slightly more verbose than the array form it replaces. Mitigated by keeping the change minimal and mechanical — same two writes, same error type, just an added count check.
- **[Risk]** A future edit to either handler could reintroduce the bug by reverting to a plain `update({ where: { id } })`. Mitigated by a code comment on each `updateMany` call explaining why the extra `where` clauses are load-bearing (referencing SEC-002), not decorative.

## Migration Plan

Purely an application-code change to two request handlers; no schema, no data, no deployment-topology impact.

1. Land the `auth.ts` change and both new tests together.
2. No operator action needed — deploys like any other code change.
3. No special post-deploy verification beyond normal test coverage; this is a race-condition fix with no observable behavior change for the non-concurrent case.

Rollback: revert the change; both endpoints return to the vulnerable array-form transaction.
