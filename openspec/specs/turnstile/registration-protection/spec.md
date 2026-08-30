# registration-protection Specification

## Purpose

Protects public registration from automated/bot submissions using Cloudflare Turnstile, validated server-side, with fail-safe behavior whenever the feature is enabled but not correctly configured.

## Requirements

### Requirement: Turnstile Verification Gate

When Turnstile is enabled, the registration endpoint SHALL require a Turnstile token and SHALL validate it server-side against Cloudflare's Siteverify service before creating an account. The system SHALL NOT rely solely on client-side validation or on the mere presence of a token. Registration SHALL be rejected if the token is missing or if Siteverify reports the token invalid, in both cases without creating an account and without exposing implementation details or secret values in the error response.

#### Scenario: Missing token while enabled is rejected
- **WHEN** Turnstile is enabled and a registration request is submitted without a Turnstile token
- **THEN** the system rejects the request and does not create an account

#### Scenario: Failed Siteverify response prevents registration
- **WHEN** Turnstile is enabled and Cloudflare's Siteverify service reports the submitted token as invalid
- **THEN** the system rejects the request, does not create an account, and returns a validation error that does not reveal the Secret Key or other configuration details

#### Scenario: Valid token permits registration
- **WHEN** Turnstile is enabled and Cloudflare's Siteverify service confirms the submitted token is valid
- **THEN** registration proceeds through the rest of its normal validation

### Requirement: Turnstile Disabled Bypass

When Turnstile is disabled, the registration endpoint SHALL NOT require a Turnstile token and SHALL NOT attempt Siteverify validation. All other registration validation SHALL continue to apply normally.

#### Scenario: Disabled Turnstile does not require a token
- **WHEN** Turnstile is disabled and a registration request is submitted with no Turnstile token
- **THEN** the system does not reject the request for lack of a token, and registration proceeds through the rest of its normal validation

### Requirement: Fail-Safe on Misconfiguration

If Turnstile is enabled but its required configuration (Site Key or Secret Key) is missing, the system SHALL block registration rather than silently bypassing verification, and SHALL log a server-side configuration error.

#### Scenario: Enabled Turnstile with missing configuration fails safely
- **WHEN** Turnstile is enabled but no Secret Key is configured
- **THEN** registration requests are rejected, no account is created, and a configuration error is logged server-side
