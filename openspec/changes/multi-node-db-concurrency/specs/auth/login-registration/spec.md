## MODIFIED Requirements

### Requirement: User Registration

The system SHALL allow a visitor to create a new account by supplying a unique email address, a unique display name, and a password that meets complexity requirements. On success the system SHALL establish an authenticated session and return the new user's profile. The uniqueness constraint on email and display name SHALL be enforced atomically at the database level so that concurrent registration requests for the same email or display name result in exactly one success and a `409 Conflict` for all others.

#### Scenario: Successful registration

- **WHEN** a POST request is sent to `/api/auth/register` with a valid `{ email, displayName, password }` body
- **THEN** the system creates a User record, stores an Argon2id hash of the password, opens a signed HTTP-only session cookie, and returns `201` with `{ id, email, displayName, role, createdAt }`

#### Scenario: Duplicate email rejected

- **WHEN** a POST request is sent to `/api/auth/register` with an email address already stored in the database
- **THEN** the system returns `409 Conflict` with an RFC 9457 problem body and does not create a record

#### Scenario: Duplicate display name rejected

- **WHEN** a POST request is sent to `/api/auth/register` with a displayName already in use
- **THEN** the system returns `409 Conflict` with an RFC 9457 problem body

#### Scenario: Concurrent duplicate registration is rejected

- **WHEN** two simultaneous POST requests are sent to `/api/auth/register` with the same email address before either has committed
- **THEN** exactly one request returns `201 Created` and the other returns `409 Conflict` with an RFC 9457 problem body; no duplicate User record is created

#### Scenario: Password too short

- **WHEN** a POST request is sent to `/api/auth/register` with a password shorter than 8 characters
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `password` field

#### Scenario: Password missing required character class

- **WHEN** a POST request is sent to `/api/auth/register` with a password that is 8+ characters but lacks at least one uppercase letter, one lowercase letter, or one digit
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `password` field

#### Scenario: Invalid email format

- **WHEN** a POST request is sent to `/api/auth/register` with a malformed email string
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `email` field

#### Scenario: Registration rate limit exceeded

- **WHEN** more than 5 registration requests originate from the same IP address within a rolling 60-minute window
- **THEN** the system returns `429 Too Many Requests` with a `Retry-After` header and does not create any record
