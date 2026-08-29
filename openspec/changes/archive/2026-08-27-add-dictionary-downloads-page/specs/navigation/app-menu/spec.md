## MODIFIED Requirements

### Requirement: Menu Visible to All Authenticated Users

The application header SHALL display a hamburger menu button to every logged-in user regardless of role.

#### Scenario: Admin sees menu

- **WHEN** a logged-in user with role `ADMIN` views any page
- **THEN** the hamburger menu button is visible in the header

#### Scenario: Member sees menu

- **WHEN** a logged-in user with role `MEMBER` views any page
- **THEN** the hamburger menu button is visible in the header

### Requirement: Dictionaries Top-Level Section

The menu SHALL include a "Dictionaries" top-level section that expands and collapses inline when clicked, following the same accordion behavior as the other top-level sections. The "Dictionaries" section SHALL be visible and expandable by all visitors, authenticated or not, regardless of role.

#### Scenario: Dictionaries section expands on click

- **WHEN** a logged-in user clicks the "Dictionaries" section header in the menu
- **THEN** the section expands to reveal its shelf content inline

#### Scenario: Dictionaries section collapses on re-click

- **WHEN** a user clicks the already-expanded "Dictionaries" section header
- **THEN** the section collapses

#### Scenario: Opening Dictionaries closes other open sections

- **WHEN** a user has the "Entries" section open and clicks "Dictionaries"
- **THEN** "Dictionaries" expands and "Entries" closes

#### Scenario: Anonymous visitor can expand the Dictionaries section

- **WHEN** an unauthenticated visitor clicks the "Dictionaries" section header in the menu
- **THEN** the section expands to reveal its shelf content inline

### Requirement: Log In Link for Unauthenticated Visitors

When no user is logged in, the header SHALL display a "Log In" link in the position where the account-menu button would otherwise appear, directly to the left of the hamburger menu button. The hamburger menu button SHALL be rendered for an unauthenticated visitor as well, showing the minimal menu content defined by the "Minimal Menu for Anonymous Visitors" requirement.

#### Scenario: Anonymous visitor sees a Log In link

- **WHEN** an unauthenticated visitor views any page
- **THEN** a "Log In" link is visible in the header in place of the account-menu button, and the hamburger menu button is also rendered

#### Scenario: Log In link navigates to the login page

- **WHEN** an unauthenticated visitor clicks the "Log In" link
- **THEN** the browser navigates to `/login`

## ADDED Requirements

### Requirement: Minimal Menu for Anonymous Visitors

For an unauthenticated visitor, the hamburger menu SHALL render without the user-info header row (there is no logged-in user to show). Of the menu's top-level sections, only "Dictionaries" SHALL be present; "Entries" and "Administration" SHALL NOT be rendered at all for an anonymous visitor. The "Dictionaries" shelf, when expanded by an anonymous visitor, SHALL contain only the "Download" action item — none of the admin-only actions ("Create", "Update", "Delete").

#### Scenario: Anonymous visitor sees only the Dictionaries section

- **WHEN** an unauthenticated visitor opens the hamburger menu
- **THEN** a "Dictionaries" section header is visible, and no "Entries" or "Administration" section header is rendered anywhere in the menu

#### Scenario: Anonymous visitor's Dictionaries shelf contains only Download

- **WHEN** an unauthenticated visitor expands the "Dictionaries" section
- **THEN** a "Download" action item is visible in the shelf, and no "Create", "Update", or "Delete" action item is displayed

#### Scenario: Anonymous menu has no user-info header row

- **WHEN** an unauthenticated visitor opens the hamburger menu
- **THEN** no username or email is displayed at the top of the menu panel

### Requirement: Download Action in Dictionaries Shelf

The Dictionaries shelf SHALL contain a "Download" action item visible to every visitor, authenticated or not, regardless of role. Activating it SHALL navigate the visitor to the all-dictionaries download page.

#### Scenario: Anonymous visitor uses Download

- **WHEN** an unauthenticated visitor expands the Dictionaries section and clicks "Download"
- **THEN** the menu closes and the browser navigates to the all-dictionaries download page

#### Scenario: Authenticated user uses Download

- **WHEN** a logged-in user, of any role, expands the Dictionaries section and clicks "Download"
- **THEN** the menu closes and the browser navigates to the all-dictionaries download page
