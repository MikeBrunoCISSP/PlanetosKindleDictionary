## Why

Every new entry and every edit currently goes into the same Pending review queue regardless of who submitted it, even when the submitter is an administrator who could approve it themselves a moment later. That's pure friction for admins doing routine dictionary upkeep (fixing a typo, adding a missing inflection, seeding new entries) — they end up submitting, then immediately switching to the Approval Queue to approve their own submission. Admins should be able to skip that round-trip: their own submissions should go live immediately, while the review workflow stays exactly as-is for everyone else.

## What Changes

- `POST /api/series/:slug/entries`: when the submitting user's role is `ADMIN`, the created entry SHALL be saved with `approvalStatus: APPROVED` (not `PENDING`), with `reviewedById`/`reviewedAt` set to that same admin and the submission time — recording it as self-reviewed rather than never-reviewed. Non-admin submissions are unaffected.
- `POST /api/entries/:id/edit-proposals`: when the submitting user's role is `ADMIN`, the edit SHALL be applied to the entry immediately in the same request — the entry's Definition/Inflections update right away, an `EntryEditProposal` row is still created for audit purposes but is recorded as already `APPROVED` (`reviewedById`/`reviewedAt` set to the same admin), and a `Revision` is written — instead of leaving a `PENDING` proposal for later review. Non-admin submissions are unaffected.
- Both bypasses are decided purely from the authenticated session's role on the server; there is no client-supplied flag and no way for a non-admin request to trigger this path.
- All existing validation is unchanged and still fully enforced for admin submissions: word-uniqueness (including the concurrency-safe database constraints), the 5,000-character Definition limit, the Headword-not-editable rule, and duplicate-inflection checks all still apply — only the approval-workflow step is skipped.
- An admin's edit submission is still refused with the existing "already awaiting approval" error if the target entry already has a `PENDING` edit proposal from anyone (including another admin) — an admin does not silently override or replace someone else's in-flight proposal; they must resolve it via the Approval Queue first.
- Auto-approved items never appear in the Approval Queue, since they're never `PENDING`.
- This only affects the moment of submission. It is not retroactive: entries and edit proposals already sitting `PENDING` (regardless of who submitted them) are unaffected and still require an explicit approval action.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `entries/submission`: "Saving a New Entry" and "Entry Approval Status" — an admin's own submission is saved as Approved (self-reviewed) instead of starting Pending.
- `entries/editing`: "Submitting an Edit Creates a Pending Revision" — an admin's own edit is applied immediately (self-reviewed) instead of creating a Pending revision; "One Pending Edit Per Entry" — clarifies an admin's submission is still blocked by an existing Pending proposal from anyone.
- `entries/approval`: "Pending Entries Listing" — clarifies admin self-approved submissions never enter the queue.

## Impact

- `apps/api/src/routes/entries.ts`: `POST /api/series/:slug/entries` create-transaction gains an admin branch setting `approvalStatus`, `reviewedById`, `reviewedAt` at creation time.
- `apps/api/src/routes/entryEditProposals.ts`: `POST /api/entries/:id/edit-proposals` gains an admin branch that, after the existing pending/conflict checks, applies the proposed Definition/Inflections to the entry and marks the newly-created proposal `APPROVED` in the same transaction (reusing the apply logic already in the `.../approve` handler), and writes a `Revision`.
- No schema changes — `Entry.reviewedById`/`reviewedAt` and `EntryEditProposal.reviewedById`/`reviewedAt` already exist from prior work.
- No shared-package DTO/schema changes — existing `EntryDto` and `EntryEditProposalDto` already expose these fields.
- Frontend: no changes required to the Add Entry form or the entry-detail edit form; the different outcome (live immediately vs. Pending) is purely a server response the existing success-toast/redirect flow already handles, though the toast copy may end up reading oddly for an admin ("submitted for approval" when nothing further is pending) — worth a look during implementation.
