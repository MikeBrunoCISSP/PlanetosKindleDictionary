## MODIFIED Requirements

### Requirement: Combined Login/Registration Page

The front-end SHALL expose a single `/login` route that presents both a Sign In form and a Register form accessible via a tab toggle. The active tab SHALL be controllable via the URL query parameter `?mode=login` (default), `?mode=register`, or `?mode=forgot-password`. The Sign In form SHALL include a "Forgot Password?" link that navigates to `?mode=forgot-password`, replacing the tabbed Sign In/Register content with a single form asking for the user's username or email address.

#### Scenario: Default tab is Sign In

- **WHEN** a user navigates to `/login` with no query parameter
- **THEN** the Sign In tab is active and its form is visible

#### Scenario: Register tab via query param

- **WHEN** a user navigates to `/login?mode=register`
- **THEN** the Register tab is active and its form is visible

#### Scenario: Successful login redirects home

- **WHEN** the Sign In form is submitted with valid credentials
- **THEN** the user is redirected to `/` after the session is established

#### Scenario: Successful registration redirects home

- **WHEN** the Register form is submitted with all valid fields
- **THEN** the user is redirected to `/` after the session is established

#### Scenario: Confirm-password mismatch

- **WHEN** the Register form's Confirm Password field has content that does not match the current value of the Password field
- **THEN** a mismatch indicator is displayed adjacent to the Confirm Password field immediately, live as the values differ, without requiring a submit attempt

#### Scenario: Confirm-password mismatch clears once the values match

- **WHEN** the Register form's Confirm Password field is edited so that it now matches the current value of the Password field
- **THEN** the mismatch indicator is no longer displayed

#### Scenario: Password rule violations shown inline

- **WHEN** the Register form's Password field has content that violates one or more complexity rules
- **THEN** each violated rule is shown as unsatisfied in the password requirement checklist beneath the field, live as the user types, without requiring a submit attempt (see the Password Requirement Checklist requirement for the checklist's own behavior)

#### Scenario: Authenticated user visiting /login

- **WHEN** a user who already has an active session navigates to `/login`
- **THEN** the page redirects them to `/` without displaying any form

#### Scenario: Forgot Password link navigates to the request form

- **WHEN** a user on the Sign In form clicks "Forgot Password?"
- **THEN** the page navigates to `/login?mode=forgot-password` and shows a form asking for username or email, replacing the Sign In/Register tabs

## ADDED Requirements

### Requirement: Password Requirement Checklist

The Register form SHALL display the password complexity rules as a bulleted checklist beneath the Password field, visible regardless of whether the field currently has content. Each rule SHALL be shown as its own list item; an item SHALL switch to a green checkmark the moment the current Password field value satisfies that rule, live as the user types, and SHALL revert to its unsatisfied appearance if a later edit no longer satisfies it. The Password field SHALL NOT additionally display the bundled rule-violation text message that a failed submit previously produced — the checklist is the sole feedback for password complexity.

#### Scenario: Checklist visible before typing

- **WHEN** the Register form is shown and the Password field is empty
- **THEN** all password requirement items are visible in their unsatisfied state

#### Scenario: A requirement turns to a checkmark as it's satisfied

- **WHEN** the user types a Password field value that satisfies one of the requirements (minimum length, an uppercase letter, a lowercase letter, or a digit)
- **THEN** that requirement's list item switches to a green checkmark immediately, without requiring a submit attempt

#### Scenario: A satisfied requirement reverts if no longer met

- **WHEN** the user edits the Password field so that a previously-satisfied requirement is no longer met
- **THEN** that requirement's list item reverts to its unsatisfied appearance

#### Scenario: All requirements satisfied

- **WHEN** the Password field value satisfies every complexity rule
- **THEN** every item in the checklist shows a green checkmark
