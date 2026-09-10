## MODIFIED Requirements

### Requirement: Denying a Registration

Each Pending registration SHALL have a Deny action. Because denial permanently deletes the account, the system SHALL require administrator confirmation via a dialog worded similarly to "Are you sure you want to deny this registration? The user account will be permanently deleted." with Confirm and Cancel actions. The confirmation dialog SHALL also offer an optional "also block this email from registering again" choice, unselected by default. Confirming SHALL verify server-side that the acting user is an administrator, that the target account still exists, and that it is still Pending; it SHALL then permanently delete the account (username, email, reason for joining, and Identity record), removing dependent records safely rather than disabling referential-integrity protections. When the "also block" choice was selected, the same confirmed action SHALL additionally create a block for that email address (see `admin/email-blocklist`), effective immediately, in the same operation as the deletion. Denying without selecting "also block" SHALL behave exactly as before this addition — only the account is deleted, and the email remains free to register again. The row SHALL be removed from the Pending Registrations section only after the server confirms success.

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

#### Scenario: Denying without selecting "also block" does not block the email
- **WHEN** an administrator confirms denial of a Pending registration without selecting "also block this email"
- **THEN** the account is deleted, the email is not added to the blocked list, and a subsequent registration attempt using that email succeeds like any other

#### Scenario: Denying with "also block" selected deletes the account and blocks the email
- **WHEN** an administrator confirms denial of a Pending registration with "also block this email" selected
- **THEN** the account is deleted, the email immediately appears in the Blocked Emails section, and a subsequent registration attempt using that email is rejected as blocked
