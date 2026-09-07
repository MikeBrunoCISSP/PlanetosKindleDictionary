## ADDED Requirements

### Requirement: Entry Creation Is Rate-Limited Per User

The system SHALL limit how many entry-creation requests a single authenticated user may make within a rolling window, independent of any IP-based limit. A request that exceeds this limit SHALL be rejected without creating an entry.

#### Scenario: Requests within the limit succeed

- **WHEN** an approved user submits entry-creation requests at or below the configured per-user rate
- **THEN** each request is processed normally

#### Scenario: Exceeding the per-user limit is rejected

- **WHEN** an approved user submits more entry-creation requests within the rolling window than the configured limit allows
- **THEN** the excess requests are rejected and no entry is created for them

#### Scenario: Different users are limited independently

- **WHEN** two different approved users each submit entry-creation requests from the same network address
- **THEN** each user's requests are counted against that user's own limit, not a shared one

### Requirement: Entry Creation Enforces a Finite Inflection Count

The system SHALL reject an entry-creation request whose Inflections list exceeds a fixed maximum count, before any database write occurs.

#### Scenario: Inflection count within the limit is accepted

- **WHEN** a create-entry request includes a number of Inflections at or below the maximum
- **THEN** the request is processed normally

#### Scenario: Excessive inflection count is rejected before any write

- **WHEN** a create-entry request includes more Inflections than the maximum allowed
- **THEN** the request is rejected with a validation error and no entry, inflection, or related record is created
