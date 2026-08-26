## MODIFIED Requirements

### Requirement: Submitting an Edit Creates a Pending Revision

When a user submits a valid edit, the system SHALL validate the Definition and Inflections, confirm the user is authenticated, confirm the target entry still exists, and create a pending revision recording the proposed Definition, the proposed Inflections, the submitting user, and the submission timestamp — except that when the submitting user's role is Administrator, the system SHALL instead apply the proposed Definition and Inflections to the entry immediately, in the same request, recording the change as reviewed by that same administrator at the submission time. For a non-administrator, the system SHALL NOT modify the currently-approved entry as part of this submission. A success toast SHALL be shown only after the server confirms the change was persisted, worded similarly to "Your edit has been submitted for approval." for a non-administrator, or acknowledging immediate application for an administrator. The system SHALL prevent a single user action from creating more than one pending revision (or, for an administrator, applying more than one immediate change) through repeated/rapid submission clicks. Whether the submission applies immediately SHALL be decided solely from the authenticated session's role on the server; no client-supplied input can trigger it.

#### Scenario: Valid edit is saved as a pending revision

- **WHEN** an authenticated non-administrator user submits a valid edit for an entry with no other Pending edit
- **THEN** a pending revision is created recording the proposed Definition and Inflections, attributed to the submitting user, with a recorded submission timestamp, and the live entry is unchanged

#### Scenario: Administrator's edit is applied immediately

- **WHEN** an authenticated administrator submits a valid edit for an entry with no other Pending edit
- **THEN** the entry's Definition and Inflections are updated to the submitted values immediately, the change is recorded as reviewed by that same administrator at the submission time, and search results, the entry-detail page, and generated dictionary output reflect the new values right away

#### Scenario: Success toast only follows a confirmed submission

- **WHEN** an edit submission is in flight and has not yet received a server response
- **THEN** no success toast is shown until the server confirms the change was persisted

#### Scenario: Repeated clicks do not create duplicate pending revisions

- **WHEN** a user clicks Submit multiple times in quick succession while a submission is already in progress
- **THEN** only one pending revision is created (or, for an administrator, only one immediate change is applied)

### Requirement: One Pending Edit Per Entry

At most one Pending edit proposal SHALL exist for a given entry at any time, enforced independently of client behavior (including at the database level) so that two concurrent submissions cannot both succeed. If an entry already has a Pending edit proposal, a further submission attempt SHALL be rejected with a message similar to "An edit for this entry is already awaiting approval."; the entry SHALL remain viewable in its current approved state. This SHALL apply equally to an administrator's own submission: an administrator does not bypass or silently replace an existing Pending proposal from any user, including another administrator, and must resolve it through the Approval Queue before submitting a new one.

#### Scenario: Second submission while one is already pending is rejected

- **WHEN** an entry already has a Pending edit proposal and a user attempts to submit another edit for the same entry
- **THEN** the new submission is rejected with a message indicating an edit is already awaiting approval, and no second pending revision is created

#### Scenario: Concurrent submissions for the same entry do not both succeed

- **WHEN** two users concurrently submit edits for the same entry that currently has no Pending proposal
- **THEN** exactly one submission succeeds and the other is rejected

#### Scenario: Administrator's submission is blocked by another user's pending proposal

- **WHEN** an entry already has a Pending edit proposal submitted by any user, and an administrator attempts to submit a further edit for the same entry
- **THEN** the administrator's submission is rejected with the same "already awaiting approval" message, the existing Pending proposal is untouched, and no immediate change is applied
