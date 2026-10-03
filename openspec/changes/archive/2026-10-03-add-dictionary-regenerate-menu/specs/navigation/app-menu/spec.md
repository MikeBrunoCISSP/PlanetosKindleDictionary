## ADDED Requirements

### Requirement: Regenerate Action in Dictionaries Shelf

The Dictionaries shelf SHALL contain a "Regenerate" action item visible only to admins. Activating it SHALL open a searchable selection dialog whose first option is "All dictionaries", followed by one option per dictionary. Choosing an option SHALL request an immediate rebuild - bypassing change detection, as defined by build-automation's Administrator Manual Rebuild requirement - for the chosen dictionary, or for every dictionary when "All dictionaries" is chosen. The user SHALL be told the outcome: that the rebuild was queued, or why the request failed. Regenerating SHALL NOT require a separate confirmation step, since a rebuild does not remove or alter any dictionary content.

#### Scenario: Admin sees Regenerate item under Dictionaries

- **WHEN** a user with role `ADMIN` expands the "Dictionaries" section
- **THEN** a "Regenerate" action item is visible in the shelf

#### Scenario: Non-admin does not see Regenerate

- **WHEN** a user with role `MEMBER`, or an unauthenticated visitor, expands the "Dictionaries" section
- **THEN** no "Regenerate" action item is displayed

#### Scenario: Regenerate opens dictionary selection dialog

- **WHEN** an admin expands the Dictionaries section and clicks "Regenerate"
- **THEN** a searchable selection dialog opens, listing "All dictionaries" first, followed by each dictionary

#### Scenario: Admin regenerates one dictionary

- **WHEN** an admin chooses a single dictionary in the Regenerate dialog
- **THEN** the dialog closes, a rebuild is requested for that dictionary only, and the admin is told the rebuild was queued

#### Scenario: Admin regenerates all dictionaries

- **WHEN** an admin chooses "All dictionaries" in the Regenerate dialog
- **THEN** the dialog closes, a rebuild is requested for every dictionary, and the admin is told how many rebuilds were queued

#### Scenario: Some rebuild requests fail

- **WHEN** an admin chooses "All dictionaries" and the rebuild request for one or more dictionaries fails
- **THEN** the rebuilds that succeeded remain queued, and the admin is told how many were queued and how many failed

#### Scenario: A single rebuild request fails

- **WHEN** an admin chooses a single dictionary and the rebuild request fails
- **THEN** the admin is shown an error explaining that the rebuild could not be queued
