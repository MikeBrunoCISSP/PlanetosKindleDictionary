## ADDED Requirements

### Requirement: Search Action in Entries Shelf

The Entries shelf SHALL contain a "Search" action item visible to all authenticated users regardless of role, alongside "Add". Activating it SHALL navigate the user to `/search`.

#### Scenario: Search navigates to the search page

- **WHEN** an authenticated user expands the Entries section and clicks "Search"
- **THEN** the menu closes and the browser navigates to `/search`

#### Scenario: Member sees Search alongside Add

- **WHEN** a user with role `MEMBER` expands the Entries section
- **THEN** a "Search" action item is visible in the shelf alongside "Add"
