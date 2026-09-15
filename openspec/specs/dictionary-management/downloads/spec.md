# downloads Specification

## Purpose

Defines the behavioral contract for publicly downloading a dictionary's generated Kindle EPUB and its source files, without requiring authentication, and for the minimal page that surfaces those downloads.

## Requirements

### Requirement: Public Dictionary Download

The system SHALL allow any visitor, authenticated or not, to download the most recently successful build's EPUB for a given series, and separately to download that build's sources archive. Neither download SHALL require the visitor to be logged in. If a series has no successful build yet, the system SHALL indicate that clearly rather than serving a broken or empty file.

#### Scenario: Anonymous visitor downloads the dictionary EPUB

- **WHEN** an unauthenticated visitor requests the dictionary download for a series that has at least one successful build
- **THEN** they receive the EPUB from that series' most recent successful build, without being prompted to log in

#### Scenario: Anonymous visitor downloads the sources archive

- **WHEN** an unauthenticated visitor requests the sources download for a series that has at least one successful build
- **THEN** they receive the sources archive from that series' most recent successful build, without being prompted to log in

#### Scenario: Download is unavailable before the first successful build

- **WHEN** a visitor requests either download for a series that has no successful build yet
- **THEN** the request fails clearly, indicating no build is available, rather than returning a broken or empty file

#### Scenario: A download always reflects the latest successful build

- **WHEN** a series has multiple successful builds
- **THEN** a download request serves the most recent one, never an older one

### Requirement: Public Build History

The system SHALL let any visitor view a series' build history, showing at least each build's outcome, when it ran, and how many entries it contained, capped at a fixed server-enforced maximum number of the most recent builds. This history SHALL NOT expose internal diagnostic detail such as error messages or logs to visitors who are not administrators.

#### Scenario: Visitor views build history

- **WHEN** any visitor requests a series' build history
- **THEN** they see each past build's outcome, timestamp, and entry count

#### Scenario: Diagnostic detail is not exposed publicly

- **WHEN** a non-administrator visitor requests a series' build history and one of its builds failed
- **THEN** the failed build's internal error detail is not included in what they see

#### Scenario: Build history is capped to the most recent builds

- **WHEN** a series has more builds than the server-enforced maximum
- **THEN** only that many of its most recent builds are returned, newest first

### Requirement: Series Detail Page Surfaces Downloads

The system SHALL expose a page for each dictionary, reachable from search results, showing the dictionary's identifying information and providing the means to download its EPUB and sources. The page SHALL be reachable and usable without logging in.

#### Scenario: Search results link to the series detail page

- **WHEN** a visitor views search results for a dictionary's entry
- **THEN** the dictionary's name in the results is a link to that dictionary's detail page

#### Scenario: Anonymous visitor reaches downloads from the detail page

- **WHEN** an unauthenticated visitor opens a series' detail page for a series with a successful build
- **THEN** they can initiate both the EPUB download and the sources download directly from that page

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

### Requirement: All-Dictionaries List Ordering

The all-dictionaries download page SHALL group every dictionary with a non-zero term count above every dictionary with a zero term count, and SHALL order dictionaries alphabetically by title within each of those two groups.

#### Scenario: Populated dictionaries appear before empty ones

- **WHEN** a visitor opens the all-dictionaries download page and the list contains both dictionaries with a non-zero term count and dictionaries with a zero term count
- **THEN** every dictionary with a non-zero term count appears above every dictionary with a zero term count

#### Scenario: Each group is ordered alphabetically by title

- **WHEN** a visitor opens the all-dictionaries download page
- **THEN** within the group of non-zero-term dictionaries, and separately within the group of zero-term dictionaries, dictionaries appear in ascending alphabetical order by title

### Requirement: Homepage Also Serves the All-Dictionaries Download Page

The homepage (`/`) SHALL render the same content as the all-dictionaries download page (`/downloads`): the same list of dictionaries with the same download links, and the same Kindle-conversion instructions. Both `/` and `/downloads` SHALL remain independently reachable and SHALL NOT redirect to one another.

#### Scenario: Homepage shows the same dictionary list as /downloads

- **WHEN** any visitor opens the homepage
- **THEN** they see the same list of downloadable dictionaries, each with a download link, as they would at `/downloads`

#### Scenario: /downloads keeps working as its own URL

- **WHEN** any visitor navigates directly to `/downloads`
- **THEN** the all-dictionaries download page renders there, without redirecting to `/`

### Requirement: Downloaded EPUB Filename Reflects Dictionary and Build Time

Every route that serves a dictionary's EPUB for download (the per-series download and the all-dictionaries download page) SHALL name the downloaded file `<Dictionary>_<ddMMMyyyyhhmm>.epub`, where `<Dictionary>` is the dictionary's title with characters outside the URL-safe set replaced (case preserved), and the timestamp is the serving build's completion time expressed as two-digit day, three-letter month abbreviation, four-digit year, and 24-hour hour and minute, with no separators between them. This naming SHALL be consistent across every route that serves that EPUB.

#### Scenario: Downloaded filename includes the dictionary title and build time

- **WHEN** a visitor downloads a dictionary's EPUB
- **THEN** the downloaded file's name is the dictionary's title, an underscore, and the serving build's completion timestamp in `ddMMMyyyyhhmm` format, followed by `.epub`

#### Scenario: Filename is sanitized for a title with spaces or punctuation

- **WHEN** a dictionary's title contains spaces or punctuation outside the URL-safe character set
- **THEN** the downloaded filename replaces those characters while preserving the title's original letter casing

#### Scenario: Filename reflects each build's own completion time

- **WHEN** a dictionary has been rebuilt since an earlier download
- **THEN** a new download's filename carries the newer build's completion timestamp, not the earlier one's

#### Scenario: Filename is consistent between the per-series page and the all-dictionaries page

- **WHEN** the same dictionary's EPUB is downloaded once from its `/series/:slug` page and once from the all-dictionaries download page
- **THEN** both downloads produce the same filename, reflecting the same latest successful build
