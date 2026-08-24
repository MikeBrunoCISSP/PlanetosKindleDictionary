## MODIFIED Requirements

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
