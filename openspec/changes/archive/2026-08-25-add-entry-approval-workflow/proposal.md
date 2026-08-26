## Why

Anyone can currently only browse or manage whole dictionaries (Series) — there is no way for a user to contribute an actual dictionary entry, and the `Entry`/`Inflection` models that already exist in the schema have no API or UI built on them yet. `P:\_temp\EntryCreationSpec.md` asks for a full submission-and-approval workflow: any authenticated user proposes a Headword + Definition + Inflections, it starts `Pending`, and an administrator reviews it in an Approval Queue before it can ever become part of a generated Kindle dictionary. This also closes a real gap the schema has today: nothing prevents the same word from existing as both a Headword and an Inflection (or as two different entries' Inflections) within one dictionary, including under concurrent submissions.

## What Changes

- Add an **Entries** accordion section to the nav menu: **Add** (any authenticated user) and a **Delete** placeholder (admin-only, no workflow behind it yet).
- Add an **Administration** accordion section, visible only to administrators, containing **Approval Queue**.
- Add an "Add Entry" screen: dictionary picker, Headword (with client- and server-side duplicate checking against both existing Headwords and Inflections in the selected dictionary), Definition (max 5,000 chars), and an Inflections chip-list editor (add/remove, duplicate-checked the same way, including against other inflections already added to the unsaved entry).
- Saving an entry persists it with status `Pending`, attributed to the submitting user, and shows a success toast; the entry is not part of any generated dictionary while pending.
- Add an Approval Queue page (admin-only): pending entries oldest-first, a Headword link opening a read-only details modal (Headword/Definition/Inflections), and per-row Approve / Reject (with an optional note) actions that remove the row from the queue only after the server confirms the change.
- **BREAKING** (relative to `SPEC.md`'s currently-documented model): entry creation is no longer immediately live — `SPEC.md` is updated in this same change to reflect the new approval-gated model.
- New shared dependency: a toast notification library (none exists in the web app today).

## Capabilities

### New Capabilities
- `entries/submission`: The Add Entry screen and its API — dictionary selection, Headword/Definition/Inflections capture, race-safe duplicate-word validation, and the initial `Pending` save. Includes the route-guard behavior for `/entries/new` (any authenticated user; unauthenticated users redirected to `/login`).
- `entries/approval`: The Administration menu section and Approval Queue — listing pending entries, viewing entry details, and the Approve/Reject actions, all admin-only both in the UI and on the server. Includes the route-guard behavior for `/admin/approval-queue` and the `/entries/delete` placeholder (admin-only; non-admins redirected to `/`).

### Modified Capabilities
- `navigation/app-menu`: adds the **Entries** and **Administration** top-level sections described above, building on `dictionary-crud-menu`'s already-implemented Dictionaries/Settings structure (that change is implemented but not yet archived — this delta is written against its structure, not the currently-stale live spec, per explicit direction; `dictionary-crud-menu` should be archived before or alongside this change).

## Impact

- **Data model**: new `EntryApprovalStatus` enum and new fields on `Entry` (`approvalStatus`, `submittedById`, `reviewedById`, `reviewedAt`, `rejectionNote`); a new `SeriesWord` table providing a single, race-safe, database-level uniqueness constraint across Headwords and Inflections within a dictionary (the current schema cannot express this across two separate tables any other way). One new Prisma migration.
- **API**: new `POST /api/series/:slug/entries` (any authenticated user), new admin-only `GET /api/admin/entries/pending`, `GET /api/admin/entries/:id`, `POST /api/admin/entries/:id/approve`, `POST /api/admin/entries/:id/reject`. New `apps/api/src/plugins/requireAuth.ts` (no existing "any authenticated user" route guard exists — every current gated route is either public or admin-only). Every entry write (create, approve, reject) creates a `Revision` row in the same transaction, per `SPEC.md`'s existing "every write to Entry or Inflection must create a Revision" rule.
- **Shared package**: new `packages/shared/src/entries.ts` (DTOs), new `packages/shared/src/sanitize.ts` implementing the strict HTML allowlist `SPEC.md` §5.4 already mandates for `definitionHtml` (distinct from the markup-rejecting `plainText()` helper used for the true-plain-text Headword field).
- **Web**: new `/entries/new`, `/admin/approval-queue`, and a placeholder `/entries/delete` route; nav changes in `AppHeader.tsx`; a new toast library and its provider mount; reuses the existing `CommandDialog` picker pattern, `ui/table.tsx`, and `ui/dialog.tsx`.
- **`SPEC.md`**: updated in this change (its own stated policy) to reflect the approval-gated entry model, the new endpoints, and the schema additions.
- **Explicitly out of scope**: editing/resubmitting a rejected entry (schema is shaped to allow this later without a redesign); designing the actual entry-delete workflow (nav placeholder only); wiring entries into the build/generation pipeline (it doesn't exist in code yet — this change only ensures `approvalStatus = APPROVED` is available for it to filter on later).
