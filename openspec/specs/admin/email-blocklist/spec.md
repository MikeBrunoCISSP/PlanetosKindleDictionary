# Admin Email Blocklist Specification

## Purpose

Lets administrators permanently prevent a specific email address from registering an account, view and manage the list of currently blocked addresses, and undo a block that is no longer wanted.

## Requirements

### Requirement: Blocked Emails Listing

The system SHALL expose `GET /api/admin/blocked-emails` to authenticated administrators, returning a paginated list of blocked email addresses ordered by block time, newest first. Each entry SHALL include at minimum: the blocked email address, an optional reason, when it was blocked, and who blocked it. Non-administrator requests SHALL be rejected with `403 Forbidden`; unauthenticated requests SHALL be rejected with `401 Unauthorized`. The Admin Dashboard SHALL display this list in a "Blocked Emails" section.

#### Scenario: Blocked emails shown newest-first

- **WHEN** an administrator views the Blocked Emails section and multiple emails are blocked
- **THEN** they are listed in descending order of block time, most recently blocked first

#### Scenario: Non-admin cannot list blocked emails

- **WHEN** a request with a valid non-admin session is sent to the blocked-emails list endpoint
- **THEN** the system returns `403 Forbidden`

#### Scenario: Unauthenticated request is rejected

- **WHEN** an unauthenticated request is sent to the blocked-emails list endpoint
- **THEN** the system returns `401 Unauthorized`

### Requirement: Manually Blocking an Email

The system SHALL expose `POST /api/admin/blocked-emails` to authenticated administrators, accepting an email address and an optional reason, and creating a block effective immediately. The email comparison SHALL be case-insensitive, matching how registration itself compares email addresses. Blocking an email SHALL succeed regardless of whether an account currently exists under that email — it has no effect on any existing account, only on future registration attempts. Attempting to block an email that is already blocked SHALL be rejected with `409 Conflict` rather than creating a duplicate entry. Non-administrator requests SHALL be rejected with `403 Forbidden`.

#### Scenario: Administrator blocks an email that never registered

- **WHEN** an administrator submits an email address that has no existing account and is not already blocked
- **THEN** the system creates a block for that email and it immediately appears in the Blocked Emails section

#### Scenario: Blocking is case-insensitive

- **WHEN** an administrator blocks an email address, and a later registration attempt uses the same address with different letter casing
- **THEN** the registration attempt is still rejected as blocked

#### Scenario: Blocking an already-blocked email is rejected

- **WHEN** an administrator submits an email address that is already on the blocked list
- **THEN** the system returns `409 Conflict` and does not create a duplicate entry

#### Scenario: Non-admin cannot block an email

- **WHEN** a request with a valid non-admin session is sent to the block-email endpoint
- **THEN** the system returns `403 Forbidden` and does not create a block

### Requirement: Unblocking an Email

The system SHALL expose `DELETE /api/admin/blocked-emails/:id` to authenticated administrators, permanently removing that block. Once removed, the email address SHALL be eligible for registration again, subject to the normal registration rules. Non-administrator requests SHALL be rejected with `403 Forbidden`. Attempting to unblock an id that does not exist SHALL return `404 Not Found` rather than crashing or silently succeeding.

#### Scenario: Administrator unblocks an email

- **WHEN** an administrator removes a block and the server confirms success
- **THEN** the email no longer appears in the Blocked Emails section and a subsequent registration attempt using that address is no longer rejected as blocked

#### Scenario: Unblocking a nonexistent entry is handled safely

- **WHEN** an administrator attempts to remove a block that no longer exists
- **THEN** the system returns `404 Not Found` and does not crash

#### Scenario: Non-admin cannot unblock an email

- **WHEN** a request with a valid non-admin session is sent to the unblock endpoint
- **THEN** the system returns `403 Forbidden` and the block remains in place
