## MODIFIED Requirements

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

- **WHEN** the Register form is submitted with `password` and `confirmPassword` values that differ
- **THEN** a validation error is displayed adjacent to the `confirmPassword` field before the request is sent to the API

#### Scenario: Password rule violations shown inline

- **WHEN** the Register form is submitted with a password that violates the complexity rules
- **THEN** the specific rule violation(s) are displayed adjacent to the password field before the request is sent to the API

#### Scenario: Authenticated user visiting /login

- **WHEN** a user who already has an active session navigates to `/login`
- **THEN** the page redirects them to `/` without displaying any form

#### Scenario: Forgot Password link navigates to the request form

- **WHEN** a user on the Sign In form clicks "Forgot Password?"
- **THEN** the page navigates to `/login?mode=forgot-password` and shows a form asking for username or email, replacing the Sign In/Register tabs

## ADDED Requirements

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
