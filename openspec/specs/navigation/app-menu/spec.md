## Purpose

Defines the behavioral contract for the persistent application header menu — which users see it, how sections expand, and how the shelf content reflects the current user's permissions.

## Requirements

### Requirement: Menu Visible to All Authenticated Users

The application header SHALL display a hamburger menu button to every logged-in user regardless of role. Unauthenticated users are redirected to `/login` before the header renders, so the menu is always rendered in an authenticated context.

#### Scenario: Admin sees menu

- **WHEN** a logged-in user with role `ADMIN` views any page
- **THEN** the hamburger menu button is visible in the header

#### Scenario: Member sees menu

- **WHEN** a logged-in user with role `MEMBER` views any page
- **THEN** the hamburger menu button is visible in the header

### Requirement: Accordion Section Expansion

The menu SHALL present top-level sections (e.g., "Create", "Update") that expand and collapse inline when clicked. Only one section SHALL be open at a time; clicking an already-open section collapses it. The expanded content appears directly below the section header within the menu panel — no flyout or separate popup.

#### Scenario: Section expands on click

- **WHEN** a user clicks a collapsed top-level section header
- **THEN** that section expands to reveal its shelf content inline

#### Scenario: Active section collapses on re-click

- **WHEN** a user clicks the currently expanded section header
- **THEN** that section collapses and no shelf content is visible

#### Scenario: Opening a new section closes the previous one

- **WHEN** a user opens section A and then clicks section B
- **THEN** section B expands and section A closes

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

### Requirement: Dictionaries Top-Level Section

The menu SHALL include a "Dictionaries" top-level section that expands and collapses inline when clicked, following the same accordion behavior as the "Settings" section. The "Dictionaries" section SHALL be visible and expandable by all authenticated users regardless of role.

#### Scenario: Dictionaries section expands on click

- **WHEN** a logged-in user clicks the "Dictionaries" section header in the menu
- **THEN** the section expands to reveal its shelf content inline

#### Scenario: Dictionaries section collapses on re-click

- **WHEN** a user clicks the already-expanded "Dictionaries" section header
- **THEN** the section collapses

#### Scenario: Opening Dictionaries closes other open sections

- **WHEN** a user has the "Settings" section open and clicks "Dictionaries"
- **THEN** "Dictionaries" expands and "Settings" closes

### Requirement: Create Action in Dictionaries Shelf

The Dictionaries shelf SHALL contain a "Create" action item visible only to admins. Activating it SHALL navigate the user to `/series/new`.

#### Scenario: Create navigates to new dictionary page

- **WHEN** an admin expands the Dictionaries section and clicks "Create"
- **THEN** the menu closes and the browser navigates to `/series/new`

### Requirement: Update Action in Dictionaries Shelf

The Dictionaries shelf SHALL contain an "Update" action item visible only to admins. Activating it SHALL open a searchable selection dialog for choosing which dictionary to edit.

#### Scenario: Update opens dictionary selection dialog

- **WHEN** an admin expands the Dictionaries section and clicks "Update"
- **THEN** a searchable dialog opens listing all dictionaries

### Requirement: Delete Action in Dictionaries Shelf

The Dictionaries shelf SHALL contain a "Delete" action item visible only to admins. Activating it SHALL open a searchable selection dialog for choosing which dictionary to delete.

#### Scenario: Delete opens dictionary selection dialog

- **WHEN** an admin expands the Dictionaries section and clicks "Delete"
- **THEN** a searchable dialog opens listing all dictionaries for deletion

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
