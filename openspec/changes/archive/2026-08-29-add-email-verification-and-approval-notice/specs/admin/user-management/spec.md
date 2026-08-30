## ADDED Requirements

### Requirement: Approval Notification Email

When an administrator approves a pending user's registration, the system SHALL send that user an email informing them their account has been approved. A failure to send this notification SHALL NOT prevent the approval itself from succeeding — the account's approval status change is the primary effect, and the email is best-effort.

#### Scenario: Approved user receives a notification email

- **WHEN** an administrator approves a pending user's registration
- **THEN** an email is sent to that user's registered address informing them their account has been approved

#### Scenario: Notification failure does not block the approval

- **WHEN** an administrator approves a pending user's registration and sending the notification email fails
- **THEN** the account's approval status is still updated to approved, and the approval request still succeeds
