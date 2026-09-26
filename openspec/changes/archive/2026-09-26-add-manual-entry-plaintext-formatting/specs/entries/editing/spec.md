## MODIFIED Requirements

### Requirement: Definition Editing

In edit mode, the Definition SHALL be editable via a multiline control, subject to the same rules used when creating a new entry: required, a maximum of 5,000 characters, no silent truncation, and trimmed of leading/trailing whitespace before validation. A blank or whitespace-only Definition SHALL disable the Submit button, and SHALL also be rejected by the server independently of the client-side disabled state. The edit form's overall width SHALL scale up to 768 px on viewports wide enough to accommodate it, giving the Definition field more horizontal room; on narrower viewports, including phone-sized viewports, the form SHALL continue to fit fully within the viewport with no horizontal overflow. As with new-entry submission, the Definition SHALL be treated as plain text, not as HTML markup: a blank-line paragraph break, a Windows-style line ending, a standalone carriage return, and a tab character SHALL each be stored such that they render as a visible line break or visible spacing when the entry is viewed. A literal `<` or `&` character in the submitted text SHALL be preserved and rendered as ordinary visible text rather than being interpreted as HTML markup.

#### Scenario: Blank Definition disables Submit

- **WHEN** a user clears the Definition to empty or whitespace-only while in edit mode
- **THEN** the Submit button is disabled

#### Scenario: Server rejects a blank Definition even if submitted directly

- **WHEN** an edit-submission request is made with a blank or whitespace-only Definition
- **THEN** the server rejects the request and no pending revision is created

#### Scenario: Over-length Definition is rejected, not truncated

- **WHEN** a user submits an edit with a Definition longer than 5,000 characters
- **THEN** the submission is rejected with a validation message, and no pending revision is created with a truncated Definition

#### Scenario: Edit form widens on a desktop-sized viewport

- **WHEN** a user views the edit form at a viewport width of 768 px or wider
- **THEN** the form renders at up to 768 px wide, giving the Definition field more horizontal room than at narrower viewports

#### Scenario: Edit form remains fully responsive on a phone-sized viewport

- **WHEN** a user views the edit form at a phone-sized viewport, down to 360 px
- **THEN** the form fits fully within the viewport width, with no horizontal overflow

#### Scenario: Paragraph break renders as a line break

- **WHEN** a user submits an edit whose Definition contains a blank-line paragraph break
- **THEN** the resulting definition (applied immediately for an administrator, or shown in the pending revision) renders that break as a visible line break, not as run-together text

#### Scenario: Tab character renders as visible spacing

- **WHEN** a user submits an edit whose Definition contains a tab character
- **THEN** the resulting definition renders it as visible horizontal spacing, not collapsed away entirely

#### Scenario: Literal angle bracket or ampersand is preserved as visible text

- **WHEN** a user submits an edit whose Definition contains a literal `<` or `&` character as part of ordinary prose
- **THEN** the resulting definition displays that character as ordinary visible text, and it is not interpreted as the start of HTML markup

#### Scenario: Re-opening Edit shows plain text, not the underlying markup

- **WHEN** a user enters edit mode on an entry whose Definition previously rendered with a line break or visible spacing
- **THEN** the Definition control shows plain text with an ordinary line break or space where that formatting was, not the literal underlying markup, and submitting the form without changing that text does not alter the entry's rendered formatting
