## ADDED Requirements

### Requirement: Help Top-Level Section

The menu SHALL include a "Help" top-level section that expands and collapses inline when clicked, following the same accordion behavior as the other top-level sections. The "Help" section SHALL be visible and expandable by all visitors, authenticated or not, regardless of role.

#### Scenario: Help section expands on click

- **WHEN** a user clicks the "Help" section header in the menu
- **THEN** the section expands to reveal its shelf content inline

#### Scenario: Help section collapses on re-click

- **WHEN** a user clicks the already-expanded "Help" section header
- **THEN** the section collapses

#### Scenario: Opening Help closes other open sections

- **WHEN** a user has another section open and clicks "Help"
- **THEN** "Help" expands and the previously-open section closes

#### Scenario: Anonymous visitor can expand the Help section

- **WHEN** an unauthenticated visitor clicks the "Help" section header in the menu
- **THEN** the section expands to reveal its shelf content inline

### Requirement: Contact Action in Help Shelf

The Help shelf SHALL contain a "Contact" action item visible to every visitor, authenticated or not, regardless of role. Activating it SHALL navigate the visitor to the Contact page.

#### Scenario: Anonymous visitor uses Contact

- **WHEN** an unauthenticated visitor expands the Help section and clicks "Contact"
- **THEN** the menu closes and the browser navigates to the Contact page

#### Scenario: Authenticated user uses Contact

- **WHEN** a logged-in user, of any role, expands the Help section and clicks "Contact"
- **THEN** the menu closes and the browser navigates to the Contact page

## MODIFIED Requirements

### Requirement: Minimal Menu for Anonymous Visitors

For an unauthenticated visitor, the hamburger menu SHALL render without the user-info header row (there is no logged-in user to show). Of the menu's top-level sections, only "Dictionaries" and "Help" SHALL be present; "Entries" and "Administration" SHALL NOT be rendered at all for an anonymous visitor. The "Dictionaries" shelf, when expanded by an anonymous visitor, SHALL contain only the "Download" action item — none of the admin-only actions ("Create", "Update", "Delete"). The "Help" shelf, when expanded by an anonymous visitor, SHALL contain the "Contact" action item.

#### Scenario: Anonymous visitor sees only the Dictionaries section

- **WHEN** an unauthenticated visitor opens the hamburger menu
- **THEN** "Dictionaries" and "Help" section headers are visible, and no "Entries" or "Administration" section header is rendered anywhere in the menu

#### Scenario: Anonymous visitor's Dictionaries shelf contains only Download

- **WHEN** an unauthenticated visitor expands the "Dictionaries" section
- **THEN** a "Download" action item is visible in the shelf, and no "Create", "Update", or "Delete" action item is displayed

#### Scenario: Anonymous visitor's Help shelf contains Contact

- **WHEN** an unauthenticated visitor expands the "Help" section
- **THEN** a "Contact" action item is visible in the shelf

#### Scenario: Anonymous menu has no user-info header row

- **WHEN** an unauthenticated visitor opens the hamburger menu
- **THEN** no username or email is displayed at the top of the menu panel
