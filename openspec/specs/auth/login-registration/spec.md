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

The front-end SHALL expose a single `/login` route that presents both a Sign In form and a Register form accessible via a tab toggle. The active tab SHALL be controllable via the URL query parameter `?mode=login` (default), `?mode=register`, or `?mode=forgot-password`. The Sign In form SHALL include a "Forgot Password?" link that navigates to `?mode=forgot-password`, replacing the tabbed Sign In/Register content with a single form asking for the user's username or email address.

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

- **WHEN** the Register form's Confirm Password field has content that does not match the current value of the Password field
- **THEN** a mismatch indicator is displayed adjacent to the Confirm Password field immediately, live as the values differ, without requiring a submit attempt

#### Scenario: Confirm-password mismatch clears once the values match

- **WHEN** the Register form's Confirm Password field is edited so that it now matches the current value of the Password field
- **THEN** the mismatch indicator is no longer displayed

#### Scenario: Password rule violations shown inline

- **WHEN** the Register form's Password field has content that violates one or more complexity rules
- **THEN** each violated rule is shown as unsatisfied in the password requirement checklist beneath the field, live as the user types, without requiring a submit attempt (see the Password Requirement Checklist requirement for the checklist's own behavior)

#### Scenario: Authenticated user visiting /login

- **WHEN** a user who already has an active session navigates to `/login`
- **THEN** the page redirects them to `/` without displaying any form

#### Scenario: Forgot Password link navigates to the request form

- **WHEN** a user on the Sign In form clicks "Forgot Password?"
- **THEN** the page navigates to `/login?mode=forgot-password` and shows a form asking for username or email, replacing the Sign In/Register tabs

### Requirement: Password Requirement Checklist

The Register form SHALL display the password complexity rules as a bulleted checklist beneath the Password field, visible regardless of whether the field currently has content. Each rule SHALL be shown as its own list item; an item SHALL switch to a green checkmark the moment the current Password field value satisfies that rule, live as the user types, and SHALL revert to its unsatisfied appearance if a later edit no longer satisfies it. The Password field SHALL NOT additionally display the bundled rule-violation text message that a failed submit previously produced — the checklist is the sole feedback for password complexity.

#### Scenario: Checklist visible before typing

- **WHEN** the Register form is shown and the Password field is empty
- **THEN** all password requirement items are visible in their unsatisfied state

#### Scenario: A requirement turns to a checkmark as it's satisfied

- **WHEN** the user types a Password field value that satisfies one of the requirements (minimum length, an uppercase letter, a lowercase letter, or a digit)
- **THEN** that requirement's list item switches to a green checkmark immediately, without requiring a submit attempt

#### Scenario: A satisfied requirement reverts if no longer met

- **WHEN** the user edits the Password field so that a previously-satisfied requirement is no longer met
- **THEN** that requirement's list item reverts to its unsatisfied appearance

#### Scenario: All requirements satisfied

- **WHEN** the Password field value satisfies every complexity rule
- **THEN** every item in the checklist shows a green checkmark

### Requirement: Forgot Password Request

The system SHALL accept a username-or-email identifier and, regardless of whether it matches an account, always respond with the same generic confirmation message, disclosing nothing about whether an account exists. If the identifier matches a registered, active account, the system SHALL generate a single-use, time-limited password reset token for that account and email a reset link containing it to the account's registered email address. A match against an inactive (disabled) account SHALL be treated the same as no match — no email is sent, and the response is identical either way.

#### Scenario: Matching active account receives a reset email

- **WHEN** a request identifies an existing, active account by username or by email
- **THEN** a reset email is sent to that account's email address, and the response is the generic confirmation message

#### Scenario: Unknown identifier gives the same response

- **WHEN** a request identifies no existing account
- **THEN** no email is sent, and the response is the same generic confirmation message as the matching case, with no indication that no account was found

#### Scenario: Disabled account gives the same response

- **WHEN** a request identifies an existing account whose `isActive` is `false`
- **THEN** no email is sent, and the response is the same generic confirmation message as the matching case

#### Scenario: Forgot-password rate limit exceeded

- **WHEN** more than 5 forgot-password requests originate from the same IP address within a rolling 60-minute window
- **THEN** the system returns `429 Too Many Requests` with a `Retry-After` header

### Requirement: Password Reset Token Redemption

The system SHALL allow a visitor holding a valid, unexpired, unused password reset token to set a new password for the associated account, subject to the same password complexity rules as registration. On success the token SHALL be invalidated so it cannot be used again, and any other outstanding unused reset tokens for that account SHALL also be invalidated. The system SHALL NOT automatically establish a session on success. An invalid, expired, or already-used token SHALL be rejected with a single generic error that does not distinguish between those cases.

#### Scenario: Valid token sets a new password

- **WHEN** a request submits a valid, unexpired, unused reset token with a new password meeting complexity rules
- **THEN** the account's password is updated, the token is invalidated, and no session is established

#### Scenario: Reusing a token fails

- **WHEN** a request submits a reset token that has already been used successfully
- **THEN** the request is rejected with the generic invalid-or-expired error and the password is not changed

#### Scenario: Expired token fails

- **WHEN** a request submits a reset token past its expiry time
- **THEN** the request is rejected with the generic invalid-or-expired error and the password is not changed

#### Scenario: Unknown token fails

- **WHEN** a request submits a token that does not correspond to any issued reset token
- **THEN** the request is rejected with the same generic invalid-or-expired error as an expired or reused token

#### Scenario: Requesting a new reset invalidates prior ones

- **WHEN** an account has an outstanding unused reset token and a new forgot-password request is made for that same account
- **THEN** the previously issued token can no longer be redeemed, only the newest one can

### Requirement: Reset-Password Page

The front-end SHALL expose a `/reset-password` route that reads a reset token from the URL and presents a form to set a new password, enforcing the same complexity rules shown at registration. On successful submission the user SHALL be redirected to `/login` with an indication that they can now sign in with their new password. On a rejected (invalid/expired/reused) token, the page SHALL show a clear message rather than a broken form.

#### Scenario: Valid token shows the reset form

- **WHEN** a visitor opens `/reset-password?token=...` with a token that is still valid
- **THEN** a form to set a new password is shown

#### Scenario: Successful reset redirects to login

- **WHEN** the reset form is submitted with a valid token and a password meeting complexity rules
- **THEN** the visitor is redirected to `/login` and shown confirmation that their password was reset

#### Scenario: Invalid or expired token shows a clear error

- **WHEN** a visitor opens `/reset-password` with a missing, invalid, or expired token, or the reset form submission is rejected as such
- **THEN** a clear message is shown indicating the link is invalid or expired, rather than a broken or silently-failing form
