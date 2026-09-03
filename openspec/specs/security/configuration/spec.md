# configuration Specification

## Purpose

Defines how the API and background worker load and validate their runtime configuration: a single parsed-once source of truth, strict fail-fast validation everywhere except an explicit development or test mode, and rejection of weak secrets, placeholder values, and localhost URLs in production — so a misconfigured deployment refuses to start instead of running with insecure defaults.

## Requirements

### Requirement: Configuration is validated at startup outside development and test

Before the API server or the background worker begins accepting work, it SHALL validate the complete set of configuration values it requires. When `NODE_ENV` is not explicitly `development` or `test`, validation SHALL be strict: any required value that is missing, empty, or malformed SHALL cause the process to exit with a non-zero status before the HTTP server listens or the worker registers with its queues. No development fallback value SHALL be used in strict mode.

#### Scenario: Missing required variable aborts startup in production

- **WHEN** the API is started with `NODE_ENV=production` and a required variable (for example the Redis URL) is unset
- **THEN** the process exits non-zero, prints an error identifying the missing variable, and never begins listening for requests

#### Scenario: Worker enforces the same contract

- **WHEN** the worker is started with `NODE_ENV=production` and required configuration is missing or invalid
- **THEN** the worker exits non-zero before registering with any queue and processes no jobs

#### Scenario: Unset NODE_ENV is treated as strict

- **WHEN** a process is started with `NODE_ENV` unset (or set to a value other than `development` / `test`) and required configuration is incomplete
- **THEN** validation is strict and the process exits non-zero

### Requirement: Startup validation reports every problem together

When strict validation fails, the error output SHALL list every offending variable and the reason each one failed, not only the first. The message SHALL be readable enough for an operator to fix all problems in one pass.

#### Scenario: Multiple invalid variables are all reported

- **WHEN** strict startup validation runs with two required variables missing and one malformed
- **THEN** the printed error names all three variables and what is wrong with each

### Requirement: Production rejects weak secrets and placeholder values

In strict mode, the session signing secret and the settings encryption key SHALL each be at least 32 characters and SHALL NOT equal any known placeholder value (including the value previously used as a committed fallback and the sample values shipped in `.env.example`). A process started in strict mode with a weak or placeholder secret SHALL fail validation.

#### Scenario: Committed fallback secret is rejected in production

- **WHEN** the API is started with `NODE_ENV=production` and the session secret set to the old committed fallback string
- **THEN** validation fails and the process exits non-zero

#### Scenario: Short encryption key is rejected

- **WHEN** a process is started in strict mode with a settings encryption key shorter than 32 characters
- **THEN** validation fails and the process exits non-zero

### Requirement: Production rejects localhost and malformed URLs

In strict mode, the public base URL and the SMTP URL SHALL be absolute URLs of an appropriate scheme, and the public base URL SHALL NOT resolve to `localhost` or a loopback address. Storage credentials required to write build artifacts (bucket name and access keys) SHALL be non-empty. Malformed values SHALL be rejected rather than silently coerced or replaced with a default.

#### Scenario: Localhost public base URL is rejected in production

- **WHEN** the API is started with `NODE_ENV=production` and the public base URL set to a `localhost` address
- **THEN** validation fails and the process exits non-zero, so no `localhost` links are generated in email

#### Scenario: Non-URL value is rejected, not defaulted

- **WHEN** strict startup validation runs with the public base URL set to a value that is not a valid URL
- **THEN** validation fails with a message identifying that variable, and no fallback URL is substituted

#### Scenario: Empty storage credentials are rejected in production

- **WHEN** a process is started with `NODE_ENV=production` and a required storage access key is empty
- **THEN** validation fails and the process exits non-zero

### Requirement: Development and test modes run on documented defaults

When `NODE_ENV` is explicitly `development` or `test`, the API, the worker, and the test suite SHALL start successfully with no configuration beyond the documented local defaults, and the effective values SHALL match those defaults where a variable is unset.

#### Scenario: Local development starts with no extra configuration

- **WHEN** the app is started with `NODE_ENV=development` and only the documented local `.env` present
- **THEN** it starts normally using the documented local default values for any unset variable

#### Scenario: Test suite runs without production configuration

- **WHEN** the test suite runs (`NODE_ENV` of `test`)
- **THEN** it executes without requiring any production secret or URL to be set

### Requirement: Configuration is parsed once from a single source

The required configuration values SHALL be parsed exactly once at process startup into a single typed structure. No other module SHALL read these values directly from the environment, and the value observed for a given setting SHALL be identical whether it is accessed during startup or later at request/job time.

#### Scenario: A setting has one effective value regardless of access time

- **WHEN** the same configuration setting is read during startup and again while handling a request
- **THEN** both reads return the identical parsed value

#### Scenario: No ad hoc environment reads for validated settings

- **WHEN** the codebase is inspected for the settings covered by startup validation
- **THEN** those settings are obtained only from the single parsed configuration source, not from direct environment access scattered across modules
