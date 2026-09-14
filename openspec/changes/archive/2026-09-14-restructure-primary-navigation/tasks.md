## 1. Extract and rewire the downloads/search/home routes

- [x] 1.1 Create `apps/web/src/components/DownloadsPageContent.tsx` by moving `downloads.tsx`'s `DownloadsPage` function body into it as an exported `DownloadsPageContent` component (same JSX, same `useQuery`/`apiGetDownloads` logic, same `<KindleConversionInstructions />`). Verify by confirming the file exports a component with no route-specific (`Route.useSearch()` etc.) dependencies.
- [x] 1.2 Update `apps/web/src/routes/downloads.tsx` to import and render `DownloadsPageContent` instead of its own inline component, keeping `createFileRoute("/downloads")`. Verify the file has no remaining duplicated JSX.
- [x] 1.3 Create `apps/web/src/routes/search.tsx`: copy today's `index.tsx` content verbatim (the `homeSearchSchema`, `IndexPage` component renamed to a page component for this route, the "eReader Dictionaries" heading, search box, and results view), with `createFileRoute("/search")`. Update its two `navigate({ to: "/", ... })` calls (submit handler and dictionary-filter change handler) to `to: "/search"`. Verify by running the dev server and confirming `/search` renders and searches exactly as `/` does today.
- [x] 1.4 Update `apps/web/src/components/SearchResults.tsx`'s `goToPage` function: change `navigate({ to: "/", ... })` to `navigate({ to: "/search", ... })`. Verify pagination on `/search` moves between pages without navigating away from `/search`.
- [x] 1.5 Replace `apps/web/src/routes/index.tsx` with a thin route rendering `DownloadsPageContent` at `createFileRoute("/")`, removing the old search UI and the "Download the latest dictionaries" link entirely (superseded — see the `dictionary-management/downloads` delta). Verify `/` and `/downloads` render identically.
- [x] 1.6 Run `pnpm --filter @planetos/web exec tsc --noEmit` and confirm no route-tree or import errors from the file moves.

## 2. Add the top menu strip

- [x] 2.1 Create `apps/web/src/components/TopMenuStrip.tsx`: a `<nav>` with four links (Downloads → `/downloads`, Search → `/search`, Create → computed via `useMe()` per design.md, Help → `/contact`), styled consistently with the existing header (reuse `AppHeader.tsx`'s Tailwind conventions), with `overflow-x: auto` so it scrolls within itself rather than the page on narrow viewports. Verify by rendering it standalone and resizing to ~380px width with Playwright — confirm no page-level horizontal scrollbar appears.
- [x] 2.2 Render `<TopMenuStrip />` in `apps/web/src/routes/__root.tsx` directly beneath `<AppHeader />`. Verify it appears on `/`, `/search`, and `/contact`.
- [x] 2.3 Create `apps/web/src/routes/get-involved.tsx` (`createFileRoute("/get-involved")`): static page explaining the registration/approval requirement, with a `useMe()`-driven copy swap (register/login CTA when signed out, "awaiting approval" note when signed in but Pending). No route guard. Verify by viewing it while signed out and while signed in as a Pending user (via Playwright), confirming the copy differs as specified.
- [x] 2.4 Wire up the "Create" link's eligibility logic in `TopMenuStrip.tsx` exactly as design.md specifies (`me != null && (me.role === "ADMIN" || me.approvalStatus === "APPROVED")` → `/entries/new`, else → `/get-involved`). Verify with Playwright across all four roles from the approved mock (anonymous, pending, approved, admin).

## 3. Add "Search" to the hamburger menu

- [x] 3.1 In `apps/web/src/components/AppHeader.tsx`'s `AppMenu`, add a "Search" `DropdownMenuItem` as the first item in the Entries shelf (above "Add"), navigating to `/search`, using the same `pl-6` styling as the existing items. Verify by opening the hamburger menu as a signed-in member and confirming "Search" appears above "Add"; confirm it's absent entirely for an anonymous visitor (Entries section isn't rendered for them at all, unchanged).

## 4. Update redirect targets

- [x] 4.1 In `apps/web/src/routes/entries/new.tsx`'s `beforeLoad`, change the Pending-user branch's `redirect({ to: "/" })` to `redirect({ to: "/get-involved" })`. Verify by navigating directly to `/entries/new` as a Pending, non-admin user and confirming the browser lands on `/get-involved`.
- [x] 4.2 In `apps/web/src/routes/entries/new.tsx`'s submit-success handler, change `navigate({ to: "/" })` to `navigate({ to: "/search" })`. Verify by adding an entry and confirming the browser lands on `/search` afterward.
- [x] 4.3 In `apps/web/src/routes/series/new.tsx`'s submit-success handler, change `navigate({ to: "/" })` to `navigate({ to: "/search" })`. Verify by creating a dictionary (as admin) and confirming the browser lands on `/search` afterward.
- [x] 4.4 In `apps/web/src/routes/series/$slug/edit.tsx`'s submit-success handler, change `navigate({ to: "/" })` to `navigate({ to: "/search" })`. Verify by editing a dictionary (as admin) and confirming the browser lands on `/search` afterward.

## 5. Full verification pass

- [x] 5.1 Run `pnpm run typecheck` across the whole workspace and confirm it passes.
- [x] 5.2 Using Playwright, walk through the full verification list from the plan/design: `/` and `/downloads` render identically; `/search` behaves exactly like today's `/` (search, pagination, dictionary filter, no console errors); the strip appears and scrolls correctly at desktop and ~380px width; all four "Create" role states resolve correctly; the hamburger's Entries shelf shows "Search" correctly gated; the pending-user `/entries/new` redirect lands on `/get-involved`; all three success redirects land on `/search`.
- [x] 5.3 Run `openspec validate restructure-primary-navigation --type change --strict` and confirm it passes.
