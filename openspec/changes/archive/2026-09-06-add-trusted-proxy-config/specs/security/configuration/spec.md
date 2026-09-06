## ADDED Requirements

### Requirement: Trusted proxy hop count is an operational setting

The number of proxy hops the API trusts when resolving a request's client IP address (`TRUST_PROXY_HOPS`) SHALL be a non-secret, always-defaulted operational setting: it SHALL have a default value in every mode, including strict/production, and SHALL be format-validated as a non-negative integer whenever it is set in strict mode.

#### Scenario: Default matches the documented topology

- **WHEN** `TRUST_PROXY_HOPS` is unset
- **THEN** the effective value is `1`, matching the single documented proxy hop in front of the API

#### Scenario: Invalid value is rejected in strict mode

- **WHEN** the API is started in strict mode (`NODE_ENV` not `development`/`test`) with `TRUST_PROXY_HOPS` set to a non-numeric or negative value
- **THEN** startup validation fails, identifying the variable

### Requirement: PORT is format-validated in strict mode when set

The API's listen port (`PORT`) SHALL be format-validated as a positive integer whenever it is set in strict mode; a malformed value SHALL be rejected rather than silently coerced to a default.

#### Scenario: Malformed PORT is rejected in strict mode

- **WHEN** the API is started in strict mode with `PORT` set to a non-numeric or non-positive value
- **THEN** startup validation fails, identifying `PORT` as invalid

#### Scenario: Unset PORT falls back to the documented default

- **WHEN** `PORT` is unset
- **THEN** the effective value is the documented default port in every mode
