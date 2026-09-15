## MODIFIED Requirements

### Requirement: All-Dictionaries Download Page

The system SHALL provide a single page, reachable and usable without logging in, that lists every dictionary (series), regardless of whether it has a successful build or how many entries that build contains. Each listed dictionary SHALL show its term count, defined as the entry count of its most recent successful build, or zero if it has no successful build, and its last-modified time, defined as the completion time of that same most recent successful build. A dictionary whose term count is zero SHALL display a dash (`—`) in place of both the term count and the last-modified time, regardless of whether a build technically completed. The last-modified time, when shown, SHALL be formatted as three-letter month, two-digit day, four-digit year, and 24-hour hour and minute (for example `Jan 06 2026 14:30`), and SHALL be rendered in the visitor's own local timezone. A dictionary whose term count is greater than zero SHALL provide a direct download link for its latest EPUB. A dictionary whose term count is zero SHALL NOT provide a download link, and its title SHALL be shown visually de-emphasized (muted) relative to other dictionaries; in place of the download link the page SHALL display "Contribute Now!", linking to the sign-in/register page.

#### Scenario: Anonymous visitor sees the list of downloadable dictionaries

- **WHEN** an unauthenticated visitor opens the all-dictionaries download page
- **THEN** they see every dictionary (series) in the system, including those with no successful build and those whose latest build has zero entries, each showing its term count and last-modified time

#### Scenario: Dictionary with a non-zero term count shows its count, last-modified time, and a download link

- **WHEN** a dictionary's most recent successful build has a non-zero entry count
- **THEN** the page shows that entry count as the dictionary's term count, that build's completion time as its last-modified time, and a working download link for its latest EPUB

#### Scenario: Visitor downloads a dictionary directly from the list

- **WHEN** a visitor clicks a dictionary's download link on the all-dictionaries download page
- **THEN** that dictionary's latest EPUB begins downloading, without being prompted to log in

#### Scenario: A dictionary with no build yet is omitted

<!-- Name retained from the prior spec for delta continuity; behavior is now the opposite: the dictionary is INCLUDED, not omitted. -->
- **WHEN** a dictionary has no successful build
- **THEN** it is no longer omitted from the all-dictionaries download page's list; instead it appears there with a dimmed title, a dash shown for its term count and last-modified time, and "Contribute Now!" shown instead of a download link

#### Scenario: A dictionary whose latest build is empty is omitted

<!-- Name retained from the prior spec for delta continuity; behavior is now the opposite: the dictionary is INCLUDED, not omitted. -->
- **WHEN** a dictionary's most recent successful build has an entry count of zero
- **THEN** it is no longer omitted from the all-dictionaries download page's list; instead it appears there with a dimmed title, a dash shown for its term count and last-modified time (even though that build did complete), and "Contribute Now!" shown instead of a download link

#### Scenario: A dictionary that became empty after an earlier non-empty build is omitted

<!-- Name retained from the prior spec for delta continuity; behavior is now the opposite: the dictionary is INCLUDED, not omitted. -->
- **WHEN** a dictionary's most recent successful build has an entry count of zero, even though an earlier successful build for the same dictionary had a non-zero entry count
- **THEN** it is no longer omitted from the all-dictionaries download page's list; instead it appears there with a dimmed title, a dash shown for its term count and last-modified time, and "Contribute Now!" shown instead of a download link, since the listing reflects only the latest build

#### Scenario: Contribution prompt links to the sign-in/register page

- **WHEN** a visitor sees the "Contribute Now!" prompt for a zero-term dictionary
- **THEN** it is a link to the sign-in/register page

#### Scenario: Last-modified time renders in the visitor's local timezone

- **WHEN** a dictionary's term count is greater than zero and two visitors in different timezones open the all-dictionaries download page
- **THEN** each visitor sees that dictionary's last-modified time expressed in their own browser's local timezone, not a fixed server timezone

## ADDED Requirements

### Requirement: All-Dictionaries List Ordering

The all-dictionaries download page SHALL group every dictionary with a non-zero term count above every dictionary with a zero term count, and SHALL order dictionaries alphabetically by title within each of those two groups.

#### Scenario: Populated dictionaries appear before empty ones

- **WHEN** a visitor opens the all-dictionaries download page and the list contains both dictionaries with a non-zero term count and dictionaries with a zero term count
- **THEN** every dictionary with a non-zero term count appears above every dictionary with a zero term count

#### Scenario: Each group is ordered alphabetically by title

- **WHEN** a visitor opens the all-dictionaries download page
- **THEN** within the group of non-zero-term dictionaries, and separately within the group of zero-term dictionaries, dictionaries appear in ascending alphabetical order by title
