## Purpose

Defines the behavioral contract for admin-gated route guards: when an authenticated non-admin user attempts to access an admin-only page via a direct URL, the application SHALL redirect them to the home page rather than rendering an error page.

## Requirements

### Requirement: Non-Admin Redirect on Admin-Only Routes

Admin-only routes (`/admin`, `/series/new`, `/series/:slug/edit`) SHALL redirect authenticated users without the `ADMIN` role to the home page (`/`). Unauthenticated users SHALL continue to be redirected to `/login`.

#### Scenario: Member deep-links to admin page

- **WHEN** a logged-in user with role `MEMBER` navigates directly to `/admin`
- **THEN** the browser redirects them to `/`

#### Scenario: Member deep-links to create dictionary page

- **WHEN** a logged-in user with role `MEMBER` navigates directly to `/series/new`
- **THEN** the browser redirects them to `/`

#### Scenario: Member deep-links to edit dictionary page

- **WHEN** a logged-in user with role `MEMBER` navigates directly to `/series/:slug/edit`
- **THEN** the browser redirects them to `/`

#### Scenario: Unauthenticated user is redirected to login

- **WHEN** an unauthenticated user navigates directly to any admin-only route
- **THEN** the browser redirects them to `/login`
