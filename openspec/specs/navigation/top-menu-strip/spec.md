# top-menu-strip Specification

## Purpose

Defines the persistent top-of-page navigation strip that gives every visitor a constant, one-click way to reach the app's main destinations — Downloads, Search, Create, and Help — without opening the hamburger menu.

## Requirements

### Requirement: Top Menu Strip Visible on Every Page

The application SHALL render a persistent menu strip directly beneath the existing header on every page, for every visitor regardless of authentication state or role.

#### Scenario: Anonymous visitor sees the strip

- **WHEN** an unauthenticated visitor views any page
- **THEN** the top menu strip is visible beneath the header

#### Scenario: Authenticated visitor sees the strip

- **WHEN** a logged-in user of any role views any page
- **THEN** the top menu strip is visible beneath the header

#### Scenario: Strip appears on pages other than the homepage

- **WHEN** any visitor views a page other than the homepage (e.g. the Contact page)
- **THEN** the top menu strip is still visible beneath the header

### Requirement: Downloads Item in Top Menu Strip

The top menu strip SHALL contain a "Downloads" item, visible to every visitor. Activating it SHALL navigate to `/downloads`.

#### Scenario: Downloads navigates to the all-dictionaries download page

- **WHEN** any visitor clicks "Downloads" in the top menu strip
- **THEN** the browser navigates to `/downloads`

### Requirement: Search Item in Top Menu Strip

The top menu strip SHALL contain a "Search" item, visible to every visitor. Activating it SHALL navigate to `/search`.

#### Scenario: Search navigates to the search page

- **WHEN** any visitor clicks "Search" in the top menu strip
- **THEN** the browser navigates to `/search`

### Requirement: Create Item in Top Menu Strip Reflects Eligibility

The top menu strip SHALL contain a "Create" item, visible to every visitor. For a visitor who is signed in with approval status Approved, or who is an administrator, activating it SHALL navigate to `/entries/new`. For every other visitor — unauthenticated, or signed in with approval status Pending — activating it SHALL navigate to a static explainer page rather than the Add Entry screen.

#### Scenario: Approved member goes directly to Add Entry

- **WHEN** a logged-in user with approval status Approved clicks "Create" in the top menu strip
- **THEN** the browser navigates to `/entries/new`

#### Scenario: Administrator goes directly to Add Entry

- **WHEN** a logged-in administrator clicks "Create" in the top menu strip
- **THEN** the browser navigates to `/entries/new`, regardless of that administrator's own approval status

#### Scenario: Anonymous visitor sees the explainer page

- **WHEN** an unauthenticated visitor clicks "Create" in the top menu strip
- **THEN** the browser navigates to the eligibility explainer page, not `/entries/new`

#### Scenario: Pending member sees the explainer page

- **WHEN** a logged-in user with approval status Pending clicks "Create" in the top menu strip
- **THEN** the browser navigates to the eligibility explainer page, not `/entries/new`

### Requirement: Eligibility Explainer Page Content

The eligibility explainer page reached from an ineligible "Create" click SHALL explain that registering and being approved is required to add and edit dictionary entries. For a visitor who is not signed in, it SHALL provide a way to log in or register. For a visitor who is signed in but Pending, it SHALL indicate that their account is awaiting administrator approval rather than prompting them to register again.

#### Scenario: Anonymous visitor sees a way to register

- **WHEN** an unauthenticated visitor views the eligibility explainer page
- **THEN** the page explains the approval requirement and provides a way to log in or register

#### Scenario: Pending visitor sees an awaiting-approval message

- **WHEN** a signed-in visitor with approval status Pending views the eligibility explainer page
- **THEN** the page explains the approval requirement and indicates their account is awaiting administrator approval, without prompting them to register again

### Requirement: Help Item in Top Menu Strip

The top menu strip SHALL contain a "Help" item, visible to every visitor. Activating it SHALL navigate to `/contact`.

#### Scenario: Help navigates to the Contact page

- **WHEN** any visitor clicks "Help" in the top menu strip
- **THEN** the browser navigates to `/contact`

### Requirement: Top Menu Strip Does Not Cause Page Overflow on Narrow Viewports

When the top menu strip's items do not fit within a narrow viewport, the strip SHALL scroll horizontally within itself. The overall page SHALL NOT scroll horizontally because of the strip.

#### Scenario: Strip scrolls within itself on a narrow viewport

- **WHEN** a visitor views the application at a phone-sized viewport where the strip's items exceed the available width
- **THEN** a horizontal scrollbar appears on the strip itself and the page itself does not scroll horizontally
