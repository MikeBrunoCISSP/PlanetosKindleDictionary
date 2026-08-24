## Context

See proposal.md for motivation. The API currently has no in-process shared state that would break under horizontal scaling. The following infrastructure is already multi-node safe:

| Concern | Implementation | Safe |
|---|---|---|
| Session storage | Redis via `connect-redis` (`apps/api/src/plugins/session.ts`) | ✅ |
| Rate limiting | `@fastify/rate-limit` with `redis` option (`apps/api/src/plugins/rateLimit.ts`) | ✅ |
| Slug collision on series create | P2002 retry loop — DB unique constraint is the arbiter | ✅ |
| In-process state | None (no caches, no singletons beyond PrismaClient) | ✅ |

The three remaining issues are all TOCTOU races in database access: a read is used to decide whether to proceed with a write, but the two operations are not atomic.

## Goals / Non-Goals

**Goals:**
- Fix the three TOCTOU races so all database invariants hold under concurrent access from any number of nodes.
- Introduce a shared `isPrismaError` helper to keep Prisma error code checks consistent.

**Non-Goals:**
- Adding infrastructure for running multiple nodes (load balancer, container orchestration) — that is a deployment concern.
- Connection pool tuning for multi-node scale — acceptable to leave at defaults for now.
- Caching layer or read replicas.

## Decisions

**Decision: Serializable transaction for the last-admin guard (`PATCH /api/admin/users/:id`)**

The `count` + `update` pair must be atomic. A serializable transaction in PostgreSQL ensures that if two concurrent transactions both read the count, at most one can commit — the other will be aborted with a serialization failure and must retry (or surface a 409 to the client).

Implementation: `prisma.$transaction(async (tx) => { ... }, { isolationLevel: 'Serializable' })`. The entire handler body (target lookup, last-admin count check, update) moves inside the transaction so all reads are part of the same snapshot.

*Alternative considered: advisory locks (`SELECT pg_advisory_xact_lock(...)`).*  
Rejected — advisory locks are more complex to use correctly and require raw SQL. Serializable isolation is simpler and better matches the semantics we want.

*Alternative considered: optimistic concurrency with a version counter on the User model.*  
Rejected — adds a migration and schema change for a case that is extremely rare in practice. Serializable isolation costs nothing in schema.

**Decision: P2002 catch on `prisma.user.create` for registration**

The existing `findFirst` duplicate pre-check stays (it provides the "which field" differentiation for the common case), but a P2002 catch on `create` is the atomic safety net for the concurrent case. The Prisma error includes `meta.target` (an array of field names in the violated constraint), so we can still return the right error code for email vs. displayName.

*Alternative considered: wrap `findFirst` + `create` in a serializable transaction.*  
Rejected — more complex than needed. The DB unique constraints already provide the atomic enforcement; we only need to handle the error correctly.

**Decision: Remove existence pre-check from series PATCH; catch P2025**

`PATCH /api/series/:slug` currently does `findUnique` then `update`. Removing the pre-check and catching Prisma P2025 ("record not found to update") on the `update` call is both simpler and safe under concurrent deletes. This is also a straightforward simplification independent of multi-node concerns.

**Decision: `isPrismaError(err, code)` helper in `apps/api/src/lib/errors.ts`**

Checking Prisma error codes inline (casting to `{ code: string }`) is already in `series.ts`. Extracting a typed helper avoids repeating the cast and centralizes the check. It belongs in `errors.ts` alongside the existing `Errors` namespace.

## Risks / Trade-offs

- [Risk] Serializable transactions on the admin update path add overhead. → Mitigation: admin user updates are extremely infrequent; the overhead is negligible.
- [Risk] `meta.target` shape from Prisma P2002 errors depends on the Prisma version and adapter. → Mitigation: log the raw `meta` on unexpected shapes and fall back to a generic 409 rather than crashing.
- [Risk] Prisma P2025 error code may not be thrown by `update` in all adapter versions. → Mitigation: use `isPrismaError` with a fallback `throw err` so unknown errors propagate normally.
