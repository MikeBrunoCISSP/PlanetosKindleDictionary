## Purpose

Defines the baseline input-validation, output-encoding, and HTTP-hardening rules that apply to any free-text input the application accepts, so XSS and SQL-injection risk is controlled by explicit, testable rules rather than accidental behavior.

## ADDED Requirements

### Requirement: Free-text input rejects markup
Any API request field designated as plain free text (e.g. Series `title`, `description`) SHALL be rejected with a 400 response if it contains HTML-like markup (tag syntax such as `<...>`).

#### Scenario: Script tag in title is rejected
- **WHEN** a client submits a create/update request with `<script>alert(1)</script>` in a plain-text field
- **THEN** the API responds 400 with a validation error and does not persist the value

#### Scenario: Ordinary text is accepted
- **WHEN** a client submits a create/update request with plain text containing normal punctuation (e.g. apostrophes, ampersands, quotes) and no markup
- **THEN** the API accepts and persists the value unchanged

### Requirement: Free-text input has an enforced maximum length
Every plain free-text field SHALL enforce a maximum length; requests exceeding it SHALL be rejected with a 400 response.

#### Scenario: Over-length input is rejected
- **WHEN** a client submits a plain-text field longer than its configured maximum
- **THEN** the API responds 400 with a validation error and does not persist the value

### Requirement: No unparameterized SQL execution
The API SHALL NOT execute SQL built by concatenating or interpolating untrusted input into a query string. All database access SHALL use parameterized queries (an ORM query builder or a parameterized/tagged-template raw-query API).

#### Scenario: Data access uses parameterized queries
- **WHEN** any API code path reads or writes data influenced by user input
- **THEN** the underlying SQL execution is parameterized such that the input cannot alter the query's structure

### Requirement: Standard HTTP hardening headers
API responses SHALL include standard hardening headers (including, at minimum, `X-Content-Type-Options: nosniff` and a `Referrer-Policy`) to reduce the impact of any content-handling vulnerabilities in clients.

#### Scenario: Hardening headers present on API responses
- **WHEN** a client makes any request to the API
- **THEN** the response includes `X-Content-Type-Options: nosniff` and a `Referrer-Policy` header

### Requirement: Cross-origin requests are restricted
The API SHALL only allow cross-origin requests (including credentialed requests) from the configured allowed origin(s); requests from other origins SHALL be rejected by the browser via the CORS response headers.

#### Scenario: Configured origin is allowed
- **WHEN** a browser sends a credentialed cross-origin request from the configured allowed origin
- **THEN** the API's CORS response headers permit the request

#### Scenario: Unconfigured origin is denied
- **WHEN** a browser sends a cross-origin request from an origin that is not configured as allowed
- **THEN** the API's CORS response headers do not permit the request

### Requirement: Web document declares a Content-Security-Policy
The web application's served HTML document SHALL declare a Content-Security-Policy restricting script sources, style sources, and allowed connection targets.

#### Scenario: CSP present in served document
- **WHEN** a browser loads the web application's HTML document
- **THEN** the document declares a Content-Security-Policy restricting `script-src`, `style-src`, and `connect-src`

### Requirement: Unsanitized HTML rendering is disallowed
The web application SHALL NOT render user-supplied or externally-sourced content as raw HTML (e.g. via `dangerouslySetInnerHTML` or equivalent) unless that content has first passed through a sanitizer that strips executable content.

#### Scenario: Raw HTML rendering without sanitization is flagged
- **WHEN** code renders a string derived from user input as raw HTML without passing it through a sanitizer first
- **THEN** static analysis (lint) flags this as an error before the change can be merged
