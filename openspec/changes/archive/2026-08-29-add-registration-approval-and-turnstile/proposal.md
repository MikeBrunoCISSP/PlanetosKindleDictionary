## Why

Registration today is fully open: anyone with an email/password becomes a full member instantly, with no bot protection and no human review. As the app opens up to a wider community, that's a real risk — spam accounts, unreviewed contributors immediately able to submit dictionary entries, and a login system tied to email only (no username). This change adds username-based login, a "reason for joining" field, an administrator approval gate on new registrations (Pending users can't create entries until approved), and Cloudflare Turnstile bot-protection on the registration form itself.

## What Changes

- **BREAKING**: `User.displayName` is renamed to `username` throughout the API, shared schemas, and UI (it already served this exact purpose — required, unique, collected at registration — so this avoids adding a redundant field). Uniqueness becomes case-insensitive (both username and email).
- Login accepts a single "Username or Email" identifier instead of email-only; failures stay generically worded regardless of which lookup path was tried.
- Registration gains a required "Reason for Joining" field (multiline, max 2,000 characters, trimmed, rejects markup) and a required Cloudflare Turnstile check (Managed widget) — when Turnstile is enabled, registration is rejected server-side unless a valid token is presented; when disabled, no widget renders and no token is required; when enabled but misconfigured, registration fails safely rather than silently bypassing the check.
- New user accounts start with approval status **Pending** and cannot create dictionary entries until an administrator approves them; existing accounts are migrated to **Approved**. Administrators bypass the approval gate entirely (their own approval status is irrelevant to entry-creation rights).
- New **Administration → User Management** section (extending the existing, currently nav-less `/admin` Admin Dashboard): a Pending Registrations table (Username, Email, Reason for Joining, Approve/Deny), oldest-first, with Approve and a confirm-then-permanently-delete Deny flow.
- New **Administration → Turnstile** page: view Enabled/Site Key/Secret-configured status, edit Enabled/Site Key/Secret Key (write-only — never re-displayed, never returned to the client), and a Test Configuration action that validates the Secret Key's shape with Cloudflare without fabricating a full verification pass.

## Capabilities

### New Capabilities
- `admin/registration-approval`: The Pending Registrations table on the Admin Dashboard, its details view for a long Reason for Joining, and the Approve/Deny actions (Deny permanently deletes the account after confirmation).
- `turnstile/registration-protection`: Turnstile widget rendering on the registration form when enabled, server-side siteverify validation gating account creation, and fail-safe behavior when enabled but misconfigured.
- `turnstile/administration`: The Turnstile settings page — viewing non-secret configuration and secret-configured status, editing Enabled/Site Key/Secret Key, and the Test Configuration action.

### Modified Capabilities
- `auth/login-registration`: adds the username field (case-insensitive uniqueness) and case-insensitive email uniqueness, the Reason for Joining field, Turnstile-gated registration, registration defaulting to `approvalStatus: PENDING`, and username-or-email login with a generic failure message.
- `admin/user-management`: reconciles the "Admin Dashboard Page" requirement's stale 403-page wording with the redirect-to-`/` behavior already shipped in a prior change, and extends the page description to include the new Pending Registrations section giving `/admin` its first real navigation entry point.
- `navigation/app-menu`: adds "User Management" and "Turnstile" items to the existing Administration shelf, alongside "Approval Queue".
- `entries/submission`: tightens "Add Entry Screen Access" from "any authenticated user" to "an Approved user or an administrator" — a Pending user can still log in but cannot reach entry creation.

## Impact

- **Data model**: `User.displayName` → `username` (rename) + new `usernameNormalized` unique column (case-insensitive uniqueness); existing `email` values lowercased and matched case-insensitively going forward; new `reasonForJoining` (nullable — no value for pre-existing accounts); new `UserApprovalStatus` enum (`PENDING`/`APPROVED`, no persisted `REJECTED` — denial deletes the row) and `approvalStatus` column, defaulting new rows to `PENDING` and explicitly backfilling all pre-existing rows to `APPROVED` in the same migration. New `TurnstileSettings` singleton table (`enabled`, `siteKey`, encrypted `secretKeyEncrypted`, `updatedAt`, `updatedById`).
- **API**: `loginSchema`'s `email` field renamed to `identifier`; new admin-only pending-registration list/approve/deny endpoints; new public `GET /api/turnstile/config` and admin-only Turnstile settings GET/PATCH/test endpoints; a new `makeRequireApproved` guard replacing `requireAuth` on entry creation.
- **Shared package**: new Zod schemas for registration/login/Turnstile DTOs; `plainText()` gains a `.trim()` step (fixes "whitespace-only passes validation" for every current and future caller, not just the new field).
- **New backend modules**: `lib/crypto.ts` (AES-256-GCM secret encryption, keyed by a new required `SETTINGS_ENCRYPTION_KEY` env var), `lib/turnstile.ts` (Cloudflare siteverify client via the built-in `fetch` — no new HTTP dependency).
- **Web**: registration/login form changes, a new Turnstile widget dependency (`@marsidev/react-turnstile`), a Pending Registrations section on `/admin`, a new `/admin/turnstile` page, nav changes, and a CSP update to allow Cloudflare's challenge script/frame/connections.
- **Deployment**: a new required env var (`SETTINGS_ENCRYPTION_KEY`) and documented Cloudflare test credentials for local development, called out explicitly since nothing in source control may contain production Turnstile credentials.
- **Explicitly out of scope**: an admin user-editing screen beyond approve/deny, suspension/banning, denial history or reasons, reactivation of denied users, username changes, general profile management, email verification, password-policy/MFA changes, admin/user notification emails, and any Cloudflare account/widget/hostname management beyond the two application-local settings (Site Key, Secret Key) this change introduces.
