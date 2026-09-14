## RENAMED Requirements

- FROM: `### Requirement: Public Homepage Search Access`
- TO: `### Requirement: Public Search Page Access`
- FROM: `### Requirement: Empty-Query Homepage State`
- TO: `### Requirement: Empty-Query Search Page State`

## MODIFIED Requirements

### Requirement: Public Search Page Access

The search page (`/search`) SHALL be fully usable for searching dictionary entries by any visitor, regardless of authentication state. The system SHALL NOT redirect an unauthenticated visitor away from `/search`, and SHALL NOT require an account or session to submit a search or view results.

#### Scenario: Anonymous visitor searches without being redirected

- **WHEN** an unauthenticated visitor navigates to `/search` and submits a search query
- **THEN** the browser stays on `/search` and shows matching results, with no redirect to a login page at any point

#### Scenario: Logged-in visitor searches identically to an anonymous visitor

- **WHEN** an authenticated visitor navigates to `/search` and submits a search query
- **THEN** they see the same search box and results behavior as an anonymous visitor

### Requirement: Empty-Query Search Page State

When no search query has been submitted, `/search` SHALL show only a search box and SHALL NOT display a results grid or perform a search.

#### Scenario: First visit to the homepage

- **WHEN** a visitor navigates to `/search` with no query
- **THEN** only a search box is shown; no results grid is rendered and no search is performed
