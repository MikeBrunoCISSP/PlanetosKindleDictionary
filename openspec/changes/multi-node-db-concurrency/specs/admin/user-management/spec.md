## MODIFIED Requirements

### Requirement: User Account Updates

The system SHALL expose `PATCH /api/admin/users/:id` to authenticated administrators. The endpoint SHALL accept updates to `isActive` (Boolean) and `role` (`MEMBER` | `ADMIN`). Non-administrator requests SHALL be rejected with `403 Forbidden`. Any update that would result in zero active administrator accounts (i.e., no user with `role = ADMIN` and `isActive = true`) SHALL be rejected with `409 Conflict`. This constraint SHALL be enforced atomically: concurrent requests that would each individually appear safe but together would leave zero active administrators MUST result in at most one succeeding.

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

#### Scenario: Concurrent last-admin protection holds

- **WHEN** two simultaneous PATCH requests both target admins and each would individually pass the last-admin guard, but together they would leave zero active administrators
- **THEN** exactly one request returns `200` and the other returns `409 Conflict` with an RFC 9457 problem body; the system is never left with zero active administrators

#### Scenario: Non-admin is rejected

- **WHEN** a request with a valid non-admin session is sent to `PATCH /api/admin/users/:id`
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body

#### Scenario: Unknown user returns 404

- **WHEN** a valid admin sends `PATCH /api/admin/users/:id` for a user id that does not exist
- **THEN** the system returns `404 Not Found` with an RFC 9457 problem body
