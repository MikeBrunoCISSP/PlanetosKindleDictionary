# email-delivery Specification

## Purpose

Defines how the application delivers transactional email (verification, password reset, account-approved): a transport that is selectable per environment (a hosted HTTPS API or SMTP), a sender identity that is required and validated rather than hardcoded, credentials supplied only through configuration, and best-effort sending so a delivery failure never fails or corrupts the operation that triggered it.

## Requirements

### Requirement: Email transport is selectable and both paths are network-appropriate

The application SHALL send transactional email through a transport chosen by configuration, with at least two options: a hosted transactional email HTTPS API, and SMTP. The HTTPS API transport SHALL communicate only over HTTPS (no outbound SMTP ports), so it works on hosts that block outbound SMTP. The SMTP transport SHALL send through a configured SMTP connection URL. The same selected transport SHALL be used for every message type.

#### Scenario: HTTPS API transport sends without an SMTP connection

- **WHEN** the mail transport is set to the HTTPS API option and a verification email is sent
- **THEN** the message is delivered via an HTTPS request to the provider's API and no outbound SMTP connection is opened

#### Scenario: SMTP transport is used for local development

- **WHEN** the mail transport is set to SMTP with a local catcher URL
- **THEN** verification, reset, and account-approved messages are all delivered to that SMTP endpoint

#### Scenario: Transport selection is required in production

- **WHEN** a process starts in strict configuration mode with no mail transport selected
- **THEN** startup validation fails and the process exits non-zero

### Requirement: Sender identity is required, configured, and validated

The From address and display name for outgoing mail SHALL come from configuration, not from a value hardcoded in source. In strict configuration mode the sender address SHALL be a syntactically valid email address whose domain is a real public domain — it SHALL NOT be `localhost`, an address on a `.local`, `.test`, or `.example` TLD, or an `example.*` domain. A missing or non-conforming sender address SHALL fail startup validation.

#### Scenario: Placeholder sender domain is rejected in production

- **WHEN** a process starts in strict mode with the sender address set to `no-reply@planetos.local`
- **THEN** startup validation fails and the process exits non-zero

#### Scenario: Every message uses the configured sender

- **WHEN** any transactional email is sent
- **THEN** its From address and name are exactly the configured sender values, and the previously hardcoded `planetos.local` address never appears

### Requirement: Delivery credentials are configuration, never committed

The HTTPS API key and the SMTP connection URL SHALL be supplied only as deployment environment variables. The repository SHALL contain no real API key or SMTP credential — only placeholders and documentation. The API key SHALL be validated as present and non-placeholder in strict mode when the HTTPS API transport is selected.

#### Scenario: No mail credential is committed

- **WHEN** the repository is inspected
- **THEN** it contains no production mail API key or SMTP credential, only `.env.example` placeholders and docs

#### Scenario: Missing API key fails startup for the API transport

- **WHEN** a process starts in strict mode with the HTTPS API transport selected and no API key set
- **THEN** startup validation fails and names the missing key

### Requirement: Sending is best-effort for the triggering operation

A failure to deliver a transactional email SHALL be logged and SHALL NOT fail, error, or roll back the operation that triggered it. Registration SHALL still return success with the user account and its verification token persisted. Forgot-password and resend-verification SHALL still return their generic success response. Admin approval SHALL still succeed. The user's recovery path for a missed verification or reset email is the existing resend flow.

#### Scenario: Registration succeeds when the verification email fails to send

- **WHEN** a visitor registers and the verification email cannot be delivered
- **THEN** the API responds `201` with the new user, the user row and verification token exist, the failure is logged, and no `500` is returned

#### Scenario: Forgot-password does not leak account existence on send failure

- **WHEN** a password-reset email cannot be delivered for a matching account
- **THEN** the endpoint still returns the same generic success message it returns for a non-matching identifier, and the failure is logged

#### Scenario: Admin approval is unaffected by a notification failure

- **WHEN** an administrator approves a registration and the approval email cannot be delivered
- **THEN** the account's approval status is still updated and the request still succeeds
