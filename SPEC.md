# SPEC.md — Kindle Series Dictionaries

> Project specification for Claude Code. Read this file before making changes.
> When a decision here conflicts with something in the codebase, this file wins —
> update it in the same PR rather than diverging from it.

---

## 1. What this is

A web application that hosts **custom Kindle dictionaries scoped to book series**.

Readers of, say, *The Wheel of Time* or *Malazan* constantly hit invented proper
nouns, places, and terminology that no stock Kindle dictionary knows. This app
lets a community collaboratively define those terms and then ships the result as
a sideloadable Kindle dictionary file, so long-pressing a word inside the book
shows the community definition.

**Two audiences, two access levels:**

| Action | Auth required |
|---|---|
| Browse series, browse entries, search | No |
| Download a generated dictionary | No |
| Register an account (starts Pending; see below) | No |
| Create a series | Yes (any account, Pending or Approved) |
| Submit a new entry (Pending until reviewed) | Approved user, or admin |
| Review the pending-entry queue, approve/reject entries | Admin only |
| Review pending registrations, approve/deny new accounts | Admin only |
| Configure Cloudflare Turnstile | Admin only |
| Rollback revisions, delete a series, ban users | Admin only |

Entry submission is **not** direct-write: a submitted entry starts in the
`PENDING` approval state (see §4, §6) and is excluded from generated
dictionary output until an admin approves it. Editing/deleting an existing
entry is unaffected by this and remains a plain authenticated write (§6) -
only *new* entries go through approval.

**Registration is also gated.** A new account starts `approvalStatus=PENDING`
and can browse/create series like any authenticated user, but cannot submit a
new entry until an admin approves the account (see §4, §6). Denying a
registration permanently deletes the account rather than storing a rejected
state. Registration optionally requires passing a Cloudflare Turnstile
challenge, configured by an admin (see §6, §10).

**Freshness contract:** a background worker regenerates each dictionary **at most
once per hour, and only if that dictionary changed** since its last successful
build. An untouched dictionary is never rebuilt.

---

## 2. Goals / non-goals

### Goals

- Correct, spec-compliant Kindle dictionary output (see §5) that actually works
  as a lookup source on real hardware.
- Zero-friction downloads; low-friction contribution.
- Full revision history on every entry, with attribution and admin rollback.
- Spoiler control: an entry can be marked as relevant only up to book *N* of a
  series, so a reader mid-series can build a spoiler-safe dictionary.
- Reproducible builds: same input entries → byte-identical output.

### Non-goals

- Not a general-purpose language dictionary. Series-specific vocabulary only.
- No EPUB/AZW ingestion or automatic term extraction in v1.
- No mobile apps. Responsive web only.
- No paid tiers, no payments.
- Not attempting to distribute dictionaries through the Kindle Store. Output is
  for **sideloading via USB or Send-to-Kindle** only.

---

## 3. Tech stack

**Backend**

- Node.js 22 LTS, TypeScript, ESM
- Fastify (HTTP), `zod` for request/response schemas, `fastify-type-provider-zod`
- PostgreSQL 16 + **Prisma** ORM
- **BullMQ + Redis 7** for background jobs *(see the note in §7 — the original
  brief said Hangfire, which is .NET-only; BullMQ is the Node equivalent and
  Bull Board provides the same dashboard experience)*
- Argon2id password hashing (`@node-rs/argon2`)
- Sessions: HTTP-only, `SameSite=Lax`, signed cookies backed by Redis
- Object storage: S3-compatible (MinIO locally, S3/R2 in prod) for build outputs

**Frontend**

- React 19 + TypeScript, Vite
- TanStack Router (file-based) + TanStack Query
- Tailwind CSS + shadcn/ui
- `react-hook-form` + `zod` resolvers, sharing schema definitions with the API
  via a `packages/shared` workspace

**Repo layout** — pnpm workspaces monorepo:

```
/apps
  /api        Fastify server + Prisma schema + route handlers
  /worker     BullMQ worker process (dictionary generation)
  /web        React SPA
/packages
  /shared     zod schemas, DTO types, constants shared by api/web
  /kindle     dictionary generator library (pure, no I/O) — see §5
/infra
  docker-compose.yml   postgres + redis + minio for local dev
```

`packages/kindle` must have **no dependency on Prisma, Fastify, or the
filesystem**. It takes plain objects in and returns a list of
`{ path, contents }` files out. This keeps it unit-testable and makes the golden-file
tests in §9 cheap.

---

## 4. Domain model

Prisma schema, abbreviated to the meaningful parts:

```prisma
model User {
  id                 String   @id @default(cuid())
  email              String   @unique          // stored lowercased; matching is case-insensitive
  username           String   @unique          // display casing preserved
  usernameNormalized String   @unique          // lowercased+trimmed, for case-insensitive uniqueness/login
  reasonForJoining   String?                    // required at registration, nullable for pre-existing accounts
  passwordHash       String
  role               Role     @default(MEMBER)   // MEMBER | ADMIN
  emailVerified      Boolean  @default(false)
  approvalStatus     UserApprovalStatus @default(PENDING) // PENDING | APPROVED — no REJECTED; a denied registration is deleted, not stored
  createdAt          DateTime @default(now())
  revisions          Revision[]
}

// Cloudflare Turnstile configuration - a single-purpose singleton row, not a
// general settings table. secretKeyEncrypted is AES-256-GCM at rest
// (apps/api/src/lib/crypto.ts, keyed by SETTINGS_ENCRYPTION_KEY) and is never
// returned by any API response - only a derived secretConfigured: boolean is.
model TurnstileSettings {
  id                 String   @id @default("singleton")
  enabled            Boolean  @default(false)
  siteKey            String?
  secretKeyEncrypted String?
  updatedAt          DateTime @updatedAt
  updatedById        String?
  updatedBy          User?    @relation(fields: [updatedById], references: [id], onDelete: SetNull)
}

model Series {
  id            String   @id @default(cuid())
  slug          String   @unique            // "wheel-of-time"
  title         String
  author        String?
  description   String?
  inLanguage    String   @default("en")     // ISO 639-1, → DictionaryInLanguage
  outLanguage   String   @default("en")     // ISO 639-1, → DictionaryOutLanguage
  books         Book[]                      // ordered, for spoiler scoping
  entries       Entry[]
  builds        Build[]
  contentHash   String?                     // see §7
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

model Book {
  id        String @id @default(cuid())
  seriesId  String
  series    Series @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  ordinal   Int                              // 1-based position in series
  title     String
  @@unique([seriesId, ordinal])
}

model Entry {
  id           String   @id @default(cuid())
  seriesId     String
  series       Series   @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  headword     String                        // display form, e.g. "Aes Sedai"
  lookupValue  String?                       // override for idx:orth value=""
  sortKey      String                        // normalized, for alphabetization
  definitionHtml String                      // sanitized subset — see §5.4
  partOfSpeech String?
  pronunciation String?
  inflections  Inflection[]
  spoilerAfterBook Int?                      // null = safe always
  status       EntryStatus @default(PUBLISHED) // PUBLISHED | DELETED
  revisions    Revision[]
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  // Submission/approval workflow - orthogonal to `status` above, which is
  // just the soft-delete/publish lifecycle. A PENDING entry is a normal,
  // non-deleted row; it is simply excluded from generated dictionary output
  // (see §7) until an admin approves it.
  approvalStatus EntryApprovalStatus @default(PENDING) // PENDING | APPROVED | REJECTED
  submittedById  String?
  submittedBy    User?    @relation("EntrySubmittedBy", fields: [submittedById], references: [id], onDelete: SetNull)
  reviewedById   String?
  reviewedBy     User?    @relation("EntryReviewedBy", fields: [reviewedById], references: [id], onDelete: SetNull)
  reviewedAt     DateTime?
  rejectionNote  String?

  @@unique([seriesId, headword])
  @@index([seriesId, sortKey])
}

model Inflection {
  id       String  @id @default(cuid())
  entryId  String
  entry    Entry   @relation(fields: [entryId], references: [id], onDelete: Cascade)
  value    String                            // → idx:iform value=""
  group    String?                           // → inflgrp (part of speech)
  name     String?                           // → name (inflection category)
  exact    Boolean @default(false)           // → exact="yes"
  @@unique([entryId, value])
}

// Registry of every word (Headword or Inflection) in a dictionary, used to
// enforce word uniqueness across both models with a single, race-safe
// database constraint - Postgres unique constraints can't span two separate
// tables otherwise. One row per headword and per inflection; cascade-deleted
// from its owning Entry.
model SeriesWord {
  id             String  @id @default(cuid())
  seriesId       String
  series         Series  @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  normalizedWord String                       // lowercased, trimmed
  entryId        String
  entry          Entry   @relation(fields: [entryId], references: [id], onDelete: Cascade)
  inflectionId   String? @unique
  inflection     Inflection? @relation(fields: [inflectionId], references: [id], onDelete: Cascade)
  @@unique([seriesId, normalizedWord])
}

// A staging area for a NOT-YET-APPLIED edit to an already-APPROVED entry -
// distinct from Revision (an append-only audit log of changes that already
// happened). At most one PENDING proposal per entry, enforced by a partial
// unique index on (entryId) WHERE status = 'PENDING'. baseEntryUpdatedAt is
// captured server-side at submission time and re-checked against the
// entry's current updatedAt at approval time, to detect the entry having
// changed underneath a pending proposal (optimistic concurrency, no
// separate version column).
model EntryEditProposal {
  id                     String   @id @default(cuid())
  entryId                String
  entry                  Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  proposedDefinitionHtml String                       // proposed replacement, sanitized subset - see §5.4
  inflections            EntryEditProposalInflection[] // proposed replacement inflection set
  baseEntryUpdatedAt     DateTime                      // Entry.updatedAt at submission time - concurrency token
  status                 EntryEditProposalStatus @default(PENDING) // PENDING | APPROVED | REJECTED
  submittedById          String?
  submittedBy            User?    @relation("EntryEditProposalSubmittedBy", fields: [submittedById], references: [id], onDelete: SetNull)
  reviewedById           String?
  reviewedBy             User?    @relation("EntryEditProposalReviewedBy", fields: [reviewedById], references: [id], onDelete: SetNull)
  reviewedAt             DateTime?
  rejectionNote          String?
  createdAt              DateTime @default(now())
}

model EntryEditProposalInflection {
  id         String @id @default(cuid())
  proposalId String
  proposal   EntryEditProposal @relation(fields: [proposalId], references: [id], onDelete: Cascade)
  value      String
  @@index([proposalId])
}

model Revision {
  id        String   @id @default(cuid())
  entryId   String
  entry     Entry    @relation(fields: [entryId], references: [id], onDelete: Cascade)
  authorId  String?
  author    User?    @relation(fields: [authorId], references: [id], onDelete: SetNull)
  action    RevisionAction                   // CREATE | UPDATE | DELETE | ROLLBACK
  snapshot  Json                             // full entry state after the change
  comment   String?
  createdAt DateTime @default(now())
  @@index([entryId, createdAt])
}

model Build {
  id          String     @id @default(cuid())
  seriesId    String
  series      Series     @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  status      BuildStatus                    // QUEUED | RUNNING | SUCCESS | FAILED
  contentHash String                         // hash of the inputs this build used
  entryCount  Int
  epubKey     String?                        // object storage key
  epubBytes   Int?
  sourceKey   String?                        // .zip of raw OPF/XHTML sources
  log         String?
  error       String?
  startedAt   DateTime?
  finishedAt  DateTime?
  createdAt   DateTime   @default(now())
  @@index([seriesId, createdAt])
}
```

**Every write to `Entry` or `Inflection` must create a `Revision` in the same
transaction.** No exceptions — the audit log is the safety net for the open-wiki
edit model.

---

## 5. Kindle dictionary format

This is the part that is easy to get subtly wrong. Source of truth:
<https://kdp.amazon.com/en_US/help/topic/G2HXJS944GL88DNV>

### 5.1 Output shape

A Kindle dictionary is an **EPUB** whose content documents use Amazon's `idx:`
extension tags, plus an OPF carrying dictionary-specific `x-metadata`. Amazon's
Kindle Previewer converts that EPUB into the `.mobi` that a device accepts as a
lookup source.

`packages/kindle` emits the EPUB. The `.mobi` conversion is a documented manual
step (§5.6) — Kindle Previewer is a Mac/Windows GUI app and is not something we
run on a Linux worker.

### 5.2 Content document skeleton

Every content XHTML file:

```html
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:idx="https://kindlegen.s3.amazonaws.com/AmazonKindlePublishingGuidelines.pdf"
      xmlns:mbp="https://kindlegen.s3.amazonaws.com/AmazonKindlePublishingGuidelines.pdf">
  <head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"/></head>
  <body>
    <mbp:frameset>
      <!-- entries go here -->
    </mbp:frameset>
  </body>
</html>
```

`<mbp:frameset>` **must be the first child of `<body>`**. Entries live inside it.

### 5.3 Entry markup

```html
<idx:entry name="series" scriptable="yes" spell="yes" id="e0042">
  <idx:orth value="Aes Sedai">
    <b>Aes Sedai</b>
    <idx:infl>
      <idx:iform value="Aes Sedai's" />
      <idx:iform value="Aes-Sedai" />
    </idx:infl>
  </idx:orth>
  <p><i>n.</i> A channeler bound to the White Tower by the Three Oaths.</p>
</idx:entry>
<hr/>
```

Rules the generator enforces:

- `name` on every `idx:entry` equals the OPF `DefaultLookupIndex` value. Use the
  literal string `series` throughout.
- `scriptable="yes"` and `spell="yes"` on every entry. `spell` enables wildcard
  search and fuzzy correction, which matters a lot for invented names.
- `id` is a stable, sequential, deterministic identifier (`e` + zero-padded index
  in sort order) so builds are reproducible and cross-references resolve.
- `idx:orth` carries an explicit `value` attribute whenever the display headword
  contains markup, punctuation, superscripts, or diacritics — the `value` is the
  lookup form, the element body is the display form. Populate it from
  `Entry.lookupValue ?? Entry.headword`.
- `idx:infl` is nested **inside** `idx:orth`, wrapping `idx:iform` elements
  (self-closing). Emit `inflgrp`, `name`, and `exact="yes"` only when the
  corresponding `Inflection` fields are set.
  > ⚠️ Amazon's own materials are inconsistent here: the Kindle Publishing
  > Guidelines PDF nests `idx:infl` inside `idx:orth`, while some KDP help-page
  > examples show it as a sibling inside `idx:entry`. We emit the nested form.
  > **Confirm on a physical device during milestone 8** and, if inflection lookup
  > fails, flip the generator to the sibling form — it's a one-line change in
  > `packages/kindle` and the golden files will show the diff clearly.
- Headword first, bold, flush left, on its own line. `<hr/>` between entries.
- One XHTML file per initial letter (`content-a.xhtml`, …). Amazon documents
  build failures on single oversized XHTML files, and per-letter splitting also
  satisfies their "new page for each alphabetic section" guidance.

### 5.4 Definition HTML — allowed subset

`definitionHtml` is user-submitted and is sanitized **on write** (not on render)
with a strict allowlist. Amazon's guidelines rule several things out, so the
allowlist is deliberately narrow:

- **Allowed:** `p`, `b`, `i`, `em`, `strong`, `sup`, `sub`, `br`, `ul`, `ol`,
  `li`, `span`, and `a` with an internal `href="#e0042"` cross-reference only.
- **Forbidden:** `img`, `table`, `div`, `style`, `script`, any inline `style`
  attribute, any external URL, any font color / size / typeface. Multi-column
  layouts and sidebars are unsupported by the format.
- Sanitizer lives in `packages/shared/sanitize.ts` and is used by both the API
  (on save) and the generator (as a defensive second pass).

Store sanitized HTML. Never trust what came in.

### 5.5 OPF

```xml
<package version="2.0" xmlns="http://www.idpf.org/2007/opf" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/"
            xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>The Wheel of Time — Series Dictionary</dc:title>
    <dc:creator opf:role="aut">Kindle Series Dictionaries contributors</dc:creator>
    <dc:language>en</dc:language>
    <dc:identifier id="uid">urn:uuid:…</dc:identifier>
    <dc:date>2026-08-21</dc:date>
    <x-metadata>
      <DictionaryInLanguage>en</DictionaryInLanguage>
      <DictionaryOutLanguage>en</DictionaryOutLanguage>
      <DefaultLookupIndex>series</DefaultLookupIndex>
    </x-metadata>
  </metadata>
  <manifest>…</manifest>
  <spine>…</spine>
</package>
```

- `DictionaryInLanguage` = language of the *books*; `DictionaryOutLanguage` =
  language of the *definitions*. Both ISO 639-1, regional variants (`en-us`,
  `en-gb`) permitted. Sourced from `Series.inLanguage` / `Series.outLanguage`.
- `DefaultLookupIndex` is required and must match the `name` on every entry.
- `dc:identifier` is derived deterministically from the series ID — a stable UUIDv5
  — so rebuilds do not produce a "new" dictionary on the device each hour.
- Spine order: cover → about → `content-a` … `content-z` → `content-other`.

### 5.6 MOBI conversion (manual, documented)

The worker produces `dictionary.epub` plus `sources.zip`. The download page shows
a short "Make a .mobi" panel:

1. Download the `.epub`.
2. Open Kindle Previewer 3, **File → Open**, select the EPUB, let it convert.
3. **File → Export** the resulting `.mobi`.
4. Copy the `.mobi` to the Kindle's `documents/dictionaries/` folder over USB.
5. On the device: **Settings → Language & Dictionaries → Dictionaries** and set
   the new dictionary as default for the relevant language.

Two caveats to surface in that panel, both from Amazon's guidance:

- Lookup behavior **cannot be verified in Kindle Previewer** — it only renders.
  Real testing requires a device.
- **Enhanced Typesetting is not supported for dictionaries.** Do not enable it.

*(If we later want end-to-end `.mobi`, the escape hatch is a Windows CI runner
invoking Kindle Previewer's CLI. Out of scope for v1; do not build a Wine-based
container.)*

---

## 6. HTTP API

REST, JSON, mounted at `/api`. All request and response bodies validated by zod
schemas exported from `packages/shared`.

### Auth

```
POST   /api/auth/register        { email, username, reasonForJoining, password, turnstileToken? }
                                  starts approvalStatus=PENDING; email/username matched case-insensitively;
                                  turnstileToken required+verified only when Turnstile is enabled (see below)
POST   /api/auth/login           { identifier, password }  identifier = username or email, case-insensitive
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/verify-email    { token }
POST   /api/auth/forgot-password { identifier }  identifier = username or email, same convention
                                  as login; always responds with the same generic message
                                  regardless of match, to avoid account enumeration
POST   /api/auth/reset-password  { token, password }  single-use, time-limited token; does not
                                  establish a session on success
```

### Public reads

```
GET    /api/series                       ?q=&page=&limit=
GET    /api/series/:slug
GET    /api/series/:slug/entries         ?q=&letter=&maxBook=&page=&limit=
GET    /api/series/:slug/entries/:id
GET    /api/series/:slug/entries/:id/revisions
GET    /api/entries/:id                  public entry detail (by id, not scoped to a series slug);
                                          PENDING entries are visible with a "pending review" banner,
                                          REJECTED/DELETED entries 404
GET    /api/series/:slug/builds          latest N builds, newest first
GET    /api/series/:slug/download        302 → presigned URL for latest SUCCESS build; filename
                                          <Title>_<ddMMMyyyyhhmm>.epub (build completion time, 24h)
GET    /api/series/:slug/download/source 302 → presigned URL for sources.zip
GET    /api/downloads                    { slug, title }[] for every series with a SUCCESS build,
                                          ordered by title — backs the all-dictionaries download page
GET    /api/search                       ?q=&page= — cross-dictionary search (the homepage);
                                          case-insensitive substring match against every entry's
                                          headword and inflections; multi-word queries OR-match,
                                          favoring earlier words in ranking; 50 results/page;
                                          PUBLISHED + APPROVED entries only
```

### Authenticated writes

```
POST   /api/series                       create series (+ books)
PATCH  /api/series/:slug
POST   /api/series/:slug/entries         submit a new entry; starts approvalStatus=PENDING, except an
                                          administrator's own submission is saved as APPROVED immediately,
                                          self-reviewed (reviewedById/reviewedAt set to that admin)
GET    /api/series/:slug/entries/words   existing headwords + inflections in the dictionary, for client-side duplicate-word checks
PATCH  /api/series/:slug/entries/:id
DELETE /api/series/:slug/entries/:id      soft delete → status=DELETED + Revision
POST   /api/series/:slug/rebuild          admin only; enqueue immediate build
POST   /api/series/:slug/entries/:id/rollback  { revisionId } — admin only
POST   /api/entries/:id/edit-proposals    { definitionHtml, inflections } — propose an edit to an
                                           APPROVED entry; requires auth; entry stays authoritative
                                           and unchanged while the proposal is pending review; at
                                           most one pending proposal per entry (enforced by a partial
                                           unique index, not just an application check), enforced
                                           identically for an administrator's own submission - an
                                           admin does not bypass or replace another pending proposal.
                                           An administrator's own submission is instead applied to the
                                           entry immediately in the same request, self-reviewed; the
                                           response's `status` field distinguishes PENDING from this
                                           immediate APPROVED outcome
```

### Admin: entry approval queue

```
GET    /api/admin/entries/pending             entries with approvalStatus=PENDING, oldest first
GET    /api/admin/entries/:id                 full entry detail (for the review dialog)
POST   /api/admin/entries/:id/approve         approvalStatus → APPROVED
POST   /api/admin/entries/:id/reject          { note? } — approvalStatus → REJECTED

GET    /api/admin/review-queue                 merged queue: pending new-entry submissions AND
                                                pending edit proposals together, oldest first
                                                (discriminated by a `type: "NEW_ENTRY" | "EDIT"` field)
GET    /api/admin/entry-edit-proposals/:id     full proposal detail (current vs. proposed, for the
                                                review dialog)
POST   /api/admin/entry-edit-proposals/:id/approve
                                                applies the proposed Definition/Inflections to the
                                                entry + writes a Revision, in one transaction; fails
                                                with 409 if the entry changed since the proposal was
                                                submitted (`updatedAt` mismatch) or if a proposed
                                                inflection now collides with another entry's word
POST   /api/admin/entry-edit-proposals/:id/reject
                                                { note? } — entry is left untouched
```

### Admin: registration approval

```
GET    /api/admin/users/pending               users with approvalStatus=PENDING, oldest first
POST   /api/admin/users/:id/approve           approvalStatus → APPROVED
POST   /api/admin/users/:id/deny              permanently deletes the account (no REJECTED state)
```

`GET /api/admin/users` (existing users list) excludes Pending accounts — they
appear only in the pending-registrations list above until reviewed.

### Turnstile

```
GET    /api/turnstile/config                  public; { enabled, siteKey }; siteKey is null when disabled
GET    /api/admin/turnstile                   admin only; { enabled, siteKey, secretConfigured, updatedAt }
PATCH  /api/admin/turnstile                   admin only; { enabled, siteKey, secretKey? }
                                               secretKey re-encrypts and overwrites the stored secret only
                                               when non-blank; omitted/blank leaves it unchanged
POST   /api/admin/turnstile/test              admin only; { success } — checks the stored secret is
                                               recognized by Cloudflare without fabricating a full verification
```

### Conventions

- Errors: RFC 9457 `application/problem+json`.
- Optimistic concurrency on entry `PATCH`: client sends `If-Match` with the
  entry's `updatedAt`; mismatch → `409` with the current server state so the UI
  can show a diff.
- Rate limits: 5 registrations/hour/IP, 10 logins/15min/IP, 60 writes/hour/user,
  300 reads/min/IP, 60 searches/min/IP (`GET /api/search` — a public,
  arbitrary-input, cross-table search gets its own tighter tier rather than
  the general read limit). Downloads are uncapped but served via presigned
  URLs so bandwidth leaves the app server.
- Pagination is cursor-based on `(sortKey, id)`; `limit` caps at 200.

---

## 7. Background jobs (BullMQ)

> **Naming note.** The original brief asked for Hangfire. Hangfire is a .NET
> library with no Node port. BullMQ is the direct equivalent in this stack:
> Redis-backed persistent queues, cron-style repeatable jobs, automatic retries
> with backoff, concurrency limits, and — via **Bull Board** mounted at
> `/admin/jobs` — the same dashboard-with-a-retry-button experience Hangfire
> gives you. Where the codebase needs a word for this concept, use "job queue",
> not "Hangfire".

### Queues

| Queue | Purpose |
|---|---|
| `dictionary-build` | Generate one series' dictionary. Concurrency 2. |
| `maintenance` | Prune old builds, expire tokens. |

### The hourly sweep

A repeatable job `sweep-changed-series` runs at `0 * * * *`:

1. For each series, compute `contentHash` = SHA-256 over the canonical
   serialization of every `PUBLISHED` entry (id, headword, lookupValue,
   sortKey, definitionHtml, partOfSpeech, pronunciation, spoilerAfterBook, and
   all inflections), sorted by `sortKey`, plus the series' own OPF-relevant
   fields (`title`, `inLanguage`, `outLanguage`, book list).
2. Compare with the `contentHash` of the most recent `SUCCESS` build.
3. **Equal → skip.** No job enqueued, nothing written. This is the "only if there
   were any changes" requirement, and it is the common case.
4. Different → enqueue `dictionary-build` with `jobId = ${seriesId}-${hash}`.
   (BullMQ rejects `:` in custom job ids, so the delimiter is `-`, not `:`.)
   The deterministic `jobId` makes enqueueing idempotent: a series edited twelve
   times in an hour still builds once.

Only the hash comparison decides whether to build. Do not use `Series.updatedAt`
as the trigger — a no-op edit that reverts a typo would otherwise cause a
pointless rebuild, and formatting-only changes to unrelated columns would too.

### The build job

1. Mark `Build` `RUNNING`.
2. Load all published entries + inflections for the series (`status=PUBLISHED`
   **and** `approvalStatus=APPROVED` - a Pending or Rejected entry is never
   included, even if otherwise published), ordered by `sortKey`.
3. Call `packages/kindle` → in-memory file list.
4. Zip into `dictionary.epub` (mimetype entry first, **stored uncompressed**, per
   EPUB OCF) and `sources.zip`.
5. Upload both to object storage under `builds/{seriesId}/{buildId}/`.
6. Mark `SUCCESS`, record `contentHash`, `entryCount`, byte sizes.
7. On throw: mark `FAILED` with the error and stack in `Build.error`. BullMQ
   retries 3× with exponential backoff. The previous successful build stays as
   the live download — **a failed build must never take a working dictionary
   offline.**

Retention: keep the 10 most recent successful builds per series, delete older
objects in the `maintenance` queue. Never delete the newest.

---

## 8. Frontend

### Routes

```
/                                   Homepage: Google-style search over every dictionary's entries
                                    (`?q=&page=`), public/no-auth; centered search box when no
                                    query, a Dictionary/Word results grid (bolded matched
                                    headword/inflections, definition excerpt, pagination) once
                                    a query is present; a "Download the latest dictionaries" link
                                    beneath the search box (landing view only) leads to /downloads
/downloads                          All-dictionaries download page: every series with a SUCCESS
                                    build, each with a direct .epub download link; public/no-auth
/series/:slug                       Title/description, download links (.epub + sources.zip), and
                                    "Make a .mobi" instructions; public/no-auth. Minimal for now —
                                    no entry browser or live build-status badge yet (§7's build
                                    pipeline exists; the UI for it is future work)
/series/:slug/entries/:id           Entry detail + revision history
/series/:slug/entries/:id/edit      Editor for an existing entry (auth)
/entries/$id                        Public entry detail (view/edit toggle) - reachable from search
                                    results; PENDING entries show with a "pending review" banner,
                                    REJECTED/DELETED 404; Edit button (auth, APPROVED entries only)
                                    submits a pending edit proposal for Definition + Inflections
                                    (Headword is never editable) rather than writing the entry directly
/entries/new                        Add Entry - dictionary picker + Headword/Definition/Inflections (auth); saves as Pending
/entries/delete                     Placeholder only, no workflow yet (admin)
/series/new                         Series creation (auth)
/login                               Sign In / Register tabs, plus a `?mode=forgot-password` mode
                                    reached via a "Forgot Password?" link on the Sign In form
/reset-password                     Reached via the emailed reset link (`?token=...`); sets a new
                                    password, then redirects to `/login`; invalid/expired token
                                    shows a clear message instead of a broken form
/admin                              Builds, users, pending registrations, job dashboard link (admin)
/admin/approval-queue               Merged queue of pending new-entry submissions and pending edit
                                    proposals, oldest first, with a Type badge; approve/reject each
                                    from the same table (admin)
/admin/turnstile                    Cloudflare Turnstile configuration (admin)
```

### Notes

- **Anonymous browsing is first-class.** Nothing about entry reading or
  downloading may be behind a modal, an interstitial, or a "sign up to continue".
  The login prompt appears only when an edit action is taken.
- The entry editor is a **constrained rich-text field**, not a free HTML box: bold,
  italic, superscript, subscript, lists, internal cross-reference link. The
  toolbar should offer exactly what §5.4 permits and nothing more — the format's
  limits are a UI constraint, not just a validation error.
- Inflections are edited as a chip list with an optional group/name per chip.
  Include a "generate common English forms" helper (plural, possessive,
  hyphenated variant) that pre-fills chips the user can delete.
- The series page shows a live build badge: *Up to date · rebuilt 14 min ago* /
  *Changes pending — next rebuild at 3:00 PM* / *Last build failed, serving the
  previous version*. Poll `/builds` every 60s while the tab is focused.
- The spoiler control is a slider ("I've read through book ___") that filters the
  entry list client-side and is passed as `maxBook` to the download endpoint,
  which serves a filtered variant build. Default: show everything, with the
  slider prominent and unset.
- Accessibility: keyboard-navigable entry list, visible focus rings, WCAG AA
  contrast, `aria-live` on build status changes.

---

## 9. Testing

- **Unit** (Vitest) — `packages/kindle` generator, the sanitizer, `sortKey`
  normalization (diacritics, apostrophes, leading articles), `contentHash`
  determinism.
- **Golden files** — a fixture series with a handful of entries covering accents,
  apostrophes, superscripts, multi-word headwords, inflection groups, and a
  cross-reference. Snapshot the full generated EPUB tree. Any diff must be
  reviewed by a human — this is the main defense against silently breaking the
  Kindle format.
- **XML validity** — every generated XHTML/OPF parsed with a strict XML parser in
  CI. `idx:` and `mbp:` namespaces must be declared; malformed output fails the build.
- **Integration** (Vitest) — API routes exercised via `app.inject()` against the
  real dev-stack Postgres, Redis, and MinIO (no mocking, no Testcontainers — this
  project runs its test suite against the same docker-compose services used for
  local development). Cover: anonymous download works; anonymous write returns
  401; every entry mutation writes exactly one Revision; `If-Match` conflict
  returns 409.
- **Sweep logic** — unchanged series enqueues nothing; changed series enqueues
  once; twelve rapid edits collapse to one job via the deterministic `jobId`.
- **E2E** (Playwright) — register → create series → add entry → force rebuild →
  download EPUB → assert the ZIP contains the entry's headword.
- **Manual, per release** — sideload the generated `.mobi` on a physical Kindle
  and confirm long-press lookup resolves a headword and one inflected form.
  Nothing in CI can substitute for this; the format's failure mode is a
  dictionary that installs fine and silently never matches.

---

## 10. Local development

```bash
pnpm install
docker compose -f infra/docker-compose.yml up -d   # postgres, redis, minio, mailpit
pnpm --filter api prisma migrate dev
pnpm --filter api seed                              # 2 series, ~50 entries
pnpm dev                                            # api :3000, worker, web :5173
```

`.env` (see `.env.example`):

```
DATABASE_URL=postgresql://…
REDIS_URL=redis://localhost:6379
SESSION_SECRET=…
SETTINGS_ENCRYPTION_KEY=…        # AES-256-GCM key for encrypted-at-rest admin settings (Turnstile Secret Key)
S3_ENDPOINT=http://localhost:9000
S3_BUCKET=dictionaries
S3_ACCESS_KEY_ID=…
S3_SECRET_ACCESS_KEY=…
PUBLIC_BASE_URL=http://localhost:5173
SMTP_URL=…                # verification + password reset
BUILD_CRON=0 * * * *      # override for local testing
```

Conventions: ESLint + Prettier, `pnpm typecheck` clean before commit, Conventional
Commits, no `any` outside `.d.ts` shims.

---

## 11. Milestones

1. **Scaffold** — monorepo, Prisma schema, migrations, docker-compose, seed data.
2. **Auth** — register/login/logout/session, email verification, password reset,
   rate limits.
3. **CRUD + revisions** — series/entry/inflection endpoints, sanitizer, revision
   writes in-transaction, optimistic concurrency.
4. **Generator** — `packages/kindle`, golden-file tests, XML validity checks.
   *Ship this before the worker; the generator is the risky part.*
5. **Jobs** — BullMQ queues, hourly hash sweep, build job, S3 upload, Bull Board.
6. **Web** — public browse + download, then the authenticated editor.
7. **Polish** — spoiler filtering, build status UI, admin screens, retention job.
8. **Hardware validation** — sideload on a real Kindle, fix whatever the device
   rejects, then tag v1.

---

## 12. Open questions

- Should a spoiler-filtered download be a **separate build artifact per cutoff**
  (N builds per series, more storage, instant download) or **generated on demand**
  (slower first request, cacheable)? Leaning per-cutoff builds since series have
  few books, but revisit if a series has >15 books.
- Cross-references between entries: full `<a href="#eNNNN">` linking requires all
  entries in one spine, which conflicts with per-letter file splitting. Verify on
  device whether cross-file anchors resolve before committing to the split.
- Licensing of contributed definitions — CC BY-SA is the likely answer, but it
  needs to be decided and shown at registration before the first outside
  contributor arrives.
- Do we need per-series moderation later? The v1 model is open-wiki with an audit
  log; the schema supports adding a maintainer table without migration pain.

---

## 13. Reference

- Amazon KDP, *Create a Custom Kindle Dictionary*:
  <https://kdp.amazon.com/en_US/help/topic/G2HXJS944GL88DNV>
- Kindle Previewer: <https://kdp.amazon.com/en_US/help/topic/G202131170>
