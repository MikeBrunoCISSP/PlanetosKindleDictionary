## Purpose

Defines the behavioral contract for user registration and session-based login, including password complexity rules, rate limiting, and the combined `/login` front-end page that hosts both flows.

## Requirements

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

### Requirement: Username Field

The system SHALL require a Username at registration. Username SHALL be unique across all users, compared case-insensitively. Leading/trailing whitespace SHALL be trimmed before validation and before storage. A Username consisting only of whitespace SHALL be rejected as invalid.

#### Scenario: Missing username rejected

- **WHEN** a POST request is sent to `/api/auth/register` with an empty `username`
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `username` field

#### Scenario: Whitespace-only username rejected

- **WHEN** a POST request is sent to `/api/auth/register` with a `username` consisting only of whitespace characters
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `username` field

#### Scenario: Username is trimmed before storage

- **WHEN** a POST request is sent to `/api/auth/register` with a `username` surrounded by leading/trailing whitespace
- **THEN** the stored username has that whitespace removed

### Requirement: Reason for Joining Field

The system SHALL require a Reason for Joining at registration: a multiline free-text field, trimmed of leading/trailing whitespace before validation and storage, rejected if empty or whitespace-only after trimming, and rejected — not silently truncated — if it exceeds 2,000 characters. The value SHALL be persisted for administrator review and SHALL NOT be placed into authentication claims, session data, or cookies.

#### Scenario: Missing Reason for Joining rejected

- **WHEN** a POST request is sent to `/api/auth/register` with an empty `reasonForJoining`
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `reasonForJoining` field

#### Scenario: Whitespace-only Reason for Joining rejected

- **WHEN** a POST request is sent to `/api/auth/register` with a `reasonForJoining` consisting only of whitespace characters
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `reasonForJoining` field

#### Scenario: Over-length Reason for Joining rejected, not truncated

- **WHEN** a POST request is sent to `/api/auth/register` with a `reasonForJoining` longer than 2,000 characters
- **THEN** the system returns `400 Bad Request` and does not create a record with a truncated value

#### Scenario: Reason for Joining is not exposed in the session

- **WHEN** a user registers with a Reason for Joining and the resulting session cookie or `GET /api/auth/me` response is inspected
- **THEN** neither contains the Reason for Joining value

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

The system SHALL allow a registered, active, email-verified user to authenticate using either their Username or their Email address (a single identifier field), matched case-insensitively against both, together with their password. On success the system SHALL establish a session and return the user's profile. A registered user whose account is disabled (`isActive = false`) SHALL NOT be able to authenticate; the system SHALL return `403 Forbidden` with an RFC 9457 problem body whose `type` is distinct from the generic invalid-credentials error. A registered user whose email address has not been verified SHALL likewise NOT be able to authenticate, rejected with `403 Forbidden` and a `type` distinct from both the invalid-credentials error and the disabled-account error. All other authentication failures — unknown identifier or wrong password — SHALL return the same generic message, regardless of which case applies or whether the identifier matched a username or an email.

#### Scenario: Successful login with username

- **WHEN** a POST request is sent to `/api/auth/login` with `{ identifier: <username>, password }` matching a stored, active, email-verified user
- **THEN** the system opens a signed HTTP-only session cookie and returns `200` with `{ id, email, username, role, approvalStatus, createdAt }`

#### Scenario: Successful login

- **WHEN** a POST request is sent to `/api/auth/login` with `{ identifier: <email>, password }` matching a stored, active, email-verified user
- **THEN** the system opens a signed HTTP-only session cookie and returns `200` with the user's profile

#### Scenario: Successful login with email in a different case

- **WHEN** a POST request is sent to `/api/auth/login` with the identifier matching a stored user's email only after case-insensitive comparison, and the correct password
- **THEN** the login succeeds exactly as if the email had been submitted in its stored case

#### Scenario: Successful login with username in a different case

- **WHEN** a POST request is sent to `/api/auth/login` with the identifier matching a stored user's username only after case-insensitive comparison, and the correct password
- **THEN** the login succeeds exactly as if the username had been submitted in its stored case

#### Scenario: Wrong password

- **WHEN** a POST request is sent to `/api/auth/login` with a correct identifier but incorrect password
- **THEN** the system returns `401 Unauthorized` with a generic "Invalid username/email or password" problem body (no indication of which field was wrong)

#### Scenario: Unknown email

- **WHEN** a POST request is sent to `/api/auth/login` with an identifier resembling an email that matches no account's email
- **THEN** the system returns `401 Unauthorized` with the same generic problem body (no enumeration of registered accounts)

#### Scenario: Unknown username

- **WHEN** a POST request is sent to `/api/auth/login` with an identifier that matches no account's username
- **THEN** the system returns `401 Unauthorized` with the same generic problem body (no enumeration of registered accounts)

#### Scenario: Disabled account rejected at login

- **WHEN** a POST request is sent to `/api/auth/login` with valid credentials for a user whose `isActive` is `false`
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body and does NOT open a session

#### Scenario: Unverified email rejected at login

- **WHEN** a POST request is sent to `/api/auth/login` with valid credentials for a user whose email address has not been verified
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body distinct from the disabled-account error, and does NOT open a session

#### Scenario: Login rate limit exceeded

- **WHEN** more than 10 login requests originate from the same IP address within a rolling 15-minute window
- **THEN** the system returns `429 Too Many Requests` with a `Retry-After` header

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

The front-end SHALL expose a single `/login` route that presents both a Sign In form and a Register form accessible via a tab toggle. The active tab SHALL be controllable via the URL query parameter `?mode=login` (default), `?mode=register`, or `?mode=forgot-password`. The Sign In form's identifier field SHALL be labeled "Username or Email". The Sign In form SHALL include a "Forgot Password?" link that navigates to `?mode=forgot-password`, replacing the tabbed Sign In/Register content with a single form asking for the user's username or email address. The Register form SHALL include Username and Reason for Joining fields in addition to Email and Password, and SHALL render a Cloudflare Turnstile widget when Turnstile is enabled.

#### Scenario: Default tab is Sign In

- **WHEN** a user navigates to `/login` with no query parameter
- **THEN** the Sign In tab is active and its form is visible

#### Scenario: Register tab via query param

- **WHEN** a user navigates to `/login?mode=register`
- **THEN** the Register tab is active and its form is visible

#### Scenario: Sign In field labeled Username or Email

- **WHEN** the Sign In form is displayed
- **THEN** its identifier field is labeled "Username or Email"

#### Scenario: Register form includes Username and Reason for Joining fields

- **WHEN** the Register form is displayed
- **THEN** it includes a required Username field and a required, multiline "Why are you requesting to join?" field, in addition to Email and Password

#### Scenario: Turnstile widget renders when enabled

- **WHEN** the Register form is displayed and Turnstile is enabled in the current configuration
- **THEN** a Turnstile widget is rendered using the configured Site Key

#### Scenario: Turnstile widget does not render when disabled

- **WHEN** the Register form is displayed and Turnstile is disabled in the current configuration
- **THEN** no Turnstile widget is rendered and no token is required to submit the form

#### Scenario: Successful login redirects home

- **WHEN** the Sign In form is submitted with valid credentials
- **THEN** the user is redirected to `/` after the session is established

#### Scenario: Successful registration shows a check-your-email confirmation

- **WHEN** the Register form is submitted with all valid fields
- **THEN** the page does not navigate away and instead shows a confirmation that a verification email was sent, with an action to resend it

#### Scenario: Login blocked on an unverified account shows a resend action

- **WHEN** the Sign In form is submitted with credentials for an account whose email has not been verified
- **THEN** the page shows a distinct message explaining that verification is required, with an action to resend the verification email using the identifier already entered

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
