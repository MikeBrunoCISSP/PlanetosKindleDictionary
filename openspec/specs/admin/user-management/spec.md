## Purpose

Provides administrators with the ability to list all user accounts and change each account's active status and role, ensures an initial administrator account exists from first deployment, and prevents any action that would leave the system with no active administrators.

## Requirements

### Requirement: Initial Administrator Account

The system SHALL seed an initial administrator account from the `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables. This account SHALL have `role = ADMIN` and `isActive = true`. The password MUST satisfy the same complexity rules as regular user registration. The seed operation SHALL be idempotent: re-running it updates the account's password hash if `ADMIN_PASSWORD` changed, rather than creating a duplicate.

#### Scenario: Initial admin is present after seeding

- **WHEN** the seed script is executed against a fresh database with `ADMIN_EMAIL` and `ADMIN_PASSWORD` set
- **THEN** exactly one user record exists with that email, `role = ADMIN`, and a password hash matching `ADMIN_PASSWORD`

#### Scenario: Seed is idempotent

- **WHEN** the seed script is executed twice with the same `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- **THEN** only one user record exists for that email after the second run (no duplicate)

#### Scenario: Seed fails on weak password

- **WHEN** the seed script is executed with an `ADMIN_PASSWORD` that does not satisfy complexity rules
- **THEN** the seed script exits with a non-zero code and does not create or modify any user record

### Requirement: User Listing

The system SHALL expose `GET /api/admin/users` to authenticated administrators. The endpoint SHALL return a paginated list of all users. Each entry SHALL include at minimum: `id`, `email`, `displayName`, `role`, `isActive`, and `createdAt`. Non-administrator requests SHALL be rejected with `403 Forbidden`.

#### Scenario: Admin retrieves user list

- **WHEN** a request with a valid admin session is sent to `GET /api/admin/users`
- **THEN** the system returns `200` with a paginated array of user records

#### Scenario: Non-admin is rejected

- **WHEN** a request with a valid non-admin session is sent to `GET /api/admin/users`
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body

#### Scenario: Unauthenticated request is rejected

- **WHEN** an unauthenticated request is sent to `GET /api/admin/users`
- **THEN** the system returns `401 Unauthorized`

### Requirement: User Account Updates

The system SHALL expose `PATCH /api/admin/users/:id` to authenticated administrators. The endpoint SHALL accept updates to `isActive` (Boolean) and `role` (`MEMBER` | `ADMIN`). Non-administrator requests SHALL be rejected with `403 Forbidden`. Any update that would result in zero active administrator accounts (i.e., no user with `role = ADMIN` and `isActive = true`) SHALL be rejected with `409 Conflict`.

#### Scenario: Admin disables a user account

- **WHEN** a valid admin sends `PATCH /api/admin/users/:id` with `{ "isActive": false }` and at least one other active admin will remain
- **THEN** the system returns `200` with the updated user record showing `isActive: false`

#### Scenario: Admin enables a user account

- **WHEN** a valid admin sends `PATCH /api/admin/users/:id` with `{ "isActive": true }`
- **THEN** the system returns `200` with the updated user record showing `isActive: true`

#### Scenario: Admin promotes a user to ADMIN

- **WHEN** a valid admin sends `PATCH /api/admin/users/:id` with `{ "role": "ADMIN" }`
- **THEN** the system returns `200` with the updated user record showing `role: "ADMIN"`

#### Scenario: Admin demotes an admin to MEMBER

- **WHEN** a valid admin sends `PATCH /api/admin/users/:id` with `{ "role": "MEMBER" }` and at least one other active admin will remain
- **THEN** the system returns `200` with the updated user record showing `role: "MEMBER"`

#### Scenario: Last active admin cannot be disabled

- **WHEN** a valid admin sends `PATCH /api/admin/users/:id` with `{ "isActive": false }` and the target is the only remaining active admin account
- **THEN** the system returns `409 Conflict` with an RFC 9457 problem body and does not modify the record

#### Scenario: Last active admin cannot be demoted

- **WHEN** a valid admin sends `PATCH /api/admin/users/:id` with `{ "role": "MEMBER" }` and the target is the only remaining active admin account
- **THEN** the system returns `409 Conflict` with an RFC 9457 problem body and does not modify the record

#### Scenario: Non-admin is rejected

- **WHEN** a request with a valid non-admin session is sent to `PATCH /api/admin/users/:id`
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body

#### Scenario: Unknown user returns 404

- **WHEN** a valid admin sends `PATCH /api/admin/users/:id` for a user id that does not exist
- **THEN** the system returns `404 Not Found` with an RFC 9457 problem body

### Requirement: Admin Dashboard Page

The system SHALL expose a frontend route at `/admin` accessible only to authenticated administrators. Non-authenticated visitors SHALL be redirected to `/login`. Authenticated non-admins SHALL see a `403 Forbidden` page. The page SHALL display a table of all users showing display name, email, role, and active status, and SHALL provide per-row controls to enable/disable accounts, promote to ADMIN, and demote to MEMBER. Controls that would leave zero active administrators SHALL be rendered as disabled in the UI.

#### Scenario: Unauthenticated visitor is redirected

- **WHEN** an unauthenticated user navigates to `/admin`
- **THEN** the browser redirects them to `/login`

#### Scenario: Authenticated non-admin sees forbidden page

- **WHEN** an authenticated user with `role = MEMBER` navigates to `/admin`
- **THEN** the page renders a `403 Forbidden` message without the user table

#### Scenario: Admin sees user table

- **WHEN** an authenticated administrator navigates to `/admin`
- **THEN** the page renders a table listing all users with their display name, email, role, and active status

#### Scenario: Disable toggle calls PATCH endpoint

- **WHEN** an admin clicks the disable toggle for an active user in the table and at least one other active admin will remain
- **THEN** the frontend calls `PATCH /api/admin/users/:id` with `{ "isActive": false }` and the row updates to reflect the new status on success

#### Scenario: Last-admin controls are disabled in the UI

- **WHEN** an admin views the user table and only one active admin account exists
- **THEN** the disable and demote controls for that account's row are rendered as disabled and cannot be activated
