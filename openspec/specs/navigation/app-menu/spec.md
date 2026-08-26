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
