## Context

See proposal.md - Why/Impact for motivation and scope. This is the first change writing any Entry-facing API or UI code — `Entry` and `Inflection` already exist in `apps/api/prisma/schema.prisma` but have no routes, no approval concept, and no cross-model uniqueness constraint. Root `SPEC.md` is declared authoritative and documents entries as direct-write today; this change diverges from that deliberately and updates `SPEC.md` in the same change per its own stated policy.

The `navigation/app-menu` delta in this change is written against `dictionary-crud-menu`'s already-implemented (but not yet archived) Dictionaries/Settings/Create/Update/Delete structure, per explicit direction — not against the currently-stale live spec on disk.

## Goals / Non-Goals

**Goals:**
- Make dictionary-wide word uniqueness (across Headwords and Inflections) actually race-safe at the database level, not just checked in application code.
- Reuse every existing convention this codebase already has (Zod DTOs in `packages/shared`, Fastify route/plugin shape, RFC 9457 error responses, react-hook-form + zodResolver forms, `ui/table.tsx` + `ui/dialog.tsx`, the `CommandDialog` picker pattern) rather than introducing parallel patterns.
- Keep the door open for a future resubmission/edit workflow without a data-model redesign.

**Non-Goals:**
- Building the entry-delete workflow, entry editing, or resubmission (see proposal.md - Impact, "Explicitly out of scope").
- Wiring into the build/generation pipeline, which doesn't exist in code yet.
- A public entry-browsing UI/API (`GET /api/series/:slug/entries` etc.) — `EntryCreationSpec.md` doesn't ask for one, so this change only builds what's needed for submission and approval.

## Decisions

**A new `SeriesWord` registry table, not just app-level checks, for cross-model uniqueness.** `Entry` has `@@unique([seriesId, headword])`; `Inflection` has `@@unique([entryId, value])` — neither can express uniqueness *across* the two models in one Postgres constraint (unique constraints are per-table). A normalized `SeriesWord` row is created for the entry's own headword and for each inflection, all within the same transaction as the entry: `id`, `seriesId` (+relation, cascade), `normalizedWord` (lowercased + trimmed), `entryId` (required, +relation, cascade — every word row belongs to an entry), `inflectionId` (optional, unique, set only for inflection-word rows), and `@@unique([seriesId, normalizedWord])`. This single index is the actual serialization point for the required race condition (proposal §11's User A/User B scenario): a concurrent insert of the same normalized word in the same series hits the DB constraint (Prisma surfaces this as `P2002`), not just a SELECT-then-INSERT check that a second concurrent request could slip past.
  *Alternative considered*: a partial/expression unique index spanning both `Entry.headword` and `Inflection.value` directly via raw SQL. Rejected — Postgres unique constraints/indexes are scoped to one table; there's no native way to enforce uniqueness jointly across two tables without a shared registry table (or a trigger, which is more complex and less debuggable than a plain unique index).

**Case-insensitive, whitespace-trimmed normalization.** No existing normalization/case-sensitivity rule was found anywhere in the codebase for word comparison (SPEC.md's `sortKey` is for alphabetization, a different concern). Per the source spec's own explicit fallback instruction, duplicate comparison is case-insensitive and ignores leading/trailing whitespace.

**Entry creation transaction shape**, mirroring `admin.ts`'s existing `prisma.$transaction(async (tx) => {...}, { isolationLevel: "Serializable" })` pattern (the only precedent for transactional race-safety in this codebase): create `Entry` (status `PENDING`) → create its `SeriesWord` rows (headword, then each inflection — a `P2002` here is the duplicate-word case, mapped to a `DomainError` and rolling back the whole transaction) → create the `Inflection` rows → create a `Revision` (`action: CREATE`, `snapshot` = the full entry state), per `SPEC.md`'s "every write to Entry or Inflection must create a Revision in the same transaction — no exceptions." Approve and Reject each run their own transaction: update `Entry` (`approvalStatus`, `reviewedById`, `reviewedAt`, and `rejectionNote` for Reject) + create a `Revision` (`action: UPDATE`).

**`approvalStatus` is a new field, orthogonal to the existing `status: EntryStatus` (PUBLISHED/DELETED).** They represent different concerns — `EntryStatus` is the soft-delete/publish lifecycle; the new `EntryApprovalStatus` (PENDING/APPROVED/REJECTED) is the review workflow. Reusing/overloading `EntryStatus` for both would conflate "this entry was deleted" with "this entry was rejected," which are different states with different implications (a deleted entry was once real content; a rejected entry never was). New entries default to `status: PUBLISHED, approvalStatus: PENDING` — `PUBLISHED` here only means "not soft-deleted," not "live in a generated dictionary." Whatever future code selects entries for generation must filter on `approvalStatus = APPROVED` — noted as a requirement for that future work, not implemented here since no generation query exists yet.

**New `requireAuth` Fastify plugin**, mirroring `requireAdmin.ts`'s exact shape (session → user lookup → `isActive` check) minus the role check. Every currently-gated route is either fully public or admin-only; this is the first "must be logged in, any role" write endpoint.

**New `packages/shared/src/sanitize.ts`** implements the exact allowlist `SPEC.md` §5.4 already specifies for `definitionHtml` (`p,b,i,em,strong,sup,sub,br,ul,ol,li,span,a[href="#eNNNN"]`), run on save. This is deliberately a different tool from `plainText()` (added in the XSS-hardening change): `plainText()` rejects *any* markup and is correct for `Headword` (true plain text); `definitionHtml` is meant to hold markup, so it needs strip-to-allowlist instead of reject-on-any-tag.

**Toast library: `sonner`.** No toast/notification convention exists anywhere in the web app today (confirmed via dependency and source search) and the source spec requires toasts in several places (save success, duplicate-inflection, approve/reject). `sonner` is a minimal, actively-maintained, Tailwind-friendly choice with no architectural footprint beyond one `<Toaster />` mounted in `main.tsx` alongside the existing providers — chosen over hand-rolling a toast system (not worth building from scratch for this) or a heavier library (nothing else here needs).

**Administration section is fully hidden from non-admins, not empty-shelf-gated.** Every other section in this menu keeps its header visible to all authenticated users, with the *shelf* content gated (see `navigation/app-menu`'s "Permission-Gated Shelf Content"). `EntryCreationSpec.md` explicitly requires the whole Administration section to be invisible to non-admins — a deliberate, spec-mandated exception to the general convention, implemented as a separate requirement rather than folding it into the shared shelf-gating requirement, so the distinction is explicit rather than accidental.

**Route-guard requirements live inside `entries/submission` and `entries/approval`, not a separate `navigation/route-guards` delta.** `dictionary-crud-menu` introduced `navigation/route-guards` as its own capability, but that capability doesn't exist in `openspec/specs/` yet (its delta is still unarchived) — the tooling's MODIFIED-requirements workflow requires locating the existing requirement in the live main spec, which doesn't exist yet for this capability. Rather than create a second, colliding "new capability" delta for `navigation/route-guards` that would need manual reconciliation whenever `dictionary-crud-menu` archives, each new route's guard behavior is specified directly within the capability it protects (`/entries/new` in `entries/submission`; `/admin/approval-queue` and the Entries▸Delete placeholder in `entries/approval`). Same behavior, no cross-change collision risk.

**`SPEC.md` update is an explicit task**, not a side effect — it declares itself authoritative and requires updates in the same PR as any diverging decision (§1 access table, §6 endpoint list, §4 schema excerpt).

## Risks / Trade-offs

- [`SeriesWord` is a new table with no existing precedent in this schema] → Mitigation: it's the standard technique for cross-table uniqueness in Postgres (a registry/junction table plus a unique index), not a novel pattern; kept minimal (four columns) and fully cascade-deleted from its owning `Entry`.
- [Serializable isolation on the entry-creation transaction adds contention/retry overhead under heavy concurrent writes to the same series] → Acceptable: entry submission is not a high-throughput path, and this mirrors the existing precedent in `admin.ts`. The `SeriesWord` unique index is the real safety net regardless of isolation level; Serializable is defense-in-depth matching established practice, not the sole mechanism.
- [Two new top-level menu sections change the shape of an already-recently-restructured menu] → Mitigation: additive only (no existing Dictionaries/Settings behavior changes beyond the Entries-aware wording in "Permission-Gated Shelf Content"), and this change should land after (or its archive step should be sequenced after) `dictionary-crud-menu`'s archive to avoid spec-sync conflicts.
- [`sonner` is a new runtime dependency] → Low risk: small, no server-side footprint, easy to remove/replace if it doesn't fit; there is no existing alternative to prefer instead.

## Migration Plan

One new Prisma migration: `EntryApprovalStatus` enum, new nullable `Entry` columns (`approvalStatus` with a default of `PENDING`, `submittedById`, `reviewedById`, `reviewedAt`, `rejectionNote`), and the new `SeriesWord` table. No backfill needed for `approvalStatus` beyond the column default, since no entries exist yet anywhere in the system (this is the first change that can create any). No rollback complexity beyond reverting the migration and the change.
