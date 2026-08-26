## MODIFIED Requirements

### Requirement: Pending Entries Listing

The Approval Queue SHALL display all pending review items — new-entry submissions whose approval status is Pending, and edit proposals whose status is Pending — in a single list, ordered by submission time ascending (oldest submitted item first). The queue table SHALL display a Type indicator distinguishing a New Entry item from an Edit item, the item's Headword (rendered as a hyperlink), and Approve/Reject action controls.

#### Scenario: Pending entries shown oldest-first
- **WHEN** an administrator views the Approval Queue and there are both Pending new-entry submissions and Pending edit proposals
- **THEN** they are listed together in a single list, ordered by submission time ascending, oldest first

#### Scenario: Non-pending entries are excluded
- **WHEN** an entry's approval status is Approved or Rejected, or an edit proposal's status is Approved or Rejected
- **THEN** it does not appear in the Approval Queue listing

#### Scenario: Each item's type is visually distinguishable
- **WHEN** an administrator views the Approval Queue
- **THEN** each row makes it clear whether it represents a New Entry submission or an Edit proposal

## ADDED Requirements

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
