## Purpose

Defines the behavioral contract for user-controlled application preferences, beginning with the dark mode display setting that persists across sessions.

## Requirements

### Requirement: Preferences Page Accessibility

The system SHALL expose a `/preferences` route accessible to all authenticated users. Unauthenticated visitors SHALL be redirected to `/login`. The page SHALL be reachable from the application header menu via Settings → Preferences.

#### Scenario: Authenticated user reaches preferences page

- **WHEN** a logged-in user navigates to `/preferences`
- **THEN** the preferences page renders with the user's current settings visible

#### Scenario: Unauthenticated visitor is redirected

- **WHEN** an unauthenticated user navigates to `/preferences`
- **THEN** the browser redirects them to `/login`

### Requirement: Dark Mode Toggle

The system SHALL provide a toggle on the preferences page that switches the application between light and dark visual modes. The change SHALL take effect immediately without a page reload.

#### Scenario: User enables dark mode

- **WHEN** a user on the preferences page activates the dark mode toggle
- **THEN** the application immediately switches to dark mode and the toggle reflects the active state

#### Scenario: User disables dark mode

- **WHEN** a user on the preferences page deactivates the dark mode toggle while dark mode is active
- **THEN** the application immediately switches to light mode and the toggle reflects the inactive state

### Requirement: Dark Mode Preference Persistence

The user's dark mode selection SHALL be persisted so that it is restored on subsequent visits without requiring the user to set it again. The preference SHALL be applied before the page is visually rendered to prevent a flash of the wrong theme.

#### Scenario: Preference survives page reload

- **WHEN** a user enables dark mode and then reloads the page
- **THEN** the application launches in dark mode without a visible flash of light mode

#### Scenario: Preference survives closing and reopening the browser

- **WHEN** a user enables dark mode, closes the browser, and returns to the application
- **THEN** the application launches in dark mode

#### Scenario: Default is light mode

- **WHEN** a user visits the application for the first time with no saved preference
- **THEN** the application renders in light mode
