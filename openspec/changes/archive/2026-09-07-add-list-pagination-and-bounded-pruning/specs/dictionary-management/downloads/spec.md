## MODIFIED Requirements

### Requirement: Public Build History

The system SHALL let any visitor view a series' build history, showing at least each build's outcome, when it ran, and how many entries it contained, capped at a fixed server-enforced maximum number of the most recent builds. This history SHALL NOT expose internal diagnostic detail such as error messages or logs to visitors who are not administrators.

#### Scenario: Visitor views build history

- **WHEN** any visitor requests a series' build history
- **THEN** they see each past build's outcome, timestamp, and entry count

#### Scenario: Diagnostic detail is not exposed publicly

- **WHEN** a non-administrator visitor requests a series' build history and one of its builds failed
- **THEN** the failed build's internal error detail is not included in what they see

#### Scenario: Build history is capped to the most recent builds

- **WHEN** a series has more builds than the server-enforced maximum
- **THEN** only that many of its most recent builds are returned, newest first
