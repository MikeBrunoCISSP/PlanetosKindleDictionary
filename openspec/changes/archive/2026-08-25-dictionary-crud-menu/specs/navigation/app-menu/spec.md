## MODIFIED Requirements

### Requirement: Permission-Gated Shelf Content

The items rendered inside each expanded shelf SHALL reflect the current user's permissions. If the user holds no permission relevant to a section, that section's shelf SHALL be empty. The section header itself SHALL still be visible and expandable; only the content is absent.

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

## ADDED Requirements

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
