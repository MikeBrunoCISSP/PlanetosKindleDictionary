## Purpose

Lets any authenticated user propose a new dictionary entry (Headword, Definition, and optional Inflections) for review, enforcing dictionary-wide word uniqueness even under concurrent submissions.

## Requirements

### Requirement: Add Entry Screen Access

The system SHALL expose an Add Entry screen at `/entries/new` to any authenticated user, regardless of role. Unauthenticated visitors SHALL be redirected to `/login`.

#### Scenario: Authenticated member can access the screen
- **WHEN** a logged-in user with role `MEMBER` navigates to `/entries/new`
- **THEN** the Add Entry screen renders

#### Scenario: Authenticated admin can access the screen
- **WHEN** a logged-in user with role `ADMIN` navigates to `/entries/new`
- **THEN** the Add Entry screen renders

#### Scenario: Unauthenticated visitor is redirected
- **WHEN** an unauthenticated visitor navigates to `/entries/new`
- **THEN** they are redirected to `/login`

### Requirement: Dictionary Selection Is Required

The Add Entry form SHALL require the user to select the dictionary (Series) the entry belongs to before it can be submitted.

#### Scenario: Submission blocked without a dictionary
- **WHEN** a user attempts to submit the Add Entry form without selecting a dictionary
- **THEN** the form does not submit and indicates the dictionary is required

### Requirement: Headword Field

The Add Entry form SHALL provide a required Headword field representing the entry's primary word.

#### Scenario: Submission blocked without a Headword
- **WHEN** a user attempts to submit the Add Entry form with an empty Headword
- **THEN** the form does not submit and indicates the Headword is required

### Requirement: Headword Duplicate Validation

Before an entry can be submitted, the system SHALL verify the Headword does not already exist within the selected dictionary as either an existing Headword or an existing Inflection belonging to another entry. The comparison SHALL be case-insensitive and SHALL ignore leading/trailing whitespace. This validation SHALL be enforced on the server even when a client-side check has already run.

#### Scenario: Duplicate of an existing Headword is rejected
- **WHEN** a user submits a Headword that already exists as a Headword in the selected dictionary (ignoring case and surrounding whitespace)
- **THEN** the submission is rejected, the Headword field is shown in its invalid/error state, and the message "The word already exists in the dictionary." is displayed beneath it

#### Scenario: Duplicate of an existing Inflection is rejected
- **WHEN** a user submits a Headword that already exists as an Inflection of another entry in the selected dictionary (ignoring case and surrounding whitespace)
- **THEN** the submission is rejected, the Headword field is shown in its invalid/error state, and the message "The word already exists in the dictionary." is displayed beneath it

#### Scenario: Server rejects a duplicate even if client-side validation is bypassed
- **WHEN** a create-entry API request is made with a Headword that already exists (as a Headword or Inflection) in the target dictionary
- **THEN** the API rejects the request and does not create the entry

### Requirement: Definition Field

The Add Entry form SHALL provide a required, multiline Definition field with a maximum length of 5,000 characters. Input exceeding the maximum SHALL be rejected, not silently truncated.

#### Scenario: Submission blocked without a Definition
- **WHEN** a user attempts to submit the Add Entry form with an empty Definition
- **THEN** the form does not submit and indicates the Definition is required

#### Scenario: Over-length Definition is rejected, not truncated
- **WHEN** a user submits a Definition longer than 5,000 characters
- **THEN** the submission is rejected with a validation message, and the entry is not saved with a truncated Definition

### Requirement: Inflection Management

The Add Entry form SHALL allow the user to add zero or more Inflections to the entry being created, and to remove a previously-added Inflection before saving. Each Inflection value SHALL be trimmed of leading/trailing whitespace before validation or saving.

#### Scenario: User adds an Inflection
- **WHEN** a user enters a word and adds it as an Inflection
- **THEN** the word appears in the list of Inflections for the entry being created

#### Scenario: User removes an Inflection before saving
- **WHEN** a user removes a previously-added Inflection from the current unsaved entry
- **THEN** that word no longer appears in the list of Inflections for the entry

### Requirement: Inflection Duplicate Validation

When a user attempts to add an Inflection, the system SHALL verify the word does not already exist within the selected dictionary as an existing Headword, an existing Inflection, or another Inflection already added to the current unsaved entry, and SHALL verify the word is not identical to the Headword being entered (case-insensitive, whitespace-trimmed in all comparisons). A duplicate SHALL NOT be added; the system SHALL display a toast notification stating "The word already exists in the dictionary." This validation SHALL also be enforced on the server at save time.

#### Scenario: Inflection duplicating an existing Headword is rejected
- **WHEN** a user attempts to add an Inflection matching an existing Headword in the selected dictionary
- **THEN** the Inflection is not added and a toast notification reads "The word already exists in the dictionary."

#### Scenario: Inflection duplicating an existing Inflection is rejected
- **WHEN** a user attempts to add an Inflection matching an existing Inflection of any entry in the selected dictionary
- **THEN** the Inflection is not added and a toast notification reads "The word already exists in the dictionary."

#### Scenario: Inflection duplicating another Inflection in the same unsaved entry is rejected
- **WHEN** a user attempts to add an Inflection that matches one already added to the entry currently being created
- **THEN** the Inflection is not added and a toast notification reads "The word already exists in the dictionary."

#### Scenario: Inflection identical to the Headword is rejected
- **WHEN** a user attempts to add an Inflection identical to the Headword being entered (case-insensitive, whitespace-trimmed)
- **THEN** the Inflection is not added and a toast notification reads "The word already exists in the dictionary."

### Requirement: Saving a New Entry

When a user saves a valid entry, the system SHALL persist the Headword, Definition, and all associated Inflections; associate the entry with the selected dictionary and with the submitting authenticated user; record the submission timestamp; and set the entry's approval status to Pending. The entry SHALL NOT be included in any generated dictionary output while Pending. A success toast SHALL be displayed only after the server confirms the entry was persisted, worded similarly to "Your entry has been saved. It must be approved before it can be included in the generated Kindle dictionary." The system SHALL prevent duplicate submissions caused by repeated clicks while a save request is already in progress.

#### Scenario: Valid entry is saved as Pending
- **WHEN** an authenticated user submits a valid entry (dictionary selected, Headword and Definition provided, no duplicate word)
- **THEN** the entry is persisted with approval status Pending, attributed to the submitting user, with a recorded creation timestamp

#### Scenario: Success toast only follows a confirmed save
- **WHEN** a valid entry submission is in flight and has not yet received a server response
- **THEN** no success toast is shown until the server confirms the entry was persisted

#### Scenario: Repeated clicks do not create duplicate submissions
- **WHEN** a user clicks the save action multiple times in quick succession while a save request is already in progress
- **THEN** only one entry is created

### Requirement: Entry Approval Status

Every entry SHALL have an approval status capable of representing at least Pending, Approved, and Rejected. An entry created through normal submission SHALL start in the Pending state. The system SHALL support storing an optional rejection note associated with an entry's review outcome.

#### Scenario: New entry starts Pending
- **WHEN** a new entry is successfully saved
- **THEN** its approval status is Pending

### Requirement: Word Uniqueness Scope and Concurrency Safety

A word (whether used as a Headword or an Inflection) SHALL be unique within a dictionary across the combined namespace of that dictionary's Headwords and Inflections. The same word MAY exist in a different dictionary. This uniqueness SHALL be enforced such that two concurrent submissions of the same word within the same dictionary cannot both succeed — the system SHALL guarantee, even under concurrent save attempts, that only one submission of a given word (within one dictionary) is ever persisted, with any losing attempt receiving the same duplicate-word rejection a sequential attempt would receive.

#### Scenario: Same word allowed in a different dictionary
- **WHEN** a word already used as a Headword in one dictionary is submitted as a Headword in a different dictionary
- **THEN** the submission in the different dictionary succeeds

#### Scenario: Concurrent submissions of the same word do not both succeed
- **WHEN** two users concurrently submit entries using the same word as their Headword within the same dictionary
- **THEN** exactly one submission succeeds and the other is rejected with the duplicate-word validation error, and no dictionary ever ends up with two entries/inflections sharing that word
