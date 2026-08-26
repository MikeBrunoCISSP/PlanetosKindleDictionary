## Purpose

Lets administrators review entries submitted by users — viewing, approving, or rejecting each one — before it can become part of a generated dictionary, with authorization enforced both in the UI and on the server.

## ADDED Requirements

### Requirement: Approval Queue Access

The system SHALL expose an Approval Queue at `/admin/approval-queue` to administrators only. Authenticated non-administrators SHALL be redirected to `/`. Unauthenticated visitors SHALL be redirected to `/login`. The underlying API endpoints for listing, viewing, approving, and rejecting entries SHALL independently verify the requester is an authenticated administrator, regardless of what the client UI allows.

#### Scenario: Admin can access the Approval Queue
- **WHEN** a logged-in user with role `ADMIN` navigates to `/admin/approval-queue`
- **THEN** the Approval Queue page renders

#### Scenario: Non-admin is redirected away
- **WHEN** a logged-in user with role `MEMBER` navigates to `/admin/approval-queue`
- **THEN** they are redirected to `/`

#### Scenario: Unauthenticated visitor is redirected to login
- **WHEN** an unauthenticated visitor navigates to `/admin/approval-queue`
- **THEN** they are redirected to `/login`

#### Scenario: API rejects non-admin requests independent of the UI
- **WHEN** a request to list, view, approve, or reject a pending entry is made by an authenticated non-administrator
- **THEN** the API rejects the request with `403 Forbidden` regardless of how the request was constructed

### Requirement: Entries Delete Placeholder Access

The system SHALL expose a placeholder Delete-entry destination reachable only by administrators, with no functional deletion behavior implemented. Authenticated non-administrators SHALL be redirected to `/`; unauthenticated visitors SHALL be redirected to `/login`.

#### Scenario: Non-admin cannot reach the Delete placeholder
- **WHEN** a logged-in user with role `MEMBER` navigates directly to the Entries Delete destination
- **THEN** they are redirected to `/`

### Requirement: Pending Entries Listing

The Approval Queue SHALL display all entries whose approval status is Pending, ordered by creation time ascending (oldest submitted entry first). The queue table SHALL display exactly two user-facing columns: Headword (rendered as a hyperlink) and Approve/Reject (containing the row's action controls).

#### Scenario: Pending entries shown oldest-first
- **WHEN** an administrator views the Approval Queue and multiple entries are Pending
- **THEN** they are listed in ascending order of submission time, oldest first

#### Scenario: Non-pending entries are excluded
- **WHEN** an entry's approval status is Approved or Rejected
- **THEN** it does not appear in the Approval Queue listing

### Requirement: Entry Details View

Clicking an entry's Headword link in the Approval Queue SHALL display that entry's details — Headword, Definition, and Inflections — in a modal/dialog, without navigating away from the Approval Queue. If the entry has no Inflections, the dialog SHALL clearly indicate that rather than showing an empty or broken list. The details view is read-only.

#### Scenario: Details open in a modal without navigation
- **WHEN** an administrator clicks a Headword link in the Approval Queue
- **THEN** a modal opens showing that entry's Headword, Definition, and Inflections, and the administrator remains on the Approval Queue page

#### Scenario: Entry with no Inflections is shown clearly
- **WHEN** an administrator opens the details view for an entry that has zero Inflections
- **THEN** the dialog explicitly indicates there are no Inflections rather than rendering an empty list

### Requirement: Approving an Entry

Administrators SHALL be able to approve a Pending entry. Approving SHALL update the entry's approval status from Pending to Approved and persist the change. The entry SHALL be removed from the Approval Queue only after the update succeeds; it SHALL NOT be removed optimistically before server confirmation.

#### Scenario: Approve transitions status and clears the row
- **WHEN** an administrator approves a Pending entry and the server confirms the update
- **THEN** the entry's approval status becomes Approved and it no longer appears in the Approval Queue

#### Scenario: Failed approval leaves the row in place
- **WHEN** an administrator approves a Pending entry and the server update fails
- **THEN** the entry remains in the Approval Queue and its approval status remains Pending

### Requirement: Rejecting an Entry

Administrators SHALL be able to reject a Pending entry. Selecting Reject SHALL open a dialog containing a multiline field for an optional rejection note, a confirmation action, and a cancel action. Confirming SHALL set the entry's approval status to Rejected, persist the optional note if one was supplied, and persist the change. The entry SHALL be removed from the Approval Queue only after the update succeeds.

#### Scenario: Reject with a note
- **WHEN** an administrator opens the Reject dialog for a Pending entry, enters a note, and confirms
- **THEN** the entry's approval status becomes Rejected, the note is persisted, and the entry no longer appears in the Approval Queue

#### Scenario: Reject without a note
- **WHEN** an administrator opens the Reject dialog for a Pending entry and confirms without entering a note
- **THEN** the entry's approval status becomes Rejected with no rejection note, and the entry no longer appears in the Approval Queue

#### Scenario: Cancel leaves the entry unchanged
- **WHEN** an administrator opens the Reject dialog and selects Cancel
- **THEN** the entry's approval status remains Pending and it remains in the Approval Queue

#### Scenario: Failed rejection leaves the row in place
- **WHEN** an administrator confirms a rejection and the server update fails
- **THEN** the entry remains in the Approval Queue and its approval status remains Pending
