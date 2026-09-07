## Context

See proposal.md — Why. Design-relevant current state, confirmed by reading the actual code:

- `apps/api/src/plugins/rateLimit.ts` registers `@fastify/rate-limit` with `global: false`, Redis-backed, `keyGenerator: (request) => request.ip` at the plugin level (the default, overridable per-route). Existing exported configs (`REGISTRATION_RATE_LIMIT`, `LOGIN_RATE_LIMIT`, etc., plus `SEARCH_RATE_LIMIT`) are all IP-keyed.
- `SPEC.md` line 622 already documents "60 writes/hour/user" alongside the IP-keyed tiers — this change implements exactly that, not a new policy.
- Full route inventory confirmed: entry creation (`entries.ts`, `preHandler: requireApproved`) and edit-proposal creation (`entryEditProposals.ts`, `preHandler: requireAuth`) are the only non-admin-gated mutation routes with no rate limit. Series create/update/delete (`series.ts`) and the manual-rebuild route (`downloads.ts`) are all `preHandler: requireAdmin` — confirmed by reading each route's registration directly, not assumed.
- `request.session.userId` (declared in `session.ts`'s `FastifySessionObject` module augmentation) is the stable authenticated identity already used by `requireAuth`/`requireApproved`. `@fastify/session` decorates `request.session` via an `onRequest` hook (confirmed in the installed package's `index.js`); `sessionPlugin` is registered before `rateLimitPlugin` in `index.ts`, so within the `onRequest` phase (same-phase hooks run in registration order) session decoration always completes before `@fastify/rate-limit`'s own check runs.
- `packages/shared/src/entries.ts`: `inflections: z.array(plainText({ max: 200, ... })).default([])` appears in both `createEntrySchema` and `submitEntryEditProposalSchema` — capping each string's length but not the array's. `definitionHtml` (`.max(5000)`) and `rejectEntrySchema.note` (`.max(2000)`) already use plain `.max(N, "message")` directly on their schema chain — the convention to match for an array-length cap.
- Both routes already call the shared schema's `.parse()` on the request body as their first action, before opening `prisma.$transaction(...)`. Entry creation's transaction (`Serializable` isolation) loops over `body.inflections` with two sequential awaited writes per element (`tx.inflection.create` + `tx.seriesWord.create`).

## Goals / Non-Goals

**Goals:**
- Implement the exact policy `SPEC.md` already documents (60 writes/hour/user) on the two routes that currently lack any rate limit and aren't admin-gated.
- Make an oversized `inflections` array fail at the existing validation step, before any transaction opens.

**Non-Goals:**
- Rate-limiting admin-only routes — confirmed out of scope per the user's explicit decision (already trust-gated by `requireAdmin`; a limit risks throttling legitimate bulk moderation).
- Changing the transaction/loop structure inside entry creation or `applyEditProposalToEntry` — the array-length cap makes the existing structure safe by bounding N, without needing to batch the writes or restructure the transaction.
- Setting a global Fastify `bodyLimit` — the finding's core risk (many small sequential DB writes from one request) is fully addressed by capping the array itself; a body-size limit would be a coarser, less targeted control and isn't required by the acceptance criteria.

## Decisions

### 1. `WRITE_RATE_LIMIT`: 60/hour, keyed by `session.userId` with an IP fallback

```ts
export const WRITE_RATE_LIMIT = {
  rateLimit: {
    max: 60,
    timeWindow: "1 hour",
    keyGenerator: (request) => request.session.userId ?? request.ip,
  },
} as const;
```

**Reasoning:** matches `SPEC.md`'s documented tier exactly. The IP fallback handles the case where `@fastify/rate-limit`'s `onRequest` check runs before the route's own `preHandler` auth guard — an unauthenticated request reaches the rate-limit check first (with no `session.userId` yet), and without a fallback the keyGenerator would need to handle `undefined`; falling back to IP for that sliver of traffic matches the finding's own suggested fix ("IP limits for anonymous boundaries") and costs nothing, since such a request is rejected by the route's `preHandler` immediately afterward regardless.

**Alternative — key only by IP, uniformly**: rejected; doesn't implement what `SPEC.md` actually documents, and would let a single user cycling through IPs (or many users behind one NAT/proxy) evade or share a budget, exactly the failure mode a user-keyed limit is meant to prevent.

### 2. Apply the new tier to exactly two routes; leave admin routes untouched

**Decision:** `{ config: WRITE_RATE_LIMIT }` on entry creation and edit-proposal creation only. No change to `series.ts` or the rebuild route.

**Reasoning:** confirmed by reading every mutation route's `preHandler` directly — series CRUD and rebuild are `requireAdmin`-gated, which the user explicitly decided should stay exempt from this tier. This isn't a scope gap: "all mutation routes have an explicit rate-limit policy" (acceptance criterion 1) is satisfied because every route now has a *deliberate* policy — the new tier for these two, or the admin-trust-boundary exemption for everything else — recorded here rather than left as silent omission.

### 3. `.max(50)` on both `inflections` schema fields

**Decision:** `z.array(plainText({ max: 200, ... })).max(50, "A dictionary entry can have at most 50 inflections.").default([])` (message text illustrative) in both `createEntrySchema` and `submitEntryEditProposalSchema`.

**Reasoning:** matches the file's existing `.max(N, "message")` convention. 50 is a generous ceiling for a real dictionary entry (plurals, verb forms, etc. rarely reach double digits) that only bites deliberately abusive payloads. This is a default assumption, not a hard product requirement — easy to tune later without a spec or design change if it proves wrong in practice.

**Why this alone satisfies "reject before opening a transaction":** both routes already `.parse()` the request body against these schemas as their first action. Adding `.max(50)` means an oversized array fails at that existing step — no new pre-check needs to be written; the existing validate-then-transact ordering just starts actually rejecting what it should.

## Risks / Trade-offs

- **[Risk]** A legitimate power user occasionally exceeding 60 writes/hour (e.g., a prolific approved contributor on a productive day) would be rate-limited. **Mitigation:** this is exactly the documented policy `SPEC.md` already commits to; not a new trade-off introduced by this change. If it proves too tight in practice, the `max` value is a one-line change with no spec impact (the spec requirement doesn't hardcode the number).
- **[Trade-off]** 50 is a somewhat arbitrary ceiling on `inflections`. **Mitigation:** flagged explicitly as an assumption in the proposal and here; the spec's scenarios describe the *behavior* (a finite maximum exists, oversized requests are rejected pre-write) without hardcoding 50 into the requirement text itself, so tuning the number later doesn't require a spec change.
- **[Risk]** The rate-limit `keyGenerator`'s IP fallback means an unauthenticated request to these routes is counted against an IP-keyed bucket that's otherwise unused by this tier — negligible in practice since such requests are immediately rejected by the route's own auth guard regardless of rate-limit outcome.

## Migration Plan

Purely an application-code change (new rate-limit config + two schema edits); no schema migration, no data change, no deployment-topology impact.

1. Land the `rateLimit.ts`, route, and schema changes together with their tests.
2. No operator action needed — deploys like any other code change.
3. No special post-deploy verification beyond normal test coverage.

Rollback: revert the change; both routes return to having no rate limit and no inflection-count cap, reinstating the documented finding.
