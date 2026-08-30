## Purpose

Lets administrators view and edit the application's own local Cloudflare Turnstile configuration — enabled state, Site Key, and Secret Key — and test that configuration, without the Secret Key ever being exposed once stored. This page manages only the application's local configuration; it is not a substitute for Cloudflare's own dashboard and does not manage Cloudflare widgets, hostnames, or account-level credentials.

## ADDED Requirements

### Requirement: Turnstile Settings Page Access

The system SHALL expose a frontend route at `/admin/turnstile` accessible only to authenticated administrators. Unauthenticated visitors SHALL be redirected to `/login`; authenticated non-admins SHALL be redirected to `/`. The underlying settings API SHALL independently verify administrator status regardless of what the client UI allows.

#### Scenario: Admin can access the Turnstile settings page
- **WHEN** a logged-in administrator navigates to `/admin/turnstile`
- **THEN** the Turnstile settings page renders

#### Scenario: Non-admin is redirected away
- **WHEN** a logged-in user with role `MEMBER` navigates to `/admin/turnstile`
- **THEN** they are redirected to `/`

#### Scenario: Unauthenticated visitor is redirected to login
- **WHEN** an unauthenticated visitor navigates to `/admin/turnstile`
- **THEN** they are redirected to `/login`

#### Scenario: API independently rejects non-admin requests
- **WHEN** a request to view or modify Turnstile settings is made by an authenticated non-administrator
- **THEN** the API rejects the request with `403 Forbidden` regardless of how the request was constructed

### Requirement: Turnstile Settings Display

The settings page SHALL display: whether Turnstile is Enabled or Disabled, the configured Site Key, and whether a Secret Key is configured (worded "Secret Key: Configured" or "Secret Key: Not configured"). The actual Secret Key value SHALL NOT be displayed or returned by the API under any circumstance.

#### Scenario: Configured secret shows as configured, not its value
- **WHEN** an administrator views the Turnstile settings page and a Secret Key is stored
- **THEN** the page shows "Secret Key: Configured" and the API response contains no Secret Key value

#### Scenario: Unconfigured secret shows as not configured
- **WHEN** an administrator views the Turnstile settings page and no Secret Key is stored
- **THEN** the page shows "Secret Key: Not configured"

### Requirement: Editable Turnstile Settings

Administrators SHALL be able to edit: the Enabled/Disabled state, the Site Key (a plain text field, since it is public), and the Secret Key (a password-style, write-only input). The Secret Key input SHALL never be pre-populated with the current value. Submitting the settings form with the Secret Key field left blank SHALL NOT alter the currently stored Secret Key. Submitting a non-blank Secret Key SHALL replace the stored credential.

#### Scenario: Blank Secret Key input does not erase the existing secret
- **WHEN** an administrator updates Enabled or Site Key and submits the settings form with the Secret Key field left blank
- **THEN** the previously configured Secret Key remains unchanged

#### Scenario: Entering a new Secret Key replaces the configured credential
- **WHEN** an administrator submits the settings form with a non-blank Secret Key
- **THEN** the stored Secret Key is replaced with the newly submitted value

#### Scenario: Enabled/Disabled setting is enforced
- **WHEN** an administrator disables Turnstile and saves
- **THEN** subsequent registration requests are no longer required to include a Turnstile token

### Requirement: Turnstile Secret Confidentiality

The Secret Key SHALL NOT be rendered into HTML, returned through any API response, included in any ViewModel/DTO sent to the browser, placed in client-side JavaScript, written to logs, or included in any exception message returned to a client.

#### Scenario: Secret Key never appears in a settings response
- **WHEN** any API response related to Turnstile settings is inspected, including error responses
- **THEN** it contains no Secret Key value, encrypted or otherwise

### Requirement: Test Turnstile Configuration

The settings page SHALL provide a Test Configuration action. The server SHALL validate that the currently configured Secret Key is usable (recognized by Cloudflare as a syntactically valid credential) without exposing the Secret Key, and SHALL report success or failure via the application's existing toast convention. The test SHALL NOT fabricate a successful verification, and SHALL be clearly scoped to configuration validity rather than a full end-to-end verification (which Cloudflare's protocol cannot provide without a real widget-issued token).

#### Scenario: Test reports success for a well-formed, recognized Secret Key
- **WHEN** an administrator runs Test Configuration and the configured Secret Key is recognized as valid by Cloudflare
- **THEN** a success toast is displayed

#### Scenario: Test reports failure for a malformed or unrecognized Secret Key
- **WHEN** an administrator runs Test Configuration and Cloudflare reports the configured Secret Key itself as invalid
- **THEN** a failure toast is displayed, without revealing the Secret Key or other sensitive configuration details

#### Scenario: Test does not fabricate success
- **WHEN** Turnstile configuration is missing (no Secret Key configured)
- **THEN** Test Configuration reports failure rather than a fabricated success
