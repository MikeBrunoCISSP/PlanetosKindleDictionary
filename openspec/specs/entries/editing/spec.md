# Entry Editing Specification

## Purpose

Lets an authenticated visitor propose a change to an already-approved entry's Definition and Inflections, without altering what other visitors see until an administrator reviews and approves the change.

## Requirements

### Requirement: Edit Mode Access

Entering edit mode on the entry-detail page SHALL require the visitor to be authenticated; this SHALL be enforced both by hiding/disabling the entry point in the UI and independently by the server on the endpoint that accepts a submitted edit. Any authenticated user, regardless of role or the account's own approval status, MAY enter edit mode and submit an edit for an Approved entry.

#### Scenario: Unauthenticated request to submit an edit is rejected

- **WHEN** a request to submit an edit is made without a valid authenticated session
- **THEN** the request is rejected and no pending revision is created, regardless of what the client UI would have allowed

#### Scenario: Any authenticated user can enter edit mode

- **WHEN** an authenticated user, including one whose own account is still Pending approval, clicks Edit on an Approved entry's detail page
- **THEN** the page enters edit mode

### Requirement: Headword Is Not Editable

While in edit mode, the entry's Headword SHALL remain visible but SHALL NOT be editable. Submitting an edit SHALL NOT be able to change the Headword.

#### Scenario: Headword field is read-only in edit mode

- **WHEN** a user is in edit mode
- **THEN** the Headword is displayed but cannot be modified

### Requirement: Definition Editing

In edit mode, the Definition SHALL be editable via a multiline control, subject to the same rules used when creating a new entry: required, a maximum of 5,000 characters, no silent truncation, and trimmed of leading/trailing whitespace before validation. A blank or whitespace-only Definition SHALL disable the Submit button, and SHALL also be rejected by the server independently of the client-side disabled state.

#### Scenario: Blank Definition disables Submit

- **WHEN** a user clears the Definition to empty or whitespace-only while in edit mode
- **THEN** the Submit button is disabled

#### Scenario: Server rejects a blank Definition even if submitted directly

- **WHEN** an edit-submission request is made with a blank or whitespace-only Definition
- **THEN** the server rejects the request and no pending revision is created

#### Scenario: Over-length Definition is rejected, not truncated

- **WHEN** a user submits an edit with a Definition longer than 5,000 characters
- **THEN** the submission is rejected with a validation message, and no pending revision is created with a truncated Definition

### Requirement: Inflection Editing in Edit Mode

In edit mode, the user SHALL be able to add new Inflections and remove any of the entry's existing Inflections, using the same interaction conventions as the Add Entry screen.

#### Scenario: User adds an Inflection while editing

- **WHEN** a user enters a word and adds it as an Inflection while in edit mode
- **THEN** the word appears in the draft's list of Inflections

#### Scenario: User removes an existing Inflection while editing

- **WHEN** a user removes one of the entry's current Inflections while in edit mode
- **THEN** that word no longer appears in the draft's list of Inflections

### Requirement: Inflection Duplicate Validation During Editing

When a user attempts to add an Inflection while editing, the system SHALL verify the word (case-insensitive, whitespace-trimmed) does not already exist within the same dictionary as: a Headword or Inflection belonging to a *different* entry, or another Inflection already present in the current draft; and that it is not identical to the entry's own Headword. The entry's own existing Inflections that remain unchanged in the draft SHALL NOT be treated as conflicting with themselves. A duplicate SHALL NOT be added; the system SHALL show the same toast notification used elsewhere in the app: "The word already exists in the dictionary." This validation SHALL also be enforced by the server when the edit is submitted.

#### Scenario: New Inflection duplicating another entry's word is rejected

- **WHEN** a user attempts to add an Inflection that already exists as a Headword or Inflection of a different entry in the same dictionary
- **THEN** the Inflection is not added and a toast reads "The word already exists in the dictionary."

#### Scenario: New Inflection duplicating another Inflection already in the draft is rejected

- **WHEN** a user attempts to add an Inflection matching one already present in the current edit draft
- **THEN** the Inflection is not added and the same toast is shown

#### Scenario: New Inflection identical to the entry's Headword is rejected

- **WHEN** a user attempts to add an Inflection identical to the entry's own Headword (case-insensitive, trimmed)
- **THEN** the Inflection is not added and the same toast is shown

#### Scenario: Unchanged existing Inflection does not conflict with itself

- **WHEN** a user enters edit mode on an entry that already has an Inflection and does not remove it
- **THEN** that unchanged Inflection is never flagged as a duplicate of itself

#### Scenario: Server re-validates at submission time

- **WHEN** an edit-submission request includes a proposed Inflection that duplicates another entry's word
- **THEN** the server rejects the request and no pending revision is created

### Requirement: Dirty-State Submit Gating

The edit screen SHALL track whether the user has made a real, meaningful change compared to the entry's current approved content — the Definition text differing after normalization, or an Inflection having been added or removed. A Submit control SHALL be shown in the bottom-right area of the edit view. Submit SHALL be disabled when nothing has meaningfully changed, when the Definition is blank/invalid, or when the draft is otherwise invalid, and SHALL be enabled only once at least one meaningful change exists and the draft is valid. Merely focusing and then leaving a field without changing its normalized value SHALL NOT enable Submit.

#### Scenario: Unchanged form keeps Submit disabled

- **WHEN** a user enters edit mode and makes no changes
- **THEN** Submit is disabled

#### Scenario: Focus-then-blur without an edit does not enable Submit

- **WHEN** a user focuses the Definition field and leaves it without changing its normalized value
- **THEN** Submit remains disabled

#### Scenario: A real Definition change enables Submit

- **WHEN** a user changes the Definition to different, valid, non-blank text
- **THEN** Submit becomes enabled

#### Scenario: Adding or removing an Inflection enables Submit

- **WHEN** a user adds a new Inflection or removes an existing one while otherwise leaving the Definition unchanged and valid
- **THEN** Submit becomes enabled

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

### Requirement: Approved Entry Remains Authoritative While an Edit Is Pending

While an edit proposal for an entry is Pending, the entry's currently-approved Definition and Inflections SHALL remain what search results, the entry-detail page, and any generated dictionary output show. The proposed values SHALL NOT be displayed as though they were already approved, and SHALL only be visible through the administrative review workflow.

#### Scenario: Search and detail page keep showing the approved version

- **WHEN** an entry has a Pending edit proposal
- **THEN** search results and the entry-detail page continue to show the entry's current approved Definition and Inflections, not the proposed ones

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

### Requirement: Canceling an Edit

While in edit mode, a Cancel control SHALL be available. Selecting it SHALL discard the in-progress draft, return the page to its read-only state showing the currently-approved Definition and Inflections, and SHALL NOT create a pending revision.

#### Scenario: Cancel discards the draft

- **WHEN** a user has made changes in edit mode and selects Cancel
- **THEN** the page returns to read-only mode showing the entry's unchanged approved content, and no pending revision is created
