## ADDED Requirements

### Requirement: Import Action in Entries Shelf

The Entries shelf SHALL contain an "Import" action item visible only to admins. It SHALL NOT be exposed to non-admin users through the shelf or through direct navigation to its destination. Activating it SHALL navigate the user to the bulk import page.

#### Scenario: Admin sees the Import item

- **WHEN** a user with role `ADMIN` expands the Entries section
- **THEN** an "Import" action item is visible in the shelf, alongside "Add" and "Delete"

#### Scenario: Non-admin cannot see the Import item

- **WHEN** a user with role `MEMBER` expands the Entries section
- **THEN** no "Import" action item is displayed in the shelf

#### Scenario: Import navigates to the bulk import page

- **WHEN** an admin expands the Entries section and clicks "Import"
- **THEN** the menu closes and the browser navigates to the bulk import page
