## MODIFIED Requirements

### Requirement: Forgot Password Request

The system SHALL accept a username-or-email identifier and, regardless of whether it matches an account, always respond with the same generic confirmation message, disclosing nothing about whether an account exists. If the identifier matches a registered, active account, the system SHALL generate a single-use, time-limited password reset token for that account and queue a reset link containing it for delivery to the account's registered email address. A match against an inactive (disabled) account SHALL be treated the same as no match — no email is queued, and the response is identical either way. Any previously issued unused reset token for that account SHALL NOT be invalidated until the replacement token and its delivery both have a durable record — an interrupted request SHALL leave a previously issued, still-valid token usable rather than invalidating it with no replacement ready.

#### Scenario: Matching active account receives a reset email

- **WHEN** a request identifies an existing, active account by username or by email
- **THEN** a reset email is queued for delivery to that account's email address, and the response is the generic confirmation message

#### Scenario: Unknown identifier gives the same response

- **WHEN** a request identifies no existing account
- **THEN** no email is queued, and the response is the same generic confirmation message as the matching case, with no indication that no account was found

#### Scenario: Disabled account gives the same response

- **WHEN** a request identifies an existing account whose `isActive` is `false`
- **THEN** no email is queued, and the response is the same generic confirmation message as the matching case

#### Scenario: Forgot-password rate limit exceeded

- **WHEN** more than 5 forgot-password requests originate from the same IP address within a rolling 60-minute window
- **THEN** the system returns `429 Too Many Requests` with a `Retry-After` header

#### Scenario: A prior token survives an interrupted replacement

- **WHEN** a forgot-password request fails after generating a replacement token but before that replacement has a durable delivery record
- **THEN** the account's previously issued, still-valid reset token remains usable

### Requirement: Resend Verification Email

The system SHALL accept a username-or-email identifier and, regardless of whether it matches an account needing verification, always respond with the same generic confirmation message, disclosing nothing about whether an account exists or is already verified. If the identifier matches a registered, active account whose email is not yet verified, the system SHALL generate a new single-use, time-limited verification token and queue the new link for delivery to the account's registered email address. Any previously issued unused verification token for that account SHALL NOT be invalidated until the replacement token and its delivery both have a durable record — an interrupted request SHALL leave a previously issued, still-valid token usable rather than invalidating it with no replacement ready.

#### Scenario: Matching unverified active account receives a new verification email

- **WHEN** a request identifies an existing, active account whose email is not yet verified
- **THEN** a new verification email is queued for delivery to that account's email address, and the response is the generic confirmation message

#### Scenario: Already-verified account gives the same response

- **WHEN** a request identifies an existing account whose email is already verified
- **THEN** no email is queued, and the response is the same generic confirmation message as the matching case

#### Scenario: Unknown identifier gives the same response

- **WHEN** a request identifies no existing account
- **THEN** no email is queued, and the response is the same generic confirmation message as the matching case

#### Scenario: Disabled account gives the same response

- **WHEN** a request identifies an existing account whose `isActive` is `false`
- **THEN** no email is queued, and the response is the same generic confirmation message as the matching case

#### Scenario: Resend rate limit exceeded

- **WHEN** more than 5 resend-verification requests originate from the same IP address within a rolling 60-minute window
- **THEN** the system returns `429 Too Many Requests` with a `Retry-After` header

#### Scenario: A prior token survives an interrupted replacement

- **WHEN** a resend-verification request fails after generating a replacement token but before that replacement has a durable delivery record
- **THEN** the account's previously issued, still-valid verification token remains usable
