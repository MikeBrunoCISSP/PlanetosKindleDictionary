## MODIFIED Requirements

### Requirement: Password Reset Token Redemption

The system SHALL allow a visitor holding a valid, unexpired, unused password reset token to set a new password for the associated account, subject to the same password complexity rules as registration. On success the token SHALL be invalidated so it cannot be used again, and any other outstanding unused reset tokens for that account SHALL also be invalidated. The system SHALL NOT automatically establish a session on success. An invalid, expired, or already-used token SHALL be rejected with a single generic error that does not distinguish between those cases. When two requests attempt to redeem the same token concurrently, exactly one SHALL succeed; the other SHALL be rejected as if the token were already used.

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

#### Scenario: Concurrent redemption attempts: only one succeeds

- **WHEN** two requests submit the same valid, unexpired, unused reset token at the same time, each with a different new password
- **THEN** exactly one request succeeds and sets its password, the other is rejected with the generic invalid-or-expired error, and the account's password matches only the winning request's value

### Requirement: Email Verification

The system SHALL allow a visitor holding a valid, unexpired, unused email verification token to mark the associated account's email address as verified. On success the token SHALL be invalidated so it cannot be used again. The system SHALL NOT automatically establish a session on success. An invalid, expired, or already-used token SHALL be rejected with a single generic error that does not distinguish between those cases. Accounts that existed before this capability shipped SHALL already be marked verified and never need to redeem a token. When two requests attempt to redeem the same token concurrently, exactly one SHALL succeed; the other SHALL be rejected as if the token were already used.

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

#### Scenario: Concurrent redemption attempts: only one succeeds

- **WHEN** two requests submit the same valid, unexpired, unused verification token at the same time
- **THEN** exactly one request succeeds, the other is rejected with the generic invalid-or-expired error, and the token is invalidated exactly once
