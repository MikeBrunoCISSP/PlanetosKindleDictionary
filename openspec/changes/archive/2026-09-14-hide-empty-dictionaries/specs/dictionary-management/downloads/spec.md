## MODIFIED Requirements

### Requirement: All-Dictionaries Download Page

The system SHALL provide a single page, reachable and usable without logging in, that lists every dictionary with at least one successful build whose entry count is greater than zero, and provides a direct download link for each dictionary's latest EPUB. A dictionary with no successful build yet SHALL NOT appear in the list. A dictionary whose latest successful build contains zero entries SHALL NOT appear in the list either, since its EPUB would have nothing in it to look up.

#### Scenario: Anonymous visitor sees the list of downloadable dictionaries

- **WHEN** an unauthenticated visitor opens the all-dictionaries download page
- **THEN** they see every dictionary that has at least one successful build with a non-zero entry count, each with a download link

#### Scenario: Visitor downloads a dictionary directly from the list

- **WHEN** a visitor clicks a dictionary's download link on the all-dictionaries download page
- **THEN** that dictionary's latest EPUB begins downloading, without being prompted to log in

#### Scenario: A dictionary with no build yet is omitted

- **WHEN** a dictionary has no successful build
- **THEN** it does not appear in the all-dictionaries download page's list

#### Scenario: A dictionary whose latest build is empty is omitted

- **WHEN** a dictionary's most recent successful build has an entry count of zero
- **THEN** it does not appear in the all-dictionaries download page's list, even though a successful build exists

#### Scenario: A dictionary that became empty after an earlier non-empty build is omitted

- **WHEN** a dictionary's most recent successful build has an entry count of zero, even though an earlier successful build for the same dictionary had a non-zero entry count
- **THEN** it does not appear in the all-dictionaries download page's list, since the listing reflects only the latest build
