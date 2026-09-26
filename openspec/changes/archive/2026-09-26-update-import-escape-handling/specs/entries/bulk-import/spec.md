## MODIFIED Requirements

### Requirement: Line Breaks and Tabs in Definitions Are Normalized

A definition containing newline characters SHALL be stored such that each newline renders as a line break when the entry is viewed, not as literal newline text. A Windows-style line ending (a carriage return immediately followed by a newline) SHALL be treated the same as two consecutive newline characters, rendering as two line breaks, rather than as a single line break plus a stray leftover character. A carriage return that is not immediately followed by a newline SHALL be treated the same as a single newline character, rendering as one line break. A definition containing a tab character SHALL be stored such that it renders as visible horizontal spacing when the entry is viewed, rather than collapsing to no visible effect as plain whitespace would.

#### Scenario: Multi-paragraph definition renders with line breaks

- **WHEN** an uploaded definition contains one or more newline characters
- **THEN** the created entry's definition renders each newline as a line break, not as literal text

#### Scenario: Windows-style line ending renders as two line breaks

- **WHEN** an uploaded definition contains a carriage return immediately followed by a newline
- **THEN** the created entry's definition renders that pair as two line breaks, the same as it would for two consecutive newline characters

#### Scenario: Standalone carriage return renders as one line break

- **WHEN** an uploaded definition contains a carriage return that is not immediately followed by a newline
- **THEN** the created entry's definition renders it as a single line break, not as literal or stray text

#### Scenario: Tab character renders as visible spacing

- **WHEN** an uploaded definition contains a tab character
- **THEN** the created entry's definition renders it as visible horizontal spacing, not as literal text and not collapsed away entirely
