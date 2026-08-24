## Purpose

Provides a persistent header present on every page of the application, exposing a navigation menu whose items adapt to the current user's authentication state and role.

## ADDED Requirements

### Requirement: Global Header Presence

The application SHALL render a persistent header bar at the top of every page. The header SHALL include a navigation menu control (hamburger or equivalent) in the upper-right corner. The header SHALL be visible regardless of authentication state.

#### Scenario: Header appears on unauthenticated pages

- **WHEN** a visitor who is not logged in views any page of the application
- **THEN** the header and its menu control are visible in the upper-right corner

#### Scenario: Header appears on authenticated pages

- **WHEN** a logged-in user views any page
- **THEN** the header and its menu control are visible in the upper-right corner

### Requirement: Role-Aware Menu Items

The navigation menu SHALL display items based on the current user's role. The **Create** top-level item and its **Dictionary** sub-item SHALL be visible only to authenticated users with `role = ADMIN`. The **Update** top-level item and its **Dictionary** sub-item SHALL also be visible only to authenticated users with `role = ADMIN`. Unauthenticated visitors and authenticated `MEMBER` users SHALL NOT see these items.

#### Scenario: Admin sees Create and Update menu items

- **WHEN** an authenticated ADMIN opens the navigation menu
- **THEN** both a **Create** item and an **Update** item are visible

#### Scenario: Member does not see admin menu items

- **WHEN** an authenticated MEMBER opens the navigation menu
- **THEN** neither **Create** nor **Update** is visible

#### Scenario: Unauthenticated visitor does not see admin menu items

- **WHEN** an unauthenticated visitor opens the navigation menu
- **THEN** neither **Create** nor **Update** is visible

### Requirement: Create Dictionary Navigation

The navigation menu SHALL expose a **Create → Dictionary** path that navigates to the dictionary creation page. This path SHALL be rendered only for authenticated ADMIN users.

#### Scenario: Clicking Create → Dictionary navigates to creation page

- **WHEN** an authenticated ADMIN clicks **Create** and then **Dictionary** in the menu
- **THEN** the browser navigates to the dictionary creation page (`/series/new`)

### Requirement: Update Dictionary Navigation

The navigation menu SHALL expose an **Update → Dictionary** path that presents a searchable dropdown of existing dictionary names. Typing in the input filters the list. Selecting a dictionary navigates to its edit page. This path SHALL be rendered only for authenticated ADMIN users.

#### Scenario: Update → Dictionary shows searchable list of dictionaries

- **WHEN** an authenticated ADMIN clicks **Update** and then **Dictionary** in the menu
- **THEN** a dropdown or popover appears containing a filterable list of all existing dictionary titles

#### Scenario: Filtering the dropdown narrows results

- **WHEN** the admin types characters into the filter input
- **THEN** only dictionary titles containing the typed string (case-insensitive) remain visible

#### Scenario: Selecting a dictionary navigates to its edit page

- **WHEN** the admin selects a dictionary from the dropdown
- **THEN** the browser navigates to that dictionary's edit page (`/series/:slug/edit`)
