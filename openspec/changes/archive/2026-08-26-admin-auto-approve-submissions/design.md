## Context

See proposal.md - Why. Two existing endpoints need an admin-only branch:

- `POST /api/series/:slug/entries` (`apps/api/src/routes/entries.ts`) currently always creates the entry with `approvalStatus: "PENDING"`.
- `POST /api/entries/:id/edit-proposals` (`apps/api/src/routes/entryEditProposals.ts`) currently always creates an `EntryEditProposal` row with the default `status: "PENDING"` and never touches the `Entry`.

A separate, already-implemented admin endpoint, `POST /api/admin/entry-edit-proposals/:id/approve`, contains the exact logic needed to apply a proposal's Definition/Inflections to an entry: diff inflections, re-check word conflicts, update the entry, write a `Revision`, mark the proposal `APPROVED` with `reviewedById`/`reviewedAt`. That logic is reused rather than re-implemented (see Decisions).

`request.authUser.role` (`"MEMBER" | "ADMIN"`) is already available in both handlers via the existing `requireApproved`/`requireAuth` preHandlers - no new auth plumbing is needed.

## Goals / Non-Goals

**Goals:**
- Admin-submitted new entries and edits go live immediately, self-recorded as reviewed.
- Zero behavior change for non-admin submissions.
- Reuse the existing, already-tested apply/approve logic rather than duplicating it.

**Non-Goals:**
- Retroactively approving an admin's existing Pending entries/proposals - out of scope, unaffected by this change.
- Letting an admin override or replace someone else's existing Pending proposal on the same entry - explicitly still blocked (see proposal.md).
- Any UI change to the Add Entry form or edit form - the existing submit/toast flow already just reflects whatever the server returns.

## Decisions

**1. New-entry creation: inline branch, no shared helper needed.**
The create-entry transaction already builds the `Entry` in one `tx.entry.create()` call. The admin branch just changes three fields on that same call (`approvalStatus`, `reviewedById`, `reviewedAt`) based on `request.authUser!.role === "ADMIN"`. No extraction needed - it's a few conditional fields, not duplicated logic.

**2. Edit submission: still create the `EntryEditProposal` row, then immediately run the same apply-and-approve logic used by the manual `/approve` endpoint, in one transaction.**
Two options were considered:
- (a) Skip the `EntryEditProposal` model entirely for admins and update the `Entry` directly.
- (b) Create the proposal row as usual, then - within the same transaction, before returning - apply it and mark it `APPROVED`, exactly mirroring what the manual approve endpoint does.

Chosen: (b). It keeps a complete, uniform history in `EntryEditProposal` for every edit ever made (including instantly-approved ones), so `GET /api/admin/entry-edit-proposals/:id` and any future "show this entry's edit history" feature keep working without a special case for admin-submitted edits. It also reuses the approve transaction's logic (conflict re-check, inflection diff/apply, `Entry.update` to bump `updatedAt`, `Revision` write) almost verbatim instead of re-deriving it - lower risk of the two code paths drifting apart. The staleness check from the manual approve path (`entry.updatedAt !== proposal.baseEntryUpdatedAt`) is a no-op here since both are read inside the same transaction, but leaving that check in place (harmlessly always-true) keeps the two code paths structurally identical, which matters more than trimming one dead comparison.
Practically: factor the "apply this proposal's changes to this entry and mark it approved" block out of the `.../approve` handler into a small shared function in `entryEditProposals.ts` that both the manual approve endpoint and the new admin-submission branch call with `(tx, entry, proposalId, proposedDefinitionHtml, proposedInflections, reviewerId)`.

**3. Existing-pending-proposal check runs before the admin branch, unconditionally.**
The `EDIT_ALREADY_PENDING` check (partial unique index + pre-check) stays exactly where it is, ahead of any role branching. An admin's submission is subject to it identically to anyone else's - see proposal.md's explicit non-goal. This is enforced by ordering: the admin auto-apply branch only runs after the existing pending-proposal check has already passed.

**4. Role check reads `request.authUser!.role` fresh on the request, not a cached/claimed value.**
Both endpoints already re-fetch the user row via `requireAuth`/`requireApproved` on every request (see `apps/api/src/plugins/requireAuth.ts`), so `role` is always current as of that request - no separate lookup needed, and no way for a stale session to retain admin auto-approval after a demotion.

## Risks / Trade-offs

- **Toast copy**: the existing frontend success toasts ("...must be approved before..." / "...submitted for approval.") become misleading for an admin, who gets an immediate, final result. Fixing this requires the frontend to branch on the response's `approvalStatus`/proposal `status` rather than always showing the same static string. Flagged in tasks.md as in-scope (small, response-driven copy change) rather than deferred, since shipping a submission flow that tells an admin "you're not done yet" when they are is a real UX defect, not cosmetic.
- **Two apply-code-paths sharing one function**: the manual approve endpoint and the new inline-admin-approve path now both call the same shared function inside a `$transaction`. A bug in that shared function affects both paths identically - acceptable, since it means a fix or a future behavior change (e.g. adding a new validation rule) only needs to happen once.
- **P2034 (serialization failure) handling in the edit-submission transaction**: the submit handler's existing catch block already maps `P2002`/`P2034` to `EDIT_ALREADY_PENDING`. Once the admin branch adds a second `tx.entry.update()`-style write inside the same transaction, that mapping still applies correctly - a losing concurrent submission is still "someone else's proposal/edit won the race," whether the winner was a regular Pending proposal or another admin's immediate apply.
