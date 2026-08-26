## ADDED Requirements

### Requirement: Settings Section

The menu SHALL include a "Settings" top-level section that expands and collapses inline when clicked, following the same accordion behavior as the Create and Update sections. The Settings section SHALL be visible and expandable by all authenticated users regardless of role.

#### Scenario: Settings section expands on click

- **WHEN** a logged-in user clicks the "Settings" section header in the menu
- **THEN** the section expands to reveal its shelf content inline

#### Scenario: Settings section collapses on re-click

- **WHEN** a user clicks the already-expanded "Settings" section header
- **THEN** the section collapses

#### Scenario: Opening Settings closes other open sections

- **WHEN** a user has the "Create" or "Update" section open and clicks "Settings"
- **THEN** "Settings" expands and the previously open section closes

### Requirement: Preferences Item in Settings

The Settings shelf SHALL contain a "Preferences" action item visible to all authenticated users. Activating it SHALL navigate the user to `/preferences`.

#### Scenario: Preferences item navigates to preferences page

- **WHEN** a logged-in user expands the Settings section and clicks "Preferences"
- **THEN** the menu closes and the browser navigates to `/preferences`
