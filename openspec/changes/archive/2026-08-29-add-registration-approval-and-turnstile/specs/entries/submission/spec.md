## MODIFIED Requirements

### Requirement: Add Entry Screen Access

The system SHALL expose an Add Entry screen at `/entries/new` to any Approved user or administrator. Unauthenticated visitors SHALL be redirected to `/login`. A Pending user SHALL be redirected away from `/entries/new` rather than shown a non-functional form. The underlying entry-creation API operation SHALL independently reject requests from Pending, non-administrator users regardless of what the client UI allows.

#### Scenario: Authenticated member can access the screen
- **WHEN** a logged-in user with approval status `APPROVED` and role `MEMBER` navigates to `/entries/new`
- **THEN** the Add Entry screen renders

#### Scenario: Authenticated admin can access the screen
- **WHEN** a logged-in user with role `ADMIN` navigates to `/entries/new`
- **THEN** the Add Entry screen renders, regardless of that administrator's own approval status

#### Scenario: Unauthenticated visitor is redirected
- **WHEN** an unauthenticated visitor navigates to `/entries/new`
- **THEN** they are redirected to `/login`

#### Scenario: Pending member is redirected away from the screen
- **WHEN** a logged-in user with approval status `PENDING` and role `MEMBER` navigates to `/entries/new`
- **THEN** they are redirected away and the Add Entry screen does not render

#### Scenario: API rejects entry creation from a Pending user
- **WHEN** a request is sent directly to `POST /api/series/:slug/entries` by an authenticated user with approval status `PENDING` and role `MEMBER`
- **THEN** the API rejects the request and does not create the entry, regardless of how the request was constructed
