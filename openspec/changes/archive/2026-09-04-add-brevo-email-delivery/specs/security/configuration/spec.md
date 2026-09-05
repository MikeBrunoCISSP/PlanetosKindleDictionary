## MODIFIED Requirements

### Requirement: Production rejects localhost and malformed URLs

In strict mode, the public base URL SHALL be an absolute URL of an appropriate scheme and SHALL NOT resolve to `localhost` or a loopback address. The SMTP connection URL SHALL be an absolute URL of an appropriate scheme **when the SMTP mail transport is selected**; the mail-provider API key SHALL be non-empty and non-placeholder **when the HTTPS API mail transport is selected**. The configured sender email address SHALL be a syntactically valid address on a real public domain (not `localhost`, not a `.local` / `.test` / `.example` TLD, not an `example.*` domain). Storage credentials required to write build artifacts (bucket name and access keys) SHALL be non-empty. Malformed values SHALL be rejected rather than silently coerced or replaced with a default.

#### Scenario: Localhost public base URL is rejected in production

- **WHEN** the API is started with `NODE_ENV=production` and the public base URL set to a `localhost` address
- **THEN** validation fails and the process exits non-zero, so no `localhost` links are generated in email

#### Scenario: Non-URL value is rejected, not defaulted

- **WHEN** strict startup validation runs with the public base URL set to a value that is not a valid URL
- **THEN** validation fails with a message identifying that variable, and no fallback URL is substituted

#### Scenario: Empty storage credentials are rejected in production

- **WHEN** a process is started with `NODE_ENV=production` and a required storage access key is empty
- **THEN** validation fails and the process exits non-zero

#### Scenario: SMTP URL is required only for the SMTP transport

- **WHEN** a process is started in strict mode with the HTTPS API mail transport selected and no SMTP URL set
- **THEN** startup validation passes with respect to the SMTP URL (it is not required for that transport)

#### Scenario: Invalid sender domain is rejected in production

- **WHEN** a process is started in strict mode with the sender email address on a `.local` domain
- **THEN** validation fails and the process exits non-zero
