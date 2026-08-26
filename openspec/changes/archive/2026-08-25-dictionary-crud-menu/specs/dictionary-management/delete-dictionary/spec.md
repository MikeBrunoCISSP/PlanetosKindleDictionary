## Purpose

Defines the behavioral contract for deleting a dictionary: an admin-only operation that requires selecting the target dictionary from a searchable list and then explicitly confirming the destructive action before deletion proceeds.

## ADDED Requirements

### Requirement: Delete Dictionary API

The system SHALL expose a `DELETE /api/series/:slug` endpoint accessible only to users with role `ADMIN`. On success it SHALL return 204 No Content. The endpoint SHALL return 404 if no dictionary with the given slug exists and 403 if the caller is not an admin.

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

### Requirement: Dictionary Selection Before Deletion

When an admin initiates the Delete action from the menu, the system SHALL present a searchable dialog listing all dictionaries so the admin can choose which one to delete.

#### Scenario: Selection dialog lists available dictionaries

- **WHEN** an admin clicks "Delete" in the Dictionary menu section
- **THEN** a dialog opens with a search field and a list of all dictionaries

#### Scenario: Selecting a dictionary advances to confirmation

- **WHEN** an admin selects a dictionary from the selection dialog
- **THEN** the selection dialog closes and a confirmation dialog opens for the selected dictionary

### Requirement: Deletion Confirmation Dialog

Before any dictionary is deleted, the system SHALL present a confirmation dialog naming the specific dictionary to be deleted and requiring an explicit affirmative action.

#### Scenario: Confirmation dialog names the target dictionary

- **WHEN** the confirmation dialog is open
- **THEN** the dialog displays the name of the dictionary to be deleted

#### Scenario: Confirming deletion removes the dictionary

- **WHEN** the admin clicks the "Delete" button in the confirmation dialog
- **THEN** the dictionary is deleted and is no longer present in any dictionary listing

#### Scenario: Cancelling leaves the dictionary intact

- **WHEN** the admin clicks "Cancel" in the confirmation dialog
- **THEN** the dialog closes and the dictionary is not deleted
