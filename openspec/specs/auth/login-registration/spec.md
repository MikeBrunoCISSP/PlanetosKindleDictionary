## Purpose

Defines the behavioral contract for user registration and session-based login, including password complexity rules, rate limiting, and the combined `/login` front-end page that hosts both flows.

## Requirements

### Requirement: User Registration

The system SHALL allow a visitor to create a new account by supplying a unique email address, a unique display name, and a password that meets complexity requirements. On success the system SHALL establish an authenticated session and return the new user's profile.

#### Scenario: Successful registration

- **WHEN** a POST request is sent to `/api/auth/register` with a valid `{ email, displayName, password }` body
- **THEN** the system creates a User record, stores an Argon2id hash of the password, opens a signed HTTP-only session cookie, and returns `201` with `{ id, email, displayName, role, createdAt }`

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

### Requirement: Password Complexity Rules

The system SHALL enforce password complexity through a shared Zod schema used by both the API and the frontend. A valid password MUST satisfy all of the following:

- Minimum length of 8 characters
- At least one uppercase letter (A–Z)
- At least one lowercase letter (a–z)
- At least one digit (0–9)

#### Scenario: All rules met

- **WHEN** a password is validated against the shared schema with the value `"Abc12345"`
- **THEN** the schema reports the value as valid

#### Scenario: No uppercase letter

- **WHEN** a password `"abc12345"` is validated against the shared schema
- **THEN** the schema reports an error referencing the uppercase requirement

#### Scenario: No digit

- **WHEN** a password `"AbcdefgH"` is validated against the shared schema
- **THEN** the schema reports an error referencing the digit requirement

### Requirement: User Login

The system SHALL allow a registered, active user to authenticate using their email address and password. On success the system SHALL establish a session and return the user's profile. A registered user whose account is disabled (`isActive = false`) SHALL NOT be able to authenticate; the system SHALL return `403 Forbidden` with an RFC 9457 problem body whose `type` is distinct from the generic invalid-credentials error.

#### Scenario: Successful login

- **WHEN** a POST request is sent to `/api/auth/login` with a valid `{ email, password }` matching a stored, active user
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

#### Scenario: Login rate limit exceeded

- **WHEN** more than 10 login requests originate from the same IP address within a rolling 15-minute window
- **THEN** the system returns `429 Too Many Requests` with a `Retry-After` header

### Requirement: Session Management

The system SHALL use HTTP-only, `SameSite=Lax`, signed cookies backed by Redis for session storage. Sessions SHALL NOT expose a session identifier in the JSON response body. On each authenticated request the system SHALL verify that the session's user account is still active; if the account has been disabled since the session was opened, the request SHALL be rejected with `403 Forbidden`.

#### Scenario: Session persists across requests

- **WHEN** a client holds a valid session cookie and sends `GET /api/auth/me`
- **THEN** the system returns `200` with the authenticated user's profile

#### Scenario: No session returns 401

- **WHEN** `GET /api/auth/me` is called without a session cookie or with an expired/invalid cookie
- **THEN** the system returns `401 Unauthorized`

#### Scenario: Logout destroys session

- **WHEN** a POST request is sent to `/api/auth/logout` with a valid session cookie
- **THEN** the system deletes the Redis session record, clears the cookie, and returns `204 No Content`

#### Scenario: Disabled account blocked mid-session

- **WHEN** `GET /api/auth/me` is called with a valid session cookie belonging to a user whose `isActive` has since been set to `false`
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body (the session record is not destroyed, but access is blocked)

### Requirement: Combined Login/Registration Page

The front-end SHALL expose a single `/login` route that presents both a Sign In form and a Register form accessible via a tab toggle. The active tab SHALL be controllable via the URL query parameter `?mode=login` (default) or `?mode=register`.

#### Scenario: Default tab is Sign In

- **WHEN** a user navigates to `/login` with no query parameter
- **THEN** the Sign In tab is active and its form is visible

#### Scenario: Register tab via query param

- **WHEN** a user navigates to `/login?mode=register`
- **THEN** the Register tab is active and its form is visible

#### Scenario: Successful login redirects home

- **WHEN** the Sign In form is submitted with valid credentials
- **THEN** the user is redirected to `/` after the session is established

#### Scenario: Successful registration redirects home

- **WHEN** the Register form is submitted with all valid fields
- **THEN** the user is redirected to `/` after the session is established

#### Scenario: Confirm-password mismatch

- **WHEN** the Register form is submitted with `password` and `confirmPassword` values that differ
- **THEN** a validation error is displayed adjacent to the `confirmPassword` field before the request is sent to the API

#### Scenario: Password rule violations shown inline

- **WHEN** the Register form is submitted with a password that violates the complexity rules
- **THEN** the specific rule violation(s) are displayed adjacent to the password field before the request is sent to the API

#### Scenario: Authenticated user visiting /login

- **WHEN** a user who already has an active session navigates to `/login`
- **THEN** the page redirects them to `/` without displaying any form
