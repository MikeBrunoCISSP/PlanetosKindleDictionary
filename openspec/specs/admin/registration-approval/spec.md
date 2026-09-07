# registration-approval Specification

## Purpose

Lets administrators review newly registered, Pending accounts — reading the requester's reason for joining, approving them into full membership, or permanently denying (deleting) the registration.

## Requirements

### Requirement: Pending Registrations Listing

The Admin Dashboard SHALL display a Pending Registrations section listing accounts whose approval status is `PENDING`, ordered by creation time ascending (oldest first), loaded a bounded page at a time with a stable cursor so that loading further pages neither skips nor duplicates an account even as other Pending accounts are approved or denied concurrently. Administrators SHALL be able to load further pages until every currently Pending account has been shown. The table SHALL display exactly these user-facing columns: Username, Email, Reason for Joining, and Approve/Deny. The underlying API endpoint SHALL be accessible only to authenticated administrators. Each page's size SHALL be capped at a fixed server-enforced maximum.

#### Scenario: Pending registrations shown oldest-first
- **WHEN** an administrator views the Pending Registrations section and multiple accounts are Pending
- **THEN** they are listed in ascending order of registration time, oldest first

#### Scenario: Non-pending accounts are excluded
- **WHEN** an account's approval status is `APPROVED`
- **THEN** it does not appear in the Pending Registrations section

#### Scenario: Non-admin is rejected
- **WHEN** a request with a valid non-admin session is sent to the pending-registrations list endpoint
- **THEN** the system returns `403 Forbidden`

#### Scenario: Unauthenticated request is rejected
- **WHEN** an unauthenticated request is sent to the pending-registrations list endpoint
- **THEN** the system returns `401 Unauthorized`

#### Scenario: A page of pending registrations is capped
- **WHEN** more Pending accounts exist than one page's maximum size
- **THEN** only that maximum number are returned in one request, with a way to load the next page

#### Scenario: Loading further pages does not skip or duplicate an account across concurrent approvals
- **WHEN** an administrator loads a page, approves or denies one of the shown accounts, and then loads the next page
- **THEN** the next page's accounts are exactly the next-oldest remaining Pending accounts, with none skipped or repeated

### Requirement: Reason for Joining Detail View

Where a Reason for Joining value is too long to display in full within the table cell, the system SHALL truncate its display and provide a way to view the complete value (e.g. an expandable row or dialog) without navigating away from the Admin Dashboard. Password hashes, security stamps, or any other account security fields SHALL NOT be exposed anywhere in the Pending Registrations UI or its underlying API response.

#### Scenario: Long reason is truncated in the table
- **WHEN** a Pending registration's Reason for Joining exceeds what fits in the table cell
- **THEN** the displayed text is truncated with a way to view the full value

#### Scenario: Full reason is viewable
- **WHEN** an administrator requests to view the full Reason for Joining for a truncated entry
- **THEN** the complete, untruncated value is displayed without leaving the Admin Dashboard

### Requirement: Approving a Registration

Each Pending registration SHALL have an Approve action. Approving SHALL verify server-side that the acting user is an administrator, that the target account still exists, and that it is still Pending; it SHALL then change the approval status to `APPROVED` and persist the change. The row SHALL be removed from the Pending Registrations section only after the server confirms success, not optimistically. Approval SHALL take effect without requiring the user to re-register — an Approved user immediately gains normal Approved-user permissions, including the ability to create dictionary entries.

#### Scenario: Approve transitions Pending to Approved and clears the row
- **WHEN** an administrator approves a Pending registration and the server confirms the update
- **THEN** the account's approval status becomes `APPROVED` and it no longer appears in the Pending Registrations section

#### Scenario: Approved user gains entry-creation rights immediately
- **WHEN** a Pending user's registration is approved
- **THEN** that user can create dictionary entries on their next request, without logging out, logging back in, or re-registering

#### Scenario: Approving an already-approved or nonexistent account is handled safely
- **WHEN** an administrator attempts to approve an account that no longer exists or is no longer Pending
- **THEN** the system rejects the request with an appropriate error and does not crash or silently succeed

#### Scenario: Failed approval leaves the row in place
- **WHEN** an administrator approves a Pending registration and the server update fails
- **THEN** the account remains in the Pending Registrations section with approval status still `PENDING`

#### Scenario: Non-admin cannot approve
- **WHEN** a request with a valid non-admin session is sent to the approve-registration endpoint
- **THEN** the system returns `403 Forbidden` and does not change the account's approval status

### Requirement: Denying a Registration

Each Pending registration SHALL have a Deny action. Because denial permanently deletes the account, the system SHALL require administrator confirmation via a dialog worded similarly to "Are you sure you want to deny this registration? The user account will be permanently deleted." with Confirm and Cancel actions. Confirming SHALL verify server-side that the acting user is an administrator, that the target account still exists, and that it is still Pending; it SHALL then permanently delete the account (username, email, reason for joining, and Identity record), removing dependent records safely rather than disabling referential-integrity protections. The row SHALL be removed from the Pending Registrations section only after the server confirms success.

#### Scenario: Deny requires confirmation before deleting
- **WHEN** an administrator selects Deny for a Pending registration
- **THEN** a confirmation dialog opens and the account is not yet deleted

#### Scenario: Cancel leaves the registration intact
- **WHEN** an administrator opens the Deny confirmation dialog and selects Cancel
- **THEN** the dialog closes and the account is not deleted

#### Scenario: Confirmed deny permanently deletes the account
- **WHEN** an administrator confirms denial of a Pending registration and the server confirms success
- **THEN** the account no longer exists in the system and no longer appears in the Pending Registrations section

#### Scenario: Denying an already-removed or nonexistent account is handled safely
- **WHEN** an administrator confirms denial of an account that no longer exists or is no longer Pending
- **THEN** the system rejects the request with an appropriate error and does not crash

#### Scenario: Failed denial leaves the row in place
- **WHEN** an administrator confirms denial and the server update fails
- **THEN** the account remains in the Pending Registrations section, unchanged

#### Scenario: Non-admin cannot deny
- **WHEN** a request with a valid non-admin session is sent to the deny-registration endpoint
- **THEN** the system returns `403 Forbidden` and does not delete the account
