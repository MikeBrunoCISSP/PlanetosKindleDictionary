## MODIFIED Requirements

### Requirement: User Registration

The system SHALL allow a visitor to create a new account by supplying a unique email address, a unique display name, and a password that meets complexity requirements. On success the system SHALL send a verification email to the supplied address and return the new user's profile. The system SHALL NOT establish an authenticated session at registration time — the account cannot be used to log in until its email address has been verified.

#### Scenario: Successful registration

- **WHEN** a POST request is sent to `/api/auth/register` with a valid `{ email, displayName, password }` body
- **THEN** the system creates a User record, stores an Argon2id hash of the password, sends a verification email to the supplied address, and returns `201` with `{ id, email, displayName, role, createdAt }` — no session cookie is opened

#### Scenario: Duplicate email rejected

- **WHEN** a POST request is sent to `/api/auth/register` with an email address already stored in the database
- **THEN** the system returns `409 Conflict` with an RFC 9457 problem body and does not create a record

#### Scenario: Duplicate display name rejected

- **WHEN** a POST request is sent to `/api/auth/register` with a displayName already in use
- **THEN** the system returns `409 Conflict` with an RFC 9457 problem body

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

### Requirement: User Login

The system SHALL allow a registered, active, email-verified user to authenticate using their email address and password. On success the system SHALL establish a session and return the user's profile. A registered user whose account is disabled (`isActive = false`) SHALL NOT be able to authenticate; the system SHALL return `403 Forbidden` with an RFC 9457 problem body whose `type` is distinct from the generic invalid-credentials error. A registered user whose email address has not been verified SHALL likewise NOT be able to authenticate, rejected with `403 Forbidden` and a `type` distinct from both the invalid-credentials error and the disabled-account error.

#### Scenario: Successful login

- **WHEN** a POST request is sent to `/api/auth/login` with a valid `{ email, password }` matching a stored, active, verified user
- **THEN** the system opens a signed HTTP-only session cookie and returns `200` with `{ id, email, displayName, role, createdAt }`

#### Scenario: Wrong password

- **WHEN** a POST request is sent to `/api/auth/login` with a correct email but incorrect password
- **THEN** the system returns `401 Unauthorized` with a generic "Invalid credentials" problem body (no indication of which field was wrong)

#### Scenario: Unknown email

- **WHEN** a POST request is sent to `/api/auth/login` with an email address not in the database
- **THEN** the system returns `401 Unauthorized` with the same generic "Invalid credentials" problem body (no enumeration of registered addresses)

#### Scenario: Disabled account rejected at login

- **WHEN** a POST request is sent to `/api/auth/login` with valid credentials for a user whose `isActive` is `false`
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body and does NOT open a session

#### Scenario: Unverified email rejected at login

- **WHEN** a POST request is sent to `/api/auth/login` with valid credentials for a user whose email address has not been verified
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body distinct from the disabled-account error, and does NOT open a session

#### Scenario: Login rate limit exceeded

- **WHEN** more than 10 login requests originate from the same IP address within a rolling 15-minute window
- **THEN** the system returns `429 Too Many Requests` with a `Retry-After` header

## ADDED Requirements

### Requirement: Email Verification

The system SHALL allow a visitor holding a valid, unexpired, unused email verification token to mark the associated account's email address as verified. On success the token SHALL be invalidated so it cannot be used again. The system SHALL NOT automatically establish a session on success. An invalid, expired, or already-used token SHALL be rejected with a single generic error that does not distinguish between those cases. Accounts that existed before this capability shipped SHALL already be marked verified and never need to redeem a token.

#### Scenario: Valid token verifies the account

- **WHEN** a request submits a valid, unexpired, unused email verification token
- **THEN** the associated account's email is marked verified, the token is invalidated, and no session is established

#### Scenario: Reusing a token fails

- **WHEN** a request submits a verification token that has already been used successfully
- **THEN** the request is rejected with the generic invalid-or-expired error and the account's verified state is unchanged

#### Scenario: Expired token fails

- **WHEN** a request submits a verification token past its expiry time
- **THEN** the request is rejected with the generic invalid-or-expired error

#### Scenario: Unknown token fails

- **WHEN** a request submits a token that does not correspond to any issued verification token
- **THEN** the request is rejected with the same generic invalid-or-expired error as an expired or reused token

#### Scenario: Pre-existing accounts never need verification

- **WHEN** an account that existed before email verification was introduced attempts to log in with correct credentials
- **THEN** login succeeds without ever having redeemed a verification token

### Requirement: Resend Verification Email

The system SHALL accept a username-or-email identifier and, regardless of whether it matches an account needing verification, always respond with the same generic confirmation message, disclosing nothing about whether an account exists or is already verified. If the identifier matches a registered, active account whose email is not yet verified, the system SHALL generate a new single-use, time-limited verification token, invalidate any previously issued unused verification tokens for that account, and email the new link to the account's registered email address.

#### Scenario: Matching unverified active account receives a new verification email

- **WHEN** a request identifies an existing, active account whose email is not yet verified
- **THEN** a new verification email is sent to that account's email address, and the response is the generic confirmation message

#### Scenario: Already-verified account gives the same response

- **WHEN** a request identifies an existing account whose email is already verified
- **THEN** no email is sent, and the response is the same generic confirmation message as the matching case

#### Scenario: Unknown identifier gives the same response

- **WHEN** a request identifies no existing account
- **THEN** no email is sent, and the response is the same generic confirmation message as the matching case

#### Scenario: Disabled account gives the same response

- **WHEN** a request identifies an existing account whose `isActive` is `false`
- **THEN** no email is sent, and the response is the same generic confirmation message as the matching case

#### Scenario: Resend rate limit exceeded

- **WHEN** more than 5 resend-verification requests originate from the same IP address within a rolling 60-minute window
- **THEN** the system returns `429 Too Many Requests` with a `Retry-After` header
