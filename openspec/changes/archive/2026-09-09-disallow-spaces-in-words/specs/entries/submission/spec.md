## MODIFIED Requirements

### Requirement: Headword Field

The Add Entry form SHALL provide a required Headword field representing the entry's primary word. The Headword SHALL NOT contain any whitespace character, since Kindle's on-device word-lookup resolves only a single, whitespace-bounded word under the reader's tap — a Headword containing whitespace could never be reached through that lookup. This SHALL be enforced on the server even when a client-side check has already run.

#### Scenario: Submission blocked without a Headword
- **WHEN** a user attempts to submit the Add Entry form with an empty Headword
- **THEN** the form does not submit and indicates the Headword is required

#### Scenario: Submission blocked with a Headword containing whitespace
- **WHEN** a user attempts to submit the Add Entry form with a Headword containing a space or other whitespace character
- **THEN** the form does not submit and indicates the Headword cannot contain spaces

#### Scenario: Server rejects a whitespace-containing Headword even if submitted directly
- **WHEN** a create-entry API request is made with a Headword containing whitespace
- **THEN** the API rejects the request and does not create the entry

### Requirement: Inflection Management

The Add Entry form SHALL allow the user to add zero or more Inflections to the entry being created, and to remove a previously-added Inflection before saving. Each Inflection value SHALL be trimmed of leading/trailing whitespace before validation or saving. An Inflection SHALL NOT contain any internal whitespace character, for the same reason a Headword cannot: it could never be reached through Kindle's single-word tap-to-lookup. This SHALL be enforced on the server even when a client-side check has already run.

#### Scenario: User adds an Inflection
- **WHEN** a user enters a word and adds it as an Inflection
- **THEN** the word appears in the list of Inflections for the entry being created

#### Scenario: User removes an Inflection before saving
- **WHEN** a user removes a previously-added Inflection from the current unsaved entry
- **THEN** that word no longer appears in the list of Inflections for the entry

#### Scenario: Adding an Inflection containing whitespace is rejected
- **WHEN** a user attempts to add an Inflection containing a space or other whitespace character
- **THEN** the Inflection is not added and a validation message indicates it cannot contain spaces

#### Scenario: Server rejects a whitespace-containing Inflection even if submitted directly
- **WHEN** a create-entry API request includes an Inflection containing whitespace
- **THEN** the API rejects the request and does not create the entry
