## MODIFIED Requirements

### Requirement: Log In Link for Unauthenticated Visitors

When no user is logged in, the header SHALL display a "Log In/Register" link in the position where the account-menu button would otherwise appear, directly to the left of the hamburger menu button. The hamburger menu button SHALL be rendered for an unauthenticated visitor as well, showing the minimal menu content defined by the "Minimal Menu for Anonymous Visitors" requirement.

#### Scenario: Anonymous visitor sees a Log In link

- **WHEN** an unauthenticated visitor views any page
- **THEN** a "Log In/Register" link is visible in the header in place of the account-menu button, and the hamburger menu button is also rendered

#### Scenario: Log In link navigates to the login page

- **WHEN** an unauthenticated visitor clicks the "Log In/Register" link
- **THEN** the browser navigates to `/login`
