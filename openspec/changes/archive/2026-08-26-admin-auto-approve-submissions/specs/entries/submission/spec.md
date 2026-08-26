## MODIFIED Requirements

### Requirement: Saving a New Entry

When a user saves a valid entry, the system SHALL persist the Headword, Definition, and all associated Inflections; associate the entry with the selected dictionary and with the submitting authenticated user; record the submission timestamp; and set the entry's approval status to Pending — except that when the submitting user's role is Administrator, the entry SHALL instead be saved with approval status Approved immediately, recorded as reviewed by that same administrator at the submission time. The entry SHALL NOT be included in any generated dictionary output while Pending. A success toast SHALL be displayed only after the server confirms the entry was persisted, worded similarly to "Your entry has been saved. It must be approved before it can be included in the generated Kindle dictionary." for a non-administrator, or acknowledging immediate approval for an administrator. The system SHALL prevent duplicate submissions caused by repeated clicks while a save request is already in progress. Whether the submission auto-approves SHALL be decided solely from the authenticated session's role on the server; no client-supplied input can trigger it.

#### Scenario: Valid entry is saved as Pending
- **WHEN** an authenticated non-administrator user submits a valid entry (dictionary selected, Headword and Definition provided, no duplicate word)
- **THEN** the entry is persisted with approval status Pending, attributed to the submitting user, with a recorded creation timestamp

#### Scenario: Administrator's entry is saved as Approved
- **WHEN** an authenticated administrator submits a valid entry
- **THEN** the entry is persisted with approval status Approved, attributed to the submitting administrator as both submitter and reviewer, with a recorded review time equal to the submission time, and it is immediately eligible for inclusion in generated dictionary output

#### Scenario: Success toast only follows a confirmed save
- **WHEN** a valid entry submission is in flight and has not yet received a server response
- **THEN** no success toast is shown until the server confirms the entry was persisted

#### Scenario: Repeated clicks do not create duplicate submissions
- **WHEN** a user clicks the save action multiple times in quick succession while a save request is already in progress
- **THEN** only one entry is created

### Requirement: Entry Approval Status

Every entry SHALL have an approval status capable of representing at least Pending, Approved, and Rejected. An entry created through normal submission by a non-administrator SHALL start in the Pending state; an entry submitted by an administrator SHALL start in the Approved state, recorded as self-reviewed. The system SHALL support storing an optional rejection note associated with an entry's review outcome.

#### Scenario: New entry starts Pending
- **WHEN** a non-administrator successfully saves a new entry
- **THEN** its approval status is Pending

#### Scenario: Administrator-submitted entry starts Approved
- **WHEN** an administrator successfully saves a new entry
- **THEN** its approval status is Approved from the moment it is created, with no separate review step required
