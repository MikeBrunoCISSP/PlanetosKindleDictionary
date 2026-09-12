## Purpose

Lets an administrator bulk-create dictionary entries from a JSON file of headword-to-definition pairs, instead of adding entries one at a time, while skipping individual bad or duplicate rows rather than failing the whole file.

## ADDED Requirements

### Requirement: Import Is Admin-Only

The bulk import page and its API SHALL be accessible only to users with role `ADMIN`. A non-admin or unauthenticated request SHALL be rejected without performing any import.

#### Scenario: Non-admin cannot reach the import page

- **WHEN** a logged-in user with role `MEMBER` navigates directly to the import page's URL
- **THEN** they are redirected away without seeing the import UI

#### Scenario: Non-admin API request is rejected

- **WHEN** a non-admin or unauthenticated request is made directly to the import API endpoint
- **THEN** the request is rejected and no entries are created

### Requirement: Import File Must Be a Flat Object of String Values

An uploaded file SHALL be accepted only if it parses as valid JSON and its top-level value is a non-empty, non-array object whose every value is a string. Any other shape (invalid JSON, a JSON array, a JSON string/number/null at the top level, or an object containing a non-string value) SHALL be rejected before any dictionary is chosen or any entry is created, with an error message shown next to the file chooser.

#### Scenario: Non-JSON file is rejected

- **WHEN** an admin selects a file that is not valid JSON
- **THEN** an inline error is shown next to the file chooser and the Import button remains disabled

#### Scenario: JSON array is rejected

- **WHEN** an admin selects a file whose top-level JSON value is an array rather than an object
- **THEN** an inline error is shown next to the file chooser and the Import button remains disabled

#### Scenario: Object with a non-string value is rejected

- **WHEN** an admin selects a file whose object contains at least one value that is not a string
- **THEN** an inline error is shown next to the file chooser and the Import button remains disabled

#### Scenario: Valid file shows its name

- **WHEN** an admin selects a file that is valid JSON, is a non-empty object, and every value is a string
- **THEN** the file's name is displayed on the line below the file chooser and no error is shown

### Requirement: Import Button Requires a Dictionary and a Validated File

The Import button SHALL be disabled until both a dictionary has been selected and the uploaded file has passed validation. It SHALL also be disabled while an import is in progress.

#### Scenario: Import disabled with no dictionary selected

- **WHEN** an admin has uploaded a valid file but has not selected a dictionary
- **THEN** the Import button is disabled

#### Scenario: Import disabled with no valid file

- **WHEN** an admin has selected a dictionary but has not uploaded a file that passed validation
- **THEN** the Import button is disabled

#### Scenario: Import enabled once both conditions are met

- **WHEN** an admin has selected a dictionary and uploaded a file that passed validation
- **THEN** the Import button becomes enabled

### Requirement: Each Headword Is Created Unless It Already Exists

For each key in the uploaded file, the system SHALL create a new entry in the selected dictionary using that key as the headword, unless a headword or inflection already exists in that dictionary that matches it case-insensitively (ignoring leading/trailing whitespace), in which case that key SHALL be skipped without creating a duplicate. A file containing two keys that match each other case-insensitively SHALL result in only the first being created; the second SHALL be skipped as a duplicate.

#### Scenario: New headword is created

- **WHEN** an uploaded file contains a headword that does not already exist in the selected dictionary
- **THEN** a new entry is created for that headword

#### Scenario: Existing headword is skipped

- **WHEN** an uploaded file contains a headword that already exists in the selected dictionary, in any letter casing
- **THEN** no duplicate entry is created for that headword and the import continues with the remaining entries

#### Scenario: Duplicate within the same file is skipped

- **WHEN** an uploaded file contains two keys that are identical except for letter casing
- **THEN** an entry is created for the first occurrence and the second is skipped as a duplicate

### Requirement: Malformed Rows Are Skipped, Not Fatal

A row that fails validation — an empty or whitespace-only headword, a headword containing whitespace, an empty definition, or a definition exceeding the entry definition length limit — SHALL be skipped without creating an entry and SHALL NOT prevent the remaining valid rows in the same file from being imported.

#### Scenario: Multi-word headword is skipped

- **WHEN** an uploaded file contains a key with a space in it
- **THEN** that key is skipped and every other valid row in the file is still imported

#### Scenario: Oversized definition is skipped

- **WHEN** an uploaded file contains a definition longer than the entry definition length limit
- **THEN** that row is skipped and every other valid row in the file is still imported

### Requirement: Newlines in Definitions Become Line Breaks

A definition containing newline characters SHALL be stored such that each newline renders as a line break when the entry is viewed, not as literal newline text.

#### Scenario: Multi-paragraph definition renders with line breaks

- **WHEN** an uploaded definition contains one or more newline characters
- **THEN** the created entry's definition renders each newline as a line break, not as literal text

### Requirement: Imported Entries Are Immediately Approved

An entry created by the import SHALL be immediately approved, consistent with an administrator's own single-entry submissions being immediately approved.

#### Scenario: Imported entry is approved on creation

- **WHEN** an admin successfully imports a headword
- **THEN** the resulting entry's approval status is approved, with no separate review step required

### Requirement: Import Shows Progress and a Result Summary

While an import request is in progress, the page SHALL show a progress indicator. When the request completes, the page SHALL show a notification reporting the outcome: on success, how many entries were created and how many were skipped; on failure, that the import did not complete.

#### Scenario: Progress indicator shown during import

- **WHEN** an admin clicks Import
- **THEN** a progress indicator is shown until the import request completes

#### Scenario: Success notification reports counts

- **WHEN** an import request completes successfully
- **THEN** a notification reports the number of entries created and the number skipped

#### Scenario: Failure notification is shown

- **WHEN** an import request fails outright (not a per-row skip)
- **THEN** a notification indicates the import did not complete
