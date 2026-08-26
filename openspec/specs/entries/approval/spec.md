## Purpose

Lets administrators review entries submitted by users — viewing, approving, or rejecting each one — before it can become part of a generated dictionary, with authorization enforced both in the UI and on the server.

## Requirements

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

The Approval Queue SHALL display all pending review items — new-entry submissions whose approval status is Pending, and edit proposals whose status is Pending — in a single list, ordered by submission time ascending (oldest submitted item first). The queue table SHALL display a Type indicator distinguishing a New Entry item from an Edit item, the item's Headword (rendered as a hyperlink), and Approve/Reject action controls. An item submitted by an administrator and auto-approved at submission time SHALL NOT appear in this listing, since it is never Pending.

#### Scenario: Pending entries shown oldest-first
- **WHEN** an administrator views the Approval Queue and there are both Pending new-entry submissions and Pending edit proposals
- **THEN** they are listed together in a single list, ordered by submission time ascending, oldest first

#### Scenario: Non-pending entries are excluded
- **WHEN** an entry's approval status is Approved or Rejected, or an edit proposal's status is Approved or Rejected
- **THEN** it does not appear in the Approval Queue listing

#### Scenario: Each item's type is visually distinguishable
- **WHEN** an administrator views the Approval Queue
- **THEN** each row makes it clear whether it represents a New Entry submission or an Edit proposal

#### Scenario: Administrator's self-approved submission never enters the queue
- **WHEN** an administrator submits a new entry or an edit, which the system auto-approves immediately
- **THEN** that item never appears in the Approval Queue at any point

### Requirement: Edit Proposal Details View

Clicking an edit-proposal row's Headword link in the Approval Queue SHALL display, in a modal/dialog without navigating away from the Approval Queue: the entry's Headword, its current Definition and current Inflections, and the proposal's proposed Definition and proposed Inflections, laid out so the current and proposed values are easy to compare.

#### Scenario: Edit proposal details open in a modal without navigation
- **WHEN** an administrator clicks the Headword link on an Edit row in the Approval Queue
- **THEN** a modal opens showing the entry's Headword, current Definition, proposed Definition, current Inflections, and proposed Inflections, and the administrator remains on the Approval Queue page

### Requirement: Approving an Edit Proposal

Administrators SHALL be able to approve a Pending edit proposal. Approving SHALL: verify the acting user is an administrator; verify the target entry still exists; verify the proposal is still Pending; verify the entry has not changed since the proposal was submitted; re-validate that the proposed Inflections do not conflict with any other entry's Headword or Inflection in the same dictionary; and, if all checks pass, atomically apply the proposed Definition and Inflection changes to the entry, mark the proposal Approved, and record the reviewing administrator and review time. If the entry has changed since the proposal was submitted, the approval SHALL be refused, the proposal SHALL remain Pending, and the administrator SHALL be informed that the underlying entry changed. If a word conflict is found during re-validation, the approval SHALL be refused and the proposal SHALL remain Pending. The proposal SHALL be removed from the Approval Queue only after a successful approval is confirmed by the server; it SHALL NOT be removed optimistically beforehand. Once approved, the entry's new Definition and Inflections SHALL be what search, the entry-detail page, and dictionary generation use.

#### Scenario: Approve applies the proposed changes
- **WHEN** an administrator approves a Pending edit proposal whose base entry is unchanged and whose proposed Inflections have no conflicts
- **THEN** the entry's Definition and Inflections are updated to the proposed values, the proposal's status becomes Approved, and it no longer appears in the Approval Queue

#### Scenario: Approval is blocked when the underlying entry changed
- **WHEN** an administrator attempts to approve a Pending edit proposal whose target entry has changed since the proposal was submitted (for example, a different edit to the same entry was approved in the meantime)
- **THEN** the approval is refused, the entry is not modified, the proposal remains Pending, and the administrator is informed the entry changed

#### Scenario: Approval is blocked by a newly-introduced word conflict
- **WHEN** an administrator attempts to approve a Pending edit proposal whose proposed Inflections would now conflict with a Headword or Inflection introduced by another entry after the proposal was submitted
- **THEN** the approval is refused, the entry is not modified, and the proposal remains Pending

#### Scenario: Failed approval leaves the row in place
- **WHEN** an administrator approves a Pending edit proposal and the server update fails for any reason
- **THEN** the proposal remains in the Approval Queue and its status remains Pending

### Requirement: Rejecting an Edit Proposal

Administrators SHALL be able to reject a Pending edit proposal. Selecting Reject SHALL open a dialog containing a multiline field for an optional rejection note, a confirmation action, and a cancel action, consistent with the existing entry-rejection dialog. Confirming SHALL verify the acting user is an administrator and that the proposal is still Pending, set the proposal's status to Rejected, and persist the optional note if one was supplied. Rejecting SHALL NOT modify the entry in any way. The proposal SHALL be removed from the Approval Queue only after the server confirms the rejection.

#### Scenario: Reject with a note leaves the entry unchanged
- **WHEN** an administrator opens the Reject dialog for a Pending edit proposal, enters a note, and confirms
- **THEN** the proposal's status becomes Rejected, the note is persisted, the entry's Definition and Inflections are unchanged, and the proposal no longer appears in the Approval Queue

#### Scenario: Reject without a note
- **WHEN** an administrator confirms rejection of a Pending edit proposal without entering a note
- **THEN** the proposal's status becomes Rejected with no rejection note, and the entry is unchanged

#### Scenario: Cancel leaves the proposal unchanged
- **WHEN** an administrator opens the Reject dialog for a Pending edit proposal and selects Cancel
- **THEN** the proposal's status remains Pending and it remains in the Approval Queue

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
