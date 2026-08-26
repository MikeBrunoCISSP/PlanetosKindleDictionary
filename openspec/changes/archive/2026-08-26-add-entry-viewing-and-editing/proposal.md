## Why

There is no way to view an individual dictionary entry today — search results show only a truncated excerpt, and there is no way to propose a correction or improvement to an existing entry once it's been approved. This change adds a public entry-detail page and an authenticated edit workflow that mirrors the existing new-entry submission/approval model: a proposed edit becomes a pending revision for administrator review, and the currently-approved entry stays authoritative (in search, on the detail page, and in generated dictionary output) until that revision is approved.

## What Changes

- Search results' headwords become hyperlinks to a new entry-detail page (`/entries/{id}`); search behavior is otherwise unchanged.
- New public entry-detail page: Headword, Definition, Inflections, read-only by default, clean "no inflections" state. Entries that are Pending review are also visible here (with a "pending review" banner) rather than 404ing — Rejected and Deleted entries 404, matching how search already excludes them.
- An **Edit** button (top-left) is shown only to authenticated users, and only on entries that are currently Approved (editing a not-yet-approved or historical entry is out of scope). The backend enforces authentication independently of the button's visibility.
- Edit mode lets any authenticated user change the Definition and Inflections; the Headword stays visible but is not editable.
- Definition editing reuses the exact validation already used for creating a new entry (required, max 5,000 characters, no silent truncation, trimmed) — including fixing a latent gap where the existing create-entry schema doesn't trim before checking "required," so a whitespace-only Definition currently slips through.
- Inflection add/remove reuses the Add Entry screen's UI and duplicate-word rules, correctly excluding the entry's own existing inflections from conflicting with themselves.
- The edit form tracks whether a real (normalized-value) change has been made and disables Submit until there is one and the form is valid.
- Submitting an edit creates a **pending revision** (a new `EntryEditProposal`) rather than touching the live entry; the currently-approved content keeps being what search, the detail page, and dictionary generation show until an admin approves it.
- The existing Administration → Approval Queue is extended to show both pending new-entry submissions and pending edit proposals in one list, with a Type indicator, instead of a second parallel approval UI.
- Approving an edit applies the proposed Definition/Inflections to the real entry atomically, re-validating word-uniqueness against the current dictionary state and rejecting the approval (leaving the revision Pending) if the underlying entry changed since the edit was submitted or if a word conflict has since appeared.
- Rejecting an edit leaves the approved entry untouched and reuses the existing rejection-note flow.
- At most one pending edit proposal is allowed per entry at a time, enforced server-side and at the database level.

## Capabilities

### New Capabilities

- `entries/viewing`: public entry-detail page — read-only display, Pending-review banner, Edit-button visibility rules.
- `entries/editing`: authenticated edit-mode workflow — Definition/Inflection editing, dirty-state-gated submission, pending-revision creation, one-pending-edit-per-entry, cancel.

### Modified Capabilities

- `entries/approval`: extend the Approval Queue's pending-items listing to include edit proposals alongside new-entry submissions (with a Type indicator), and add review/approve/reject support for edit proposals (including the concurrency and re-validation checks at approval time).
- `search/dictionary-search`: search results' headwords become hyperlinks to the entry-detail page.
- `entries/submission`: the create-entry Definition field now correctly rejects a whitespace-only value (closing the trim gap shared with the new edit-Definition validation), reflected as one added scenario on the existing "Definition Field" requirement.

## Impact

- **Database**: new `EntryEditProposal` and `EntryEditProposalInflection` models, a new `EntryEditProposalStatus` enum, new relation fields on `User`; a hand-added partial unique index (`WHERE status = 'PENDING'`) enforcing one pending proposal per entry, since Prisma's schema DSL can't express a partial index declaratively.
- **API** (`apps/api`): new public `GET /api/entries/:id`; new `POST /api/entries/:id/edit-proposals` (any authenticated user); new admin endpoints for the merged review queue and edit-proposal review/approve/reject; two new error cases (`EDIT_ALREADY_PENDING`, `STALE_ENTRY_REVISION`).
- **Shared** (`packages/shared`): new DTOs/schemas for the public entry view, edit submission, edit-proposal review, and the merged queue item; a shared, trimmed `definitionHtmlSchema` reused by both create and edit; `DUPLICATE_WORD_MESSAGE` promoted to an exported constant instead of being duplicated in three places.
- **Web** (`apps/web`): new `/entries/$id` route (view/edit toggle); Approval Queue table gains a Type column and a second review-dialog component for edit proposals; search results' headword cell becomes a link.
