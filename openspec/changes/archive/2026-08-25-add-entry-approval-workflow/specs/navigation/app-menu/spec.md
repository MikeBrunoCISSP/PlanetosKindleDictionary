## MODIFIED Requirements

### Requirement: Permission-Gated Shelf Content

The items rendered inside each expanded shelf SHALL reflect the current user's permissions. If the user holds no permission relevant to a section, that section's shelf SHALL be empty. The section header itself SHALL still be visible and expandable; only the content is absent. This applies per-item as well as per-section: a shelf MAY show some items to all authenticated users while withholding others based on role.

#### Scenario: Admin sees Create item under Dictionaries

- **WHEN** a user with role `ADMIN` expands the "Dictionaries" section
- **THEN** a "Create" action item is visible in the shelf

#### Scenario: Admin sees Update item under Dictionaries

- **WHEN** a user with role `ADMIN` expands the "Dictionaries" section
- **THEN** an "Update" action item is visible in the shelf

#### Scenario: Admin sees Delete item under Dictionaries

- **WHEN** a user with role `ADMIN` expands the "Dictionaries" section
- **THEN** a "Delete" action item is visible in the shelf

#### Scenario: Member sees empty Dictionaries shelf

- **WHEN** a user with role `MEMBER` expands the "Dictionaries" section
- **THEN** the shelf is empty — no action items are displayed

#### Scenario: Member sees Add but not Delete under Entries

- **WHEN** a user with role `MEMBER` expands the "Entries" section
- **THEN** an "Add" action item is visible in the shelf and no "Delete" action item is displayed

#### Scenario: Admin sees Add and Delete under Entries

- **WHEN** a user with role `ADMIN` expands the "Entries" section
- **THEN** both an "Add" action item and a "Delete" action item are visible in the shelf

## ADDED Requirements

### Requirement: Entries Top-Level Section

The menu SHALL include an "Entries" top-level section that expands and collapses inline when clicked, following the same accordion behavior as the "Dictionaries" and "Settings" sections. The "Entries" section SHALL be visible and expandable by all authenticated users regardless of role.

#### Scenario: Entries section expands on click

- **WHEN** a logged-in user clicks the "Entries" section header in the menu
- **THEN** the section expands to reveal its shelf content inline

#### Scenario: Entries section collapses on re-click

- **WHEN** a user clicks the already-expanded "Entries" section header
- **THEN** the section collapses

#### Scenario: Opening Entries closes other open sections

- **WHEN** a user has the "Dictionaries" or "Settings" section open and clicks "Entries"
- **THEN** "Entries" expands and the previously open section closes

### Requirement: Add Action in Entries Shelf

The Entries shelf SHALL contain an "Add" action item visible to all authenticated users regardless of role. Activating it SHALL navigate the user to `/entries/new`.

#### Scenario: Add navigates to the Add Entry screen

- **WHEN** an authenticated user expands the Entries section and clicks "Add"
- **THEN** the menu closes and the browser navigates to `/entries/new`

### Requirement: Delete Action in Entries Shelf

The Entries shelf SHALL contain a "Delete" action item visible only to admins. It SHALL NOT be exposed to non-admin users through the shelf or through direct navigation to its destination.

#### Scenario: Non-admin cannot see the Delete item

- **WHEN** a user with role `MEMBER` expands the Entries section
- **THEN** no "Delete" action item is displayed in the shelf

### Requirement: Administration Top-Level Section

The menu SHALL include an "Administration" top-level section, following the same accordion behavior as the other top-level sections. Unlike other sections, the "Administration" section header itself — not just its shelf content — SHALL only be visible and expandable to users with role `ADMIN`; it SHALL NOT be rendered at all for non-admin users.

#### Scenario: Admin sees the Administration section

- **WHEN** a user with role `ADMIN` views the menu
- **THEN** an "Administration" section header is visible and expandable

#### Scenario: Member does not see the Administration section

- **WHEN** a user with role `MEMBER` views the menu
- **THEN** no "Administration" section header is rendered anywhere in the menu

### Requirement: Approval Queue Action in Administration Shelf

The Administration shelf SHALL contain an "Approval Queue" action item. Activating it SHALL navigate the user to `/admin/approval-queue`.

#### Scenario: Approval Queue navigates to the approval queue page

- **WHEN** an admin expands the Administration section and clicks "Approval Queue"
- **THEN** the menu closes and the browser navigates to `/admin/approval-queue`
