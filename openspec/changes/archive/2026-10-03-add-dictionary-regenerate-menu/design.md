## Context

See proposal.md - Why. The rebuild endpoint (`POST /api/series/:slug/rebuild`) already exists: admin-only, returns `202 { jobId }`, and enqueues a `dictionary-build` job with the same retry options the sweep uses. It acts on one series per request and has no rate limit. The app menu's Dictionaries shelf already has two admin actions, Update and Delete, that each open a searchable `CommandDialog` over the series list (fetched lazily, only while a dialog is open). This change adds a third dialog of the same kind.

## Goals / Non-Goals

**Goals:**
- Reuse the existing endpoint and the existing Update/Delete dialog pattern; no backend changes.

**Non-Goals:**
- Showing build progress or completion. The admin finds out a build finished the same way as today: the dictionary's "Updated" time on the Downloads page changes.
- Deduplicating repeated manual rebuild requests (see Risks).

## Decisions

**"All dictionaries" loops over the existing per-series endpoint on the client.** The dialog already has the full series list, so the client requests a rebuild for each one in parallel and waits for every request to settle (`Promise.allSettled`), not just the first failure. That way one failing request can't hide the others' successes, and the summary can report exact counts.
- *Alternative considered:* a new `POST /api/series/rebuild-all` endpoint. Rejected for now. The number of dictionaries is small, the per-series route has no rate limit, and a new endpoint would need its own auth, tests and spec change for no user-visible gain. Worth revisiting if the dictionary count grows into the hundreds.

**No confirmation dialog.** A rebuild never removes or edits content, and build retention keeps prior successful builds, so the worst case of a mis-click is some wasted worker time. This differs from Delete, which is destructive and keeps its confirmation.

**Feedback by toast, at the moment the request is accepted.** A queued build takes from seconds to a few minutes, so the toast says the new file "will be ready in a few minutes" instead of implying it is done. This uses the toast mechanism the rest of the app already uses (sonner).

**Menu placement:** after Delete, inside the existing admin-only block of the Dictionaries shelf, so non-admins never see it. The server still enforces admin-only, so hiding the item is a convenience, not the security boundary.

## Risks / Trade-offs

- [Manual rebuilds are not deduplicated by the endpoint; a double-click or two admins can queue duplicate builds for the same series] → Harmless: each build produces a complete, valid file and retention prunes old ones. The dialog closes on selection, which makes accidental repeats unlikely.
- ["All dictionaries" sends N parallel requests] → Acceptable at the current scale (a handful of dictionaries). The build worker's own concurrency limit, not the request fan-out, bounds how many builds run at once.
- [A partially failed "All" leaves some dictionaries rebuilt and others not] → The summary reports exact queued and failed counts, and re-running "All" is safe.
