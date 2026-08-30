## Purpose

Provides administrators with the ability to create new dictionary (Series) records and
update their metadata, with creator identity and creation timestamp recorded on every new
Series, plus a public endpoint for listing all dictionaries.

## ADDED Requirements

### Requirement: Series Creator Tracking

Every Series record SHALL store the identity of the user who created it (`createdById`, nullable FK to User) and the timestamp at which it was created (`createdAt`). When a Series is created through an authenticated session, `createdById` SHALL be set to the requesting user's ID. If a Series exists without a creator (e.g. seeded data), `createdById` MAY be null.

#### Scenario: Creator is recorded on creation

- **WHEN** an authenticated ADMIN sends `POST /api/series`
- **THEN** the resulting Series record has `createdById` equal to the requesting user's ID and `createdAt` equal to the server-side creation timestamp

#### Scenario: Existing records tolerate null creator

- **WHEN** a Series record has no `createdById` value
- **THEN** the system reads and returns it without error

### Requirement: List Series

The system SHALL expose `GET /api/series` to return an array of Series records ordered by `title` ascending (case-insensitive). Each entry SHALL include at minimum: `id`, `slug`, `title`, and `description` (which MAY be null). The endpoint SHALL be accessible without authentication (public read). Pagination SHALL be supported via `?page=` and `?limit=` query parameters (default limit 50, max 200).

#### Scenario: Public listing returns all series

- **WHEN** any visitor sends `GET /api/series`
- **THEN** the system returns `200` with a JSON array of series records

#### Scenario: Listing is ordered alphabetically by title

- **WHEN** `GET /api/series` is called
- **THEN** the response array is ordered by `title` ascending (case-insensitive)

#### Scenario: Pagination parameters limit results

- **WHEN** `GET /api/series?page=2&limit=10` is called
- **THEN** the response returns at most 10 records starting at the second page

### Requirement: Create Series

The system SHALL expose `POST /api/series` to authenticated administrators only. The request body SHALL require `title` and `description`, each a non-empty plain-text string (no HTML) capped at 200 and 5000 characters respectively. The system SHALL auto-generate a URL-safe `slug` from the title (lowercase, non-alphanumeric runs replaced with hyphens, leading/trailing hyphens removed); if the generated slug is already in use the system SHALL append a numeric suffix (e.g. `-2`) until the slug is unique. The new Series SHALL be returned with status `201`. Unauthenticated requests SHALL be rejected with `401`. Authenticated non-admin requests SHALL be rejected with `403`. Missing or invalid fields SHALL return `400`.

#### Scenario: Admin creates a series

- **WHEN** an authenticated ADMIN sends `POST /api/series` with `{ "title": "The Wheel of Time", "description": "Fantasy series by Robert Jordan" }`
- **THEN** the system creates a Series with `slug = "the-wheel-of-time"`, `createdById` set to the requesting user's ID, and returns `201` with the full Series record

#### Scenario: Slug collision triggers suffix

- **WHEN** a Series with slug `"the-wheel-of-time"` already exists and an ADMIN creates another Series with the same title
- **THEN** the new Series receives slug `"the-wheel-of-time-2"` and the request returns `201`

#### Scenario: Empty title is rejected

- **WHEN** an ADMIN sends `POST /api/series` with an empty or missing `title`
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `title` field

#### Scenario: Empty description is rejected

- **WHEN** an ADMIN sends `POST /api/series` with an empty or missing `description`
- **THEN** the system returns `400 Bad Request` with a validation error identifying the `description` field

#### Scenario: Non-admin is rejected

- **WHEN** an authenticated non-admin sends `POST /api/series`
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body

#### Scenario: Unauthenticated request is rejected

- **WHEN** an unauthenticated request is sent to `POST /api/series`
- **THEN** the system returns `401 Unauthorized`

### Requirement: Update Series

The system SHALL expose `PATCH /api/series/:slug` to authenticated administrators only. The request body SHALL accept `title` and/or `description` (each a non-empty plain-text string with the same length caps as create); at least one field is required. The Series's `slug` SHALL NOT change when `title` is updated — the slug is immutable once set. The updated Series SHALL be returned with status `200`. Authenticated non-admin requests SHALL be rejected with `403`. An unknown slug SHALL return `404`.

#### Scenario: Admin updates title and description

- **WHEN** an authenticated ADMIN sends `PATCH /api/series/:slug` with `{ "title": "New Title", "description": "Updated description" }`
- **THEN** the system updates both fields, leaves the slug unchanged, and returns `200` with the full updated Series record

#### Scenario: Admin updates only description

- **WHEN** an authenticated ADMIN sends `PATCH /api/series/:slug` with only `{ "description": "New description" }`
- **THEN** the system updates the description, leaves all other fields unchanged, and returns `200`

#### Scenario: Slug is immutable after creation

- **WHEN** a Series with slug `"malazan"` has its title updated
- **THEN** the Series continues to be accessible at `/api/series/malazan` and its slug in the response remains `"malazan"`

#### Scenario: Unknown slug returns 404

- **WHEN** an ADMIN sends `PATCH /api/series/nonexistent-slug`
- **THEN** the system returns `404 Not Found` with an RFC 9457 problem body

#### Scenario: Non-admin is rejected

- **WHEN** an authenticated non-admin sends `PATCH /api/series/:slug`
- **THEN** the system returns `403 Forbidden` with an RFC 9457 problem body

### Requirement: Create Dictionary Page

The system SHALL expose a frontend route at `/series/new`, accessible only to authenticated administrators, that presents a form for creating a new dictionary. The form SHALL require a **Name** field (mapped to Series `title`) and a **Description** field, showing inline validation errors before any API call is made. On successful submission the user SHALL be navigated to the home page (`/`). An authenticated non-admin visitor SHALL be redirected to `/`. An unauthenticated visitor SHALL be redirected to `/login`.

#### Scenario: Admin submits valid creation form

- **WHEN** an authenticated ADMIN fills in Name and Description and submits the form
- **THEN** a new dictionary is created and the browser navigates to the home page

#### Scenario: Empty name shows inline validation error

- **WHEN** the ADMIN submits the creation form with an empty Name field
- **THEN** a validation error is shown adjacent to the Name field and no API call is made

#### Scenario: Empty description shows inline validation error

- **WHEN** the ADMIN submits the creation form with an empty Description field
- **THEN** a validation error is shown adjacent to the Description field and no API call is made

#### Scenario: Non-admin is redirected

- **WHEN** an authenticated MEMBER navigates to `/series/new`
- **THEN** the browser redirects to `/`

#### Scenario: Unauthenticated visitor is redirected

- **WHEN** an unauthenticated user navigates to `/series/new`
- **THEN** the browser redirects to `/login`

### Requirement: Update Dictionary Page

The system SHALL expose a frontend route at `/series/:slug/edit`, accessible only to authenticated administrators, that presents a form pre-populated with the dictionary's current Name and Description. On successful submission the user SHALL be navigated to the home page (`/`). API errors SHALL be surfaced to the user with the problem `title`. If the slug does not resolve to a dictionary the page SHALL render a not-found message rather than a form. An authenticated non-admin visitor SHALL be redirected to `/`. An unauthenticated visitor SHALL be redirected to `/login`.

#### Scenario: Edit page pre-fills existing values

- **WHEN** an authenticated ADMIN navigates to `/series/:slug/edit`
- **THEN** the Name and Description fields are pre-populated with the current values from the Series record

#### Scenario: Admin submits valid update

- **WHEN** an ADMIN modifies the Name or Description and submits the form
- **THEN** the changes are saved and the browser navigates to the home page

#### Scenario: Unknown slug shows a not-found message

- **WHEN** an ADMIN navigates to `/series/nonexistent-slug/edit`
- **THEN** the page renders a not-found message instead of an editable form

#### Scenario: Non-admin is redirected

- **WHEN** an authenticated MEMBER navigates to `/series/:slug/edit`
- **THEN** the browser redirects to `/`

#### Scenario: Unauthenticated visitor is redirected

- **WHEN** an unauthenticated user navigates to `/series/:slug/edit`
- **THEN** the browser redirects to `/login`
