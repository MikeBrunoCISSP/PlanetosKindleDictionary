## MODIFIED Requirements

### Requirement: Definition Field

The Add Entry form SHALL provide a required, multiline Definition field with a maximum length of 5,000 characters. Input exceeding the maximum SHALL be rejected, not silently truncated. The Definition SHALL be trimmed of leading/trailing whitespace before the required check is applied, so a whitespace-only value is rejected the same as an empty one. The form's overall width SHALL scale up to 768 px on viewports wide enough to accommodate it, giving the Definition field more horizontal room; on narrower viewports, including phone-sized viewports, the form SHALL continue to fit fully within the viewport with no horizontal overflow.

#### Scenario: Submission blocked without a Definition
- **WHEN** a user attempts to submit the Add Entry form with an empty Definition
- **THEN** the form does not submit and indicates the Definition is required

#### Scenario: Submission blocked with a whitespace-only Definition
- **WHEN** a user attempts to submit the Add Entry form with a Definition consisting only of whitespace
- **THEN** the form does not submit and indicates the Definition is required

#### Scenario: Over-length Definition is rejected, not truncated
- **WHEN** a user submits a Definition longer than 5,000 characters
- **THEN** the submission is rejected with a validation message, and the entry is not saved with a truncated Definition

#### Scenario: Form widens on a desktop-sized viewport
- **WHEN** a user views the Add Entry form at a viewport width of 768 px or wider
- **THEN** the form renders at up to 768 px wide, giving the Definition field more horizontal room than at narrower viewports

#### Scenario: Form remains fully responsive on a phone-sized viewport
- **WHEN** a user views the Add Entry form at a phone-sized viewport, down to 360 px
- **THEN** the form fits fully within the viewport width, with no horizontal overflow
