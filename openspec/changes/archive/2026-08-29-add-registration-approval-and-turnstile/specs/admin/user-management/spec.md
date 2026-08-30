## MODIFIED Requirements

### Requirement: Admin Dashboard Page

The system SHALL expose a frontend route at `/admin` accessible only to authenticated administrators. Non-authenticated visitors SHALL be redirected to `/login`. Authenticated non-admins SHALL be redirected to `/`. The page SHALL display a table of all non-Pending users showing username, email, role, and active status, and SHALL provide per-row controls to enable/disable accounts, promote to ADMIN, and demote to MEMBER. Controls that would leave zero active administrators SHALL be rendered as disabled in the UI. The page SHALL also display a Pending Registrations section (see the `admin/registration-approval` capability) — this is the route's only navigation entry point in the application.

#### Scenario: Unauthenticated visitor is redirected

- **WHEN** an unauthenticated user navigates to `/admin`
- **THEN** the browser redirects them to `/login`

#### Scenario: Authenticated non-admin sees forbidden page

- **WHEN** an authenticated user with `role = MEMBER` navigates to `/admin`
- **THEN** the browser redirects them to `/` (superseding the earlier behavior of rendering a `403 Forbidden` page in place, to match the redirect convention established for other admin-only routes)

#### Scenario: Admin sees user table

- **WHEN** an authenticated administrator navigates to `/admin`
- **THEN** the page renders a table listing all non-Pending users with their username, email, role, and active status

#### Scenario: Disable toggle calls PATCH endpoint

- **WHEN** an admin clicks the disable toggle for an active user in the table and at least one other active admin will remain
- **THEN** the frontend calls `PATCH /api/admin/users/:id` with `{ "isActive": false }` and the row updates to reflect the new status on success

#### Scenario: Last-admin controls are disabled in the UI

- **WHEN** an admin views the user table and only one active admin account exists
- **THEN** the disable and demote controls for that account's row are rendered as disabled and cannot be activated
