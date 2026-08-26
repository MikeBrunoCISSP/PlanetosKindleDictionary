## MODIFIED Requirements

### Requirement: Dictionaries Top-Level Section

The menu SHALL include a "Dictionaries" top-level section that expands and collapses inline when clicked, following the same accordion behavior as the other top-level sections. The "Dictionaries" section SHALL be visible and expandable by all authenticated users regardless of role.

#### Scenario: Dictionaries section expands on click

- **WHEN** a logged-in user clicks the "Dictionaries" section header in the menu
- **THEN** the section expands to reveal its shelf content inline

#### Scenario: Dictionaries section collapses on re-click

- **WHEN** a user clicks the already-expanded "Dictionaries" section header
- **THEN** the section collapses

#### Scenario: Opening Dictionaries closes other open sections

- **WHEN** a user has the "Entries" section open and clicks "Dictionaries"
- **THEN** "Dictionaries" expands and "Entries" closes

### Requirement: Entries Top-Level Section

The menu SHALL include an "Entries" top-level section that expands and collapses inline when clicked, following the same accordion behavior as the "Dictionaries" section. The "Entries" section SHALL be visible and expandable by all authenticated users regardless of role.

#### Scenario: Entries section expands on click

- **WHEN** a logged-in user clicks the "Entries" section header in the menu
- **THEN** the section expands to reveal its shelf content inline

#### Scenario: Entries section collapses on re-click

- **WHEN** a user clicks the already-expanded "Entries" section header
- **THEN** the section collapses

#### Scenario: Opening Entries closes other open sections

- **WHEN** a user has the "Dictionaries" section open and clicks "Entries"
- **THEN** "Entries" expands and "Dictionaries" closes

## REMOVED Requirements

### Requirement: Settings Section

**Reason**: The Settings section held only two items, Preferences and Log out, both of which now live in the new persistent Account Menu next to the hamburger button — a dedicated menu section for two account actions is redundant once they're directly accessible.
**Migration**: No user action required. Preferences and Log out are now reached via the new Account Menu button (icon + username) directly to the left of the hamburger menu, instead of Hamburger menu → Settings.

### Requirement: Preferences Item in Settings

**Reason**: The Settings section that contained this item is removed (see above); Preferences now lives in the new Account Menu instead.
**Migration**: No user action required. See the Settings Section removal above.

## ADDED Requirements

### Requirement: Account Menu for Authenticated Users

The persistent header SHALL display an account-menu button directly to the left of the hamburger menu button for every logged-in user, showing a user icon and the current user's username. Activating it SHALL open a popup menu containing exactly two items: "Preferences" and "Log out". The account menu and the hamburger menu SHALL be separate, independently-triggered popups — each menu's own trigger button and its own accordion/expansion state (in the hamburger's case) are unaffected by the other menu's state. At most one of the two menus is open at a time: opening one while the other is already open dismisses the one that was open, consistent with how a single popup is dismissed by an outside interaction elsewhere in the app.

#### Scenario: Authenticated user sees the account menu button

- **WHEN** a logged-in user views any page
- **THEN** a button showing a user icon and their username is visible directly to the left of the hamburger menu button in the header

#### Scenario: Account menu opens with Preferences and Log out

- **WHEN** a logged-in user clicks the account-menu button
- **THEN** a popup menu opens containing exactly two items: "Preferences" and "Log out"

#### Scenario: Opening one menu dismisses the other if it was open

- **WHEN** a logged-in user has the hamburger menu open and clicks the account-menu button
- **THEN** the hamburger menu closes, consistent with any other outside interaction while it is open

#### Scenario: Closing the hamburger menu does not reopen or otherwise affect the account menu

- **WHEN** a logged-in user has the hamburger menu open and dismisses it by any means (clicking outside, pressing Escape, or clicking the account-menu button)
- **THEN** the account menu's own open/closed state changes only as a direct result of the user's own subsequent interaction with it, never as a side effect of the hamburger menu closing

### Requirement: Preferences Item in Account Menu

The account menu SHALL contain a "Preferences" action item, visible to every logged-in user regardless of role. Activating it SHALL navigate the user to `/preferences`.

#### Scenario: Preferences navigates to the preferences page

- **WHEN** a logged-in user opens the account menu and clicks "Preferences"
- **THEN** the menu closes and the browser navigates to `/preferences`

### Requirement: Log Out Item in Account Menu

The account menu SHALL contain a "Log out" action item, visible to every logged-in user regardless of role. Activating it SHALL end the user's session and return them to an unauthenticated state.

#### Scenario: Log out ends the session

- **WHEN** a logged-in user opens the account menu and clicks "Log out"
- **THEN** the session is ended and the user is treated as unauthenticated on subsequent requests

### Requirement: Log In Link for Unauthenticated Visitors

When no user is logged in, the header SHALL display a "Log In" link in the position where the account-menu button would otherwise appear, directly to the left of where the hamburger menu button would be. The hamburger menu button SHALL NOT be rendered for an unauthenticated visitor.

#### Scenario: Anonymous visitor sees a Log In link

- **WHEN** an unauthenticated visitor views any page
- **THEN** a "Log In" link is visible in the header in place of the account-menu button, and no hamburger menu button is rendered

#### Scenario: Log In link navigates to the login page

- **WHEN** an unauthenticated visitor clicks the "Log In" link
- **THEN** the browser navigates to `/login`
