## MODIFIED Requirements

### Requirement: User Registration

The system SHALL allow a visitor to create a new account by supplying a unique Username, a unique Email address, a Reason for Joining, and a password that meets complexity requirements, subject to Cloudflare Turnstile verification when Turnstile is enabled. Username and Email uniqueness SHALL both be enforced case-insensitively and atomically at the database level, so that concurrent registration requests for the same Username or Email result in exactly one success and a `409 Conflict` for all others. On success the system SHALL create the account with approval status `PENDING` and role `MEMBER` — the client SHALL NOT be able to specify or influence either, regardless of request body contents — send a verification email to the supplied address, and return the new user's profile. The system SHALL NOT establish an authenticated session at registration time; the account cannot be used to log in until its email address has been verified.

#### Scenario: Successful registration

- **WHEN** a POST request is sent to `/api/auth/register` with a valid `{ username, email, reasonForJoining, password }` body (and a valid Turnstile token, when Turnstile is enabled)
- **THEN** the system creates a User record with approval status `PENDING` and role `MEMBER`, stores an Argon2id hash of the password, sends a verification email to the supplied address, does NOT open a session cookie, and returns `201` with `{ id, email, username, role, approvalStatus, createdAt }`

#### Scenario: Duplicate email rejected

- **WHEN** a POST request is sent to `/api/auth/register` with an email address already stored in the database
- **THEN** the system returns `409 Conflict` with an RFC 9457 problem body and does not create a record

#### Scenario: Duplicate email differing only in case is rejected

- **WHEN** a POST request is sent to `/api/auth/register` with an email address that matches an existing account's email only after case-insensitive comparison
- **THEN** the system returns `409 Conflict` and does not create a record

#### Scenario: Duplicate display name rejected

- **WHEN** a POST request is sent to `/api/auth/register` with a username already in use
- **THEN** the system returns `409 Conflict` with an RFC 9457 problem body

#### Scenario: Duplicate username differing only in case is rejected

- **WHEN** a POST request is sent to `/api/auth/register` with a username that matches an existing account's username only after case-insensitive comparison
- **THEN** the system returns `409 Conflict` and does not create a record

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

#### Scenario: Client cannot set approval status

- **WHEN** a POST request is sent to `/api/auth/register` with an `approvalStatus` field set to `"APPROVED"` in the body
- **THEN** the created account's approval status is `PENDING`, ignoring the client-supplied value

#### Scenario: Client cannot set role

- **WHEN** a POST request is sent to `/api/auth/register` with a `role` field set to `"ADMIN"` in the body
- **THEN** the created account's role is `MEMBER`, ignoring the client-supplied value
