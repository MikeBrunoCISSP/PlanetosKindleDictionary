## MODIFIED Requirements

### Requirement: Definition Field

The Add Entry form SHALL provide a required, multiline Definition field with a maximum length of 5,000 characters. Input exceeding the maximum SHALL be rejected, not silently truncated. The Definition SHALL be trimmed of leading/trailing whitespace before the required check is applied, so a whitespace-only value is rejected the same as an empty one.

#### Scenario: Submission blocked without a Definition
- **WHEN** a user attempts to submit the Add Entry form with an empty Definition
- **THEN** the form does not submit and indicates the Definition is required

#### Scenario: Submission blocked with a whitespace-only Definition
- **WHEN** a user attempts to submit the Add Entry form with a Definition consisting only of whitespace
- **THEN** the form does not submit and indicates the Definition is required

#### Scenario: Over-length Definition is rejected, not truncated
- **WHEN** a user submits a Definition longer than 5,000 characters
- **THEN** the submission is rejected with a validation message, and the entry is not saved with a truncated Definition
