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

The system SHALL let any visitor view a series' build history, showing at least each build's outcome, when it ran, and how many entries it contained. This history SHALL NOT expose internal diagnostic detail such as error messages or logs to visitors who are not administrators.

#### Scenario: Visitor views build history

- **WHEN** any visitor requests a series' build history
- **THEN** they see each past build's outcome, timestamp, and entry count

#### Scenario: Diagnostic detail is not exposed publicly

- **WHEN** a non-administrator visitor requests a series' build history and one of its builds failed
- **THEN** the failed build's internal error detail is not included in what they see

### Requirement: Series Detail Page Surfaces Downloads

The system SHALL expose a page for each dictionary, reachable from search results, showing the dictionary's identifying information and providing the means to download its EPUB and sources. The page SHALL be reachable and usable without logging in.

#### Scenario: Search results link to the series detail page

- **WHEN** a visitor views search results for a dictionary's entry
- **THEN** the dictionary's name in the results is a link to that dictionary's detail page

#### Scenario: Anonymous visitor reaches downloads from the detail page

- **WHEN** an unauthenticated visitor opens a series' detail page for a series with a successful build
- **THEN** they can initiate both the EPUB download and the sources download directly from that page

### Requirement: All-Dictionaries Download Page

The system SHALL provide a single page, reachable and usable without logging in, that lists every dictionary with at least one successful build and provides a direct download link for each dictionary's latest EPUB. A dictionary with no successful build yet SHALL NOT appear in the list.

#### Scenario: Anonymous visitor sees the list of downloadable dictionaries

- **WHEN** an unauthenticated visitor opens the all-dictionaries download page
- **THEN** they see every dictionary that has at least one successful build, each with a download link

#### Scenario: Visitor downloads a dictionary directly from the list

- **WHEN** a visitor clicks a dictionary's download link on the all-dictionaries download page
- **THEN** that dictionary's latest EPUB begins downloading, without being prompted to log in

#### Scenario: A dictionary with no build yet is omitted

- **WHEN** a dictionary has no successful build
- **THEN** it does not appear in the all-dictionaries download page's list

### Requirement: Entry Points to the All-Dictionaries Download Page

The system SHALL provide a "Download the latest dictionaries" hyperlink on the homepage, beneath the search box, that navigates to the all-dictionaries download page. This is in addition to the menu's own "Download" entry point (see the `navigation/app-menu` capability); both SHALL lead to the same page.

#### Scenario: Homepage hyperlink navigates to the download page

- **WHEN** a visitor on the homepage clicks "Download the latest dictionaries"
- **THEN** the browser navigates to the all-dictionaries download page

#### Scenario: Homepage hyperlink is visible without logging in

- **WHEN** an unauthenticated visitor views the homepage
- **THEN** the "Download the latest dictionaries" hyperlink is visible beneath the search box

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
