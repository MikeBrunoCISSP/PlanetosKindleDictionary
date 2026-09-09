## MODIFIED Requirements

### Requirement: Inflection Editing in Edit Mode

In edit mode, the user SHALL be able to add new Inflections and remove any of the entry's existing Inflections, using the same interaction conventions as the Add Entry screen. A new Inflection SHALL NOT contain any whitespace character, since Kindle's on-device word-lookup resolves only a single, whitespace-bounded word under the reader's tap. This SHALL be enforced on the server even when a client-side check has already run.

#### Scenario: User adds an Inflection while editing

- **WHEN** a user enters a word and adds it as an Inflection while in edit mode
- **THEN** the word appears in the draft's list of Inflections

#### Scenario: User removes an existing Inflection while editing

- **WHEN** a user removes one of the entry's current Inflections while in edit mode
- **THEN** that word no longer appears in the draft's list of Inflections

#### Scenario: Adding an Inflection containing whitespace while editing is rejected

- **WHEN** a user attempts to add an Inflection containing a space or other whitespace character while in edit mode
- **THEN** the Inflection is not added and a validation message indicates it cannot contain spaces

#### Scenario: Server rejects a whitespace-containing Inflection even if submitted directly

- **WHEN** an edit-submission request includes a proposed Inflection containing whitespace
- **THEN** the server rejects the request and no pending revision is created
