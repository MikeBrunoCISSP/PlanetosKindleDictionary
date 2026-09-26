# bulk-import Specification

## Purpose

Lets an administrator bulk-create dictionary entries from a JSON file of headword-to-definition pairs, instead of adding entries one at a time, while skipping individual bad or duplicate rows rather than failing the whole file.

## Requirements

### Requirement: Import Is Admin-Only

The bulk import page and its API SHALL be accessible only to users with role `ADMIN`. A non-admin or unauthenticated request SHALL be rejected without performing any import.

#### Scenario: Non-admin cannot reach the import page

- **WHEN** a logged-in user with role `MEMBER` navigates directly to the import page's URL
- **THEN** they are redirected away without seeing the import UI

#### Scenario: Non-admin API request is rejected

- **WHEN** a non-admin or unauthenticated request is made directly to the import API endpoint
- **THEN** the request is rejected and no entries are created

### Requirement: Import File Must Be a Flat Object of Definition/Inflections Entries

An uploaded file SHALL be accepted only if it parses as valid JSON and its top-level value is a non-empty, non-array object whose every value is itself an object containing a string `Definition` property and, optionally, an `Inflections` property that is an array of strings (an absent `Inflections` SHALL be treated as an empty list). Any other shape — invalid JSON, a JSON array, a JSON string/number/null at the top level, a value that is not an object, a value missing `Definition` or whose `Definition` is not a string, or a value whose `Inflections` is present but not an array of strings — SHALL be rejected before any dictionary is chosen or any entry is created, with an error message shown next to the file chooser.

#### Scenario: Non-JSON file is rejected

- **WHEN** an admin selects a file that is not valid JSON
- **THEN** an inline error is shown next to the file chooser and the Import button remains disabled

#### Scenario: JSON array is rejected

- **WHEN** an admin selects a file whose top-level JSON value is an array rather than an object
- **THEN** an inline error is shown next to the file chooser and the Import button remains disabled

#### Scenario: Old flat-string value shape is rejected

- **WHEN** an admin selects a file whose object contains at least one value that is a plain string rather than a `{ Definition, Inflections }` object
- **THEN** an inline error is shown next to the file chooser and the Import button remains disabled

#### Scenario: Value missing or with a non-string Definition is rejected

- **WHEN** an admin selects a file whose object contains at least one value that has no `Definition` property, or whose `Definition` is not a string
- **THEN** an inline error is shown next to the file chooser and the Import button remains disabled

#### Scenario: Non-array Inflections is rejected

- **WHEN** an admin selects a file whose object contains at least one value whose `Inflections` property is present but is not an array
- **THEN** an inline error is shown next to the file chooser and the Import button remains disabled

#### Scenario: Valid file shows its name

- **WHEN** an admin selects a file that is valid JSON, is a non-empty object, and every value is a `{ Definition, Inflections }` object matching the above shape
- **THEN** the file's name is displayed on the line below the file chooser and no error is shown

### Requirement: Invalid or Duplicate Inflections Are Cleaned Up, Not Row-Fatal

Before an entry is created, the system SHALL remove from a row's `Inflections` list any value that is empty or whitespace-only, contains whitespace, exceeds the entry field length limit, matches that row's own headword (case-insensitively), or duplicates another inflection already kept from the same row (case-insensitively, keeping the first occurrence). The entry SHALL still be created using the headword, definition, and the remaining, cleaned inflections — none of these conditions SHALL cause the row to be skipped. This cleanup happens before the per-entry inflection-count limit is checked, so a row is only skipped for having too many inflections (see "Malformed Rows Are Skipped, Not Fatal") after any invalid or duplicate ones have already been removed.

#### Scenario: Multi-word inflection is dropped, not the whole row

- **WHEN** an uploaded file contains a row whose `Inflections` list includes a value with a space in it
- **THEN** an entry is created for that row's headword, and that inflection is left out while the row's other, valid inflections are kept

#### Scenario: Inflection duplicating its own headword is dropped, not the whole row

- **WHEN** an uploaded file contains a row whose `Inflections` list includes a value matching that row's own headword, case-insensitively
- **THEN** an entry is created for that row's headword, and that inflection is left out while the row's other, valid inflections are kept

#### Scenario: Duplicate inflections within the same row are collapsed, not the whole row

- **WHEN** an uploaded file contains a row whose `Inflections` list includes the same value twice, case-insensitively
- **THEN** an entry is created for that row's headword with only the first occurrence of that inflection kept

#### Scenario: Empty or oversized inflection is dropped, not the whole row

- **WHEN** an uploaded file contains a row whose `Inflections` list includes a value that is empty, whitespace-only, or longer than the entry field length limit
- **THEN** an entry is created for that row's headword, and that inflection is left out while the row's other, valid inflections are kept

#### Scenario: Row is still skipped for too many inflections after cleanup

- **WHEN** an uploaded file contains a row whose `Inflections` list, after invalid and duplicate values have been removed, still exceeds the per-entry inflection limit
- **THEN** that entire row is skipped as malformed

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

For each key in the uploaded file, the system SHALL create a new entry in the selected dictionary using that key as the headword and that value's `Definition`/`Inflections` as the entry's definition and inflections, unless the headword or any of its inflections already exists — as a headword or as an inflection, in that dictionary — matching case-insensitively (ignoring leading/trailing whitespace), in which case that key SHALL be skipped in its entirety without creating a duplicate entry or any of its inflections. A file containing two keys that match each other case-insensitively SHALL result in only the first being created; the second SHALL be skipped as a duplicate.

#### Scenario: New headword is created

- **WHEN** an uploaded file contains a headword that does not already exist in the selected dictionary
- **THEN** a new entry is created for that headword, along with any inflections listed for it

#### Scenario: Existing headword is skipped

- **WHEN** an uploaded file contains a headword that already exists in the selected dictionary, in any letter casing
- **THEN** no duplicate entry is created for that headword and the import continues with the remaining entries

#### Scenario: Duplicate within the same file is skipped

- **WHEN** an uploaded file contains two keys that are identical except for letter casing
- **THEN** an entry is created for the first occurrence and the second is skipped as a duplicate

#### Scenario: An inflection colliding with existing content skips the whole row

- **WHEN** an uploaded file contains a headword whose own text is new, but one of its listed inflections matches (case-insensitively) a headword or inflection that already exists elsewhere in the selected dictionary
- **THEN** that row is skipped as a duplicate in its entirety — no entry, and none of that row's other inflections, are created

### Requirement: Malformed Rows Are Skipped, Not Fatal

A row that fails validation — an empty or whitespace-only headword, a headword containing whitespace, an empty definition, a definition exceeding the entry definition length limit, or more inflections than the per-entry inflection limit remaining after invalid/duplicate inflections have been cleaned up (see "Invalid or Duplicate Inflections Are Cleaned Up, Not Row-Fatal") — SHALL be skipped without creating an entry and SHALL NOT prevent the remaining valid rows in the same file from being imported.

#### Scenario: Multi-word headword is skipped

- **WHEN** an uploaded file contains a key with a space in it
- **THEN** that key is skipped and every other valid row in the file is still imported

#### Scenario: Oversized definition is skipped

- **WHEN** an uploaded file contains a definition longer than the entry definition length limit
- **THEN** that row is skipped and every other valid row in the file is still imported

#### Scenario: Too many inflections in one row is skipped

- **WHEN** an uploaded file contains a row whose `Inflections` list, after cleanup, still exceeds the per-entry inflection limit
- **THEN** that entire row is skipped and every other valid row in the file is still imported

### Requirement: Line Breaks and Tabs in Definitions Are Normalized

A definition containing newline characters SHALL be stored such that each newline renders as a line break when the entry is viewed, not as literal newline text. A Windows-style line ending (a carriage return immediately followed by a newline) SHALL be treated the same as two consecutive newline characters, rendering as two line breaks, rather than as a single line break plus a stray leftover character. A carriage return that is not immediately followed by a newline SHALL be treated the same as a single newline character, rendering as one line break. A definition containing a tab character SHALL be stored such that it renders as visible horizontal spacing when the entry is viewed, rather than collapsing to no visible effect as plain whitespace would.

#### Scenario: Multi-paragraph definition renders with line breaks

- **WHEN** an uploaded definition contains one or more newline characters
- **THEN** the created entry's definition renders each newline as a line break, not as literal text

#### Scenario: Windows-style line ending renders as two line breaks

- **WHEN** an uploaded definition contains a carriage return immediately followed by a newline
- **THEN** the created entry's definition renders that pair as two line breaks, the same as it would for two consecutive newline characters

#### Scenario: Standalone carriage return renders as one line break

- **WHEN** an uploaded definition contains a carriage return that is not immediately followed by a newline
- **THEN** the created entry's definition renders it as a single line break, not as literal or stray text

#### Scenario: Tab character renders as visible spacing

- **WHEN** an uploaded definition contains a tab character
- **THEN** the created entry's definition renders it as visible horizontal spacing, not as literal text and not collapsed away entirely

### Requirement: Imported Entries Are Immediately Approved

An entry created by the import SHALL be immediately approved, consistent with an administrator's own single-entry submissions being immediately approved.

#### Scenario: Imported entry is approved on creation

- **WHEN** an admin successfully imports a headword
- **THEN** the resulting entry's approval status is approved, with no separate review step required

### Requirement: Import Shows Progress and a Result Summary

While an import request is in progress, the page SHALL show a progress indicator. When the request completes, the page SHALL show a notification reporting the outcome: on success, how many entries were created and how many were skipped, shown as a warning notification rather than a plain success notification when one or more inflections were dropped from any created entry during cleanup (see "Invalid or Duplicate Inflections Are Cleaned Up, Not Row-Fatal"), so an admin is not left believing every submitted inflection was imported when it was not; on failure, that the import did not complete.

#### Scenario: Progress indicator shown during import

- **WHEN** an admin clicks Import
- **THEN** a progress indicator is shown until the import request completes

#### Scenario: Success notification reports counts

- **WHEN** an import request completes successfully and no entry had any inflection dropped during cleanup
- **THEN** a plain success notification reports the number of entries created and the number skipped

#### Scenario: Warning notification is shown when inflections were dropped

- **WHEN** an import request completes successfully and at least one entry had one or more inflections dropped during cleanup
- **THEN** a warning notification, rather than a plain success notification, reports the number of entries created and the number skipped, and indicates that not all inflections could be included

#### Scenario: Failure notification is shown

- **WHEN** an import request fails outright (not a per-row skip)
- **THEN** a notification indicates the import did not complete
