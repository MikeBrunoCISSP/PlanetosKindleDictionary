## ADDED Requirements

### Requirement: Client IP resolves through the trusted proxy hop

The API SHALL resolve a request's client IP address through exactly one trusted proxy hop, so the value used by rate limiting and Turnstile verification is the actual client, not the proxy in front of the API.

#### Scenario: Request behind trusted proxy resolves to real client

- **WHEN** a request arrives through the trusted proxy carrying a forwarded-for header identifying the real client
- **THEN** the resolved client IP used for rate limiting and Turnstile verification is the real client's address, not the proxy's

### Requirement: Forwarding entries beyond the trusted hop are ignored

The API SHALL trust exactly one forwarding hop when resolving the client IP; any additional, client-supplied forwarded-for entries beyond that hop SHALL be ignored.

#### Scenario: Spoofed forwarding entry is ignored

- **WHEN** a direct client includes an extra, self-supplied entry in the forwarded-for header ahead of the trusted proxy's own entry
- **THEN** the resolved client IP is the trusted proxy's entry, not the client-supplied one

### Requirement: IP-based controls act on the resolved client IP

Rate limiting and Turnstile verification SHALL both use the same resolved client IP, so requests from distinct clients behind the trusted proxy are controlled independently and Turnstile is verified against the real client.

#### Scenario: Rate limiting buckets by resolved client

- **WHEN** two different clients share the same trusted proxy hop but have different resolved client addresses
- **THEN** they are rate-limited independently, each against its own resolved client IP

#### Scenario: Turnstile is verified against the resolved client

- **WHEN** a request completes Turnstile verification through the trusted proxy
- **THEN** the client IP sent to the Turnstile verification service is the resolved client IP, not the proxy's address
