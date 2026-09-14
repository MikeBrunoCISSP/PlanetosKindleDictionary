## MODIFIED Requirements

### Requirement: App Name in the Web UI

The system SHALL display "eReader Dictionaries" as the app's name everywhere a user-facing page renders it: the search page heading, the login/register page heading, the header's brand link, and the browser tab title. None of these locations SHALL display "Planetos" or any other prior name. Where the app's name was previously shown together with the tagline "Kindle Series Dictionaries" directly beneath or alongside it, that tagline SHALL be removed rather than shown next to the new name.

#### Scenario: Homepage heading

- **WHEN** a visitor views the search page (`/search`)
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
