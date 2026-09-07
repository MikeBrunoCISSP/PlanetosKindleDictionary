## ADDED Requirements

### Requirement: Edit Proposal Submission Is Rate-Limited Per User

The system SHALL limit how many edit-proposal-submission requests a single authenticated user may make within a rolling window, independent of any IP-based limit, regardless of the account's approval status. A request that exceeds this limit SHALL be rejected without creating a proposal.

#### Scenario: Requests within the limit succeed

- **WHEN** an authenticated user submits edit-proposal requests at or below the configured per-user rate
- **THEN** each request is processed normally

#### Scenario: Exceeding the per-user limit is rejected

- **WHEN** an authenticated user, including one whose account is still pending approval, submits more edit-proposal requests within the rolling window than the configured limit allows
- **THEN** the excess requests are rejected and no proposal is created for them

### Requirement: Edit Proposal Submission Enforces a Finite Inflection Count

The system SHALL reject an edit-proposal-submission request whose Inflections list exceeds a fixed maximum count, before any database write occurs.

#### Scenario: Inflection count within the limit is accepted

- **WHEN** an edit-proposal request includes a number of Inflections at or below the maximum
- **THEN** the request is processed normally

#### Scenario: Excessive inflection count is rejected before any write

- **WHEN** an edit-proposal request includes more Inflections than the maximum allowed
- **THEN** the request is rejected with a validation error and no proposal or related record is created
