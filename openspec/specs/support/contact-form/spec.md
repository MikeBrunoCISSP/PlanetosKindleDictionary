# support/contact-form Specification

## Purpose

Defines the behavioral contract for the Contact form: what a visitor may submit, how it's validated and rate-limited, and how it's delivered to the site operator's own inbox rather than to the submitter.

## Requirements

### Requirement: Contact Form Submission

The system SHALL allow any visitor, authenticated or not, to submit a contact message via `POST /api/contact` consisting of a Name, an Email address, a Subject, and a Message. The Message SHALL be limited to at most 3000 characters; requests exceeding it SHALL be rejected with `400 Bad Request`. Name and Subject SHALL be rejected with `400 Bad Request` if they contain HTML-like markup. On success, the submission SHALL be durably recorded and SHALL eventually be delivered as an email to a single configured recipient address — never to the submitter's own address — with `[eReader Dictionaries] ` prepended to the submitted Subject as the delivered email's subject line, and the submitter's Email address set as the reply-to address so that replying in an inbox client reaches the submitter directly. Delivery SHALL be asynchronous: the API response to the submission SHALL NOT wait for the email to actually send.

#### Scenario: Successful submission

- **WHEN** a POST request is sent to `/api/contact` with a valid `{ name, email, subject, message }` body
- **THEN** the system returns `201 Created`, durably records the message, and it is eventually delivered by email with `[eReader Dictionaries] ` prepended to the subject

#### Scenario: Over-length message rejected

- **WHEN** a POST request is sent to `/api/contact` with a `message` longer than 3000 characters
- **THEN** the system returns `400 Bad Request` and does not record the message

#### Scenario: Markup in name or subject rejected

- **WHEN** a POST request is sent to `/api/contact` with HTML-like markup in the `name` or `subject` field
- **THEN** the system returns `400 Bad Request` and does not record the message

#### Scenario: Invalid email format rejected

- **WHEN** a POST request is sent to `/api/contact` with a malformed `email` value
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `email` field

#### Scenario: Delivered email goes to the configured recipient, not the submitter

- **WHEN** a contact message is successfully delivered
- **THEN** the recipient of the delivered email is the operator's configured address, not the address the submitter supplied

#### Scenario: Delivered email's reply-to is the submitter's address

- **WHEN** a contact message is successfully delivered
- **THEN** the delivered email's reply-to address is the Email address the submitter supplied

### Requirement: Contact Form Rate Limiting

More than 5 contact-form submissions originating from the same IP address within a rolling 60-minute window SHALL be rejected with `429 Too Many Requests` and a `Retry-After` header, without recording a message.

#### Scenario: Contact rate limit exceeded

- **WHEN** more than 5 `/api/contact` requests originate from the same IP address within a rolling 60-minute window
- **THEN** the system returns `429 Too Many Requests` with a `Retry-After` header and does not record any further message

### Requirement: Contact Form Turnstile Verification

The Contact form's submission endpoint SHALL be subject to Cloudflare Turnstile verification whenever Turnstile is enabled, mirroring the same enabled/disabled/misconfigured behavior already established for registration: a valid Turnstile token is required and verified when enabled; no token is required when disabled; and if enabled without valid configuration, submission SHALL be blocked rather than silently bypassing verification.

#### Scenario: Valid Turnstile token accepted when enabled

- **WHEN** Turnstile is enabled and a POST request to `/api/contact` includes a valid Turnstile token
- **THEN** the system proceeds with normal validation of the submission

#### Scenario: Missing or invalid Turnstile token rejected when enabled

- **WHEN** Turnstile is enabled and a POST request to `/api/contact` omits the Turnstile token or includes one that fails verification
- **THEN** the system rejects the request and does not record a message

#### Scenario: Turnstile bypassed when disabled

- **WHEN** Turnstile is disabled and a POST request to `/api/contact` is sent with no Turnstile token
- **THEN** the system does not require or attempt Turnstile verification, and normal validation proceeds

#### Scenario: Misconfigured Turnstile blocks submission

- **WHEN** Turnstile is enabled but its required configuration is missing
- **THEN** the system blocks the submission rather than silently bypassing verification
