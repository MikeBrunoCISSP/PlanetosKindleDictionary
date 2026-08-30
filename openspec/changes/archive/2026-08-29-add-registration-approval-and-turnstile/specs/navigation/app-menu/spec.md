## ADDED Requirements

### Requirement: User Management Action in Administration Shelf

The Administration shelf SHALL contain a "User Management" action item. Activating it SHALL navigate the user to `/admin`.

#### Scenario: User Management navigates to the admin dashboard

- **WHEN** an admin expands the Administration section and clicks "User Management"
- **THEN** the menu closes and the browser navigates to `/admin`

### Requirement: Turnstile Action in Administration Shelf

The Administration shelf SHALL contain a "Turnstile" action item. Activating it SHALL navigate the user to `/admin/turnstile`.

#### Scenario: Turnstile navigates to the Turnstile administration page

- **WHEN** an admin expands the Administration section and clicks "Turnstile"
- **THEN** the menu closes and the browser navigates to `/admin/turnstile`
