## MODIFIED Requirements

### Requirement: User Registration

The system SHALL allow a visitor to create a new account by supplying a unique Username, a unique Email address, a Reason for Joining, and a password that meets complexity requirements, subject to Cloudflare Turnstile verification when Turnstile is enabled. Username and Email uniqueness SHALL both be enforced case-insensitively. On success the system SHALL create the account with approval status `PENDING` and role `MEMBER` — the client SHALL NOT be able to specify or influence either, regardless of request body contents — send a verification email to the supplied address, and return the new user's profile. The system SHALL NOT establish an authenticated session at registration time; the account cannot be used to log in until its email address has been verified.

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

## ADDED Requirements

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
