## Purpose

Defines the behavioral contract for publicly downloading a dictionary's generated Kindle EPUB and its source files, without requiring authentication, and for the minimal page that surfaces those downloads.

## ADDED Requirements

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
