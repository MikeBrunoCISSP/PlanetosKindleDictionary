## MODIFIED Requirements

### Requirement: Pending Registrations Listing

The Admin Dashboard SHALL display a Pending Registrations section listing accounts whose approval status is `PENDING`, ordered by creation time ascending (oldest first), loaded a bounded page at a time with a stable cursor so that loading further pages neither skips nor duplicates an account even as other Pending accounts are approved or denied concurrently. Administrators SHALL be able to load further pages until every currently Pending account has been shown. The table SHALL display exactly these user-facing columns: Username, Email, Reason for Joining, and Approve/Deny. The underlying API endpoint SHALL be accessible only to authenticated administrators. Each page's size SHALL be capped at a fixed server-enforced maximum.

#### Scenario: Pending registrations shown oldest-first
- **WHEN** an administrator views the Pending Registrations section and multiple accounts are Pending
- **THEN** they are listed in ascending order of registration time, oldest first

#### Scenario: Non-pending accounts are excluded
- **WHEN** an account's approval status is `APPROVED`
- **THEN** it does not appear in the Pending Registrations section

#### Scenario: Non-admin is rejected
- **WHEN** a request with a valid non-admin session is sent to the pending-registrations list endpoint
- **THEN** the system returns `403 Forbidden`

#### Scenario: Unauthenticated request is rejected
- **WHEN** an unauthenticated request is sent to the pending-registrations list endpoint
- **THEN** the system returns `401 Unauthorized`

#### Scenario: A page of pending registrations is capped
- **WHEN** more Pending accounts exist than one page's maximum size
- **THEN** only that maximum number are returned in one request, with a way to load the next page

#### Scenario: Loading further pages does not skip or duplicate an account across concurrent approvals
- **WHEN** an administrator loads a page, approves or denies one of the shown accounts, and then loads the next page
- **THEN** the next page's accounts are exactly the next-oldest remaining Pending accounts, with none skipped or repeated
