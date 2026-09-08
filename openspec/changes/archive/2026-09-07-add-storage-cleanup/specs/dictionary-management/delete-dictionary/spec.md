## MODIFIED Requirements

### Requirement: Delete Dictionary API

The system SHALL expose a `DELETE /api/series/:slug` endpoint accessible only to users with role `ADMIN`. On success it SHALL return 204 No Content. The endpoint SHALL return 404 if no dictionary with the given slug exists and 403 if the caller is not an admin. Deleting a dictionary SHALL eventually remove every object-storage artifact (EPUB and sources archives from every build that dictionary ever produced) that deletion made unreachable, even though this removal need not complete before the 204 response is returned.

#### Scenario: Admin deletes an existing dictionary

- **WHEN** an admin sends `DELETE /api/series/:slug` for an existing slug
- **THEN** the server responds with 204 and the dictionary no longer exists in the system

#### Scenario: Delete returns 404 for unknown slug

- **WHEN** an admin sends `DELETE /api/series/:slug` for a slug that does not exist
- **THEN** the server responds with 404

#### Scenario: Delete returns 403 for non-admin

- **WHEN** an authenticated non-admin sends `DELETE /api/series/:slug`
- **THEN** the server responds with 403

#### Scenario: Delete returns 401 for unauthenticated request

- **WHEN** an unauthenticated request sends `DELETE /api/series/:slug`
- **THEN** the server responds with 401

#### Scenario: Deleting a dictionary eventually removes its stored artifacts

- **WHEN** an admin deletes a dictionary that had one or more builds with stored objects
- **THEN** every object-storage artifact that dictionary's builds ever produced is eventually removed, without requiring any further action
