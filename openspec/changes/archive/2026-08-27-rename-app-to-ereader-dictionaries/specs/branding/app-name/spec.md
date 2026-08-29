## Purpose

Defines the behavioral contract for where and how the app's display name appears to users — page headings, the browser tab title, and outbound email branding — independent of any internal, non-user-visible identifiers.

## ADDED Requirements

### Requirement: App Name in the Web UI

The system SHALL display "eReader Dictionaries" as the app's name everywhere a user-facing page renders it: the homepage heading, the login/register page heading, the header's brand link, and the browser tab title. None of these locations SHALL display "Planetos" or any other prior name. Where the app's name was previously shown together with the tagline "Kindle Series Dictionaries" directly beneath or alongside it, that tagline SHALL be removed rather than shown next to the new name.

#### Scenario: Homepage heading

- **WHEN** a visitor views the homepage
- **THEN** the heading reads "eReader Dictionaries"

#### Scenario: Login page heading without the redundant tagline

- **WHEN** a visitor views the `/login` page in any mode (Sign In, Register, or Forgot Password)
- **THEN** the heading reads "eReader Dictionaries" and no "Kindle Series Dictionaries" tagline is shown beneath it

#### Scenario: Header brand link

- **WHEN** a visitor views any page with the persistent header
- **THEN** the brand link in the header reads "eReader Dictionaries"

#### Scenario: Browser tab title without the redundant tagline

- **WHEN** a visitor views any page
- **THEN** the browser tab title reads "eReader Dictionaries" and does not additionally include the "Kindle Series Dictionaries" tagline

### Requirement: App Name in Password-Reset Email

The password-reset email's sender display name, subject line, and body text SHALL refer to the app as "eReader Dictionaries" rather than "Planetos".

#### Scenario: Email sender display name

- **WHEN** a password-reset email is sent
- **THEN** its sender display name is "eReader Dictionaries"

#### Scenario: Email subject and body

- **WHEN** a password-reset email is sent
- **THEN** its subject line and body text refer to the app as "eReader Dictionaries", not "Planetos"
