## MODIFIED Requirements

### Requirement: Sending is best-effort for the triggering operation

A failure to deliver a transactional email SHALL be logged and SHALL NOT fail, error, or roll back the operation that triggered it. Registration SHALL still return success with the user account and its verification token persisted. Forgot-password and resend-verification SHALL still return their generic success response. Admin approval SHALL still succeed. The user's recovery path for a missed verification or reset email is the existing resend flow. For registration, forgot-password, and resend-verification, sending SHALL be queued for asynchronous delivery rather than attempted synchronously within the triggering request, so that the request's response time does not depend on the external delivery provider's latency or availability.

#### Scenario: Registration succeeds when the verification email fails to send

- **WHEN** a visitor registers and the verification email cannot be delivered
- **THEN** the API responds `201` with the new user, the user row and verification token exist, the failure is logged, and no `500` is returned

#### Scenario: Forgot-password does not leak account existence on send failure

- **WHEN** a password-reset email cannot be delivered for a matching account
- **THEN** the endpoint still returns the same generic success message it returns for a non-matching identifier, and the failure is logged

#### Scenario: Admin approval is unaffected by a notification failure

- **WHEN** an administrator approves a registration and the approval email cannot be delivered
- **THEN** the account's approval status is still updated and the request still succeeds

#### Scenario: Registration response does not wait on the delivery provider

- **WHEN** a visitor registers and the configured delivery provider is unreachable or slow to respond
- **THEN** the registration request still completes and responds without waiting for a delivery attempt to the provider

## ADDED Requirements

### Requirement: Queued email is durable and delivered asynchronously with a bounded attempt duration

For registration, forgot-password, and resend-verification, the system SHALL persist a durable record of each email to be sent before enqueueing its delivery, and SHALL deliver it via an asynchronous worker rather than within the triggering HTTP request. Any content of that record needed to reconstruct the message (such as a single-use link containing a secret token) SHALL be stored encrypted at rest, and SHALL be cleared once delivery succeeds. Each delivery attempt to the external provider SHALL be bounded by an explicit timeout, so a stalled provider connection cannot hold a delivery attempt open indefinitely.

#### Scenario: A durable record exists before delivery is attempted

- **WHEN** registration, forgot-password, or resend-verification completes successfully
- **THEN** a durable, encrypted-at-rest delivery record exists for the queued email before any attempt is made to send it

#### Scenario: A stalled provider does not hang a delivery attempt

- **WHEN** the delivery provider accepts a connection but does not respond within the configured timeout
- **THEN** the delivery attempt is abandoned at the timeout rather than continuing to wait indefinitely

#### Scenario: Sensitive content is cleared after successful delivery

- **WHEN** a queued email is successfully delivered
- **THEN** the encrypted content needed to reconstruct its message is cleared from the durable record

### Requirement: Delivery retries do not produce unbounded duplicate sends

A failed delivery attempt SHALL be retried a bounded number of times with increasing delay between attempts. A delivery record already marked as successfully delivered SHALL NOT be sent again, even if a retry of the same delivery is triggered after success. Concurrent delivery attempts for the same durable record SHALL NOT result in more than one message being sent for it at a time.

#### Scenario: A failed delivery is retried a bounded number of times

- **WHEN** a delivery attempt fails
- **THEN** the system retries automatically, waiting longer between each successive attempt, up to a bounded number of attempts

#### Scenario: A delivery already marked successful is never resent

- **WHEN** a delivery is retried after its record has already been marked as successfully delivered
- **THEN** no additional message is sent, and the retry completes as a no-op

### Requirement: Delivery failures are observable and administratively recoverable

An email that exhausts its delivery retries SHALL remain in a durable, queryable failed state recording the last error, rather than being discarded. An administrator SHALL be able to observe failed and pending deliveries and manually trigger a retry.

#### Scenario: An exhausted delivery remains visible after all retries fail

- **WHEN** a delivery attempt fails on every retry
- **THEN** its durable record remains in a failed state with the last error recorded, and is not deleted

#### Scenario: An administrator can see and retry a failed delivery

- **WHEN** an administrator inspects the delivery queue's administrative view
- **THEN** failed deliveries are visible there, and the administrator can trigger a manual retry
