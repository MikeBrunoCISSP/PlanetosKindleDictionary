## ADDED Requirements

### Requirement: Unauthenticated Home Redirect

The system SHALL redirect any visitor who arrives at `/` without an active session to `/login`. The redirect SHALL occur before the page renders — the landing page content SHALL NOT be displayed to unauthenticated users.

#### Scenario: Unauthenticated user redirected from home

- **WHEN** a user navigates to `/` without a valid session
- **THEN** the system redirects them to `/login` before any page content is rendered

#### Scenario: Authenticated user sees home page

- **WHEN** a user navigates to `/` with a valid session
- **THEN** the home page renders normally without any redirect
