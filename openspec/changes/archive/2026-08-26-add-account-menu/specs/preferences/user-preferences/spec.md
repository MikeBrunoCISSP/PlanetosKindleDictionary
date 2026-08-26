## MODIFIED Requirements

### Requirement: Preferences Page Accessibility

The system SHALL expose a `/preferences` route accessible to all authenticated users. Unauthenticated visitors SHALL be redirected to `/login`. The page SHALL be reachable from the application header's Account Menu (the user-icon/username button next to the hamburger menu) via Preferences.

#### Scenario: Authenticated user reaches preferences page

- **WHEN** a logged-in user navigates to `/preferences`
- **THEN** the preferences page renders with the user's current settings visible

#### Scenario: Unauthenticated visitor is redirected

- **WHEN** an unauthenticated user navigates to `/preferences`
- **THEN** the browser redirects them to `/login`
