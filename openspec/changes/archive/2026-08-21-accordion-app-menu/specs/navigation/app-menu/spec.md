## Purpose

Defines the behavioral contract for the persistent application header menu — which users see it, how sections expand, and how the shelf content reflects the current user's permissions.

## ADDED Requirements

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

The items rendered inside each expanded shelf SHALL reflect the current user's permissions. If the user holds no permission relevant to a section, that section's shelf SHALL be empty. The section header itself SHALL still be visible and expandable; only the content is absent.

#### Scenario: Admin sees Dictionary items

- **WHEN** a user with role `ADMIN` expands the "Create" section
- **THEN** a "Dictionary" action item is visible in the shelf

#### Scenario: Member sees empty Create shelf

- **WHEN** a user with role `MEMBER` expands the "Create" section
- **THEN** the shelf is empty — no action items are displayed

#### Scenario: Admin sees Dictionary items in Update

- **WHEN** a user with role `ADMIN` expands the "Update" section
- **THEN** a "Dictionary" action item is visible in the shelf

#### Scenario: Member sees empty Update shelf

- **WHEN** a user with role `MEMBER` expands the "Update" section
- **THEN** the shelf is empty — no action items are displayed
