## ADDED Requirements

### Requirement: Homepage Also Serves the All-Dictionaries Download Page

The homepage (`/`) SHALL render the same content as the all-dictionaries download page (`/downloads`): the same list of dictionaries with the same download links, and the same Kindle-conversion instructions. Both `/` and `/downloads` SHALL remain independently reachable and SHALL NOT redirect to one another.

#### Scenario: Homepage shows the same dictionary list as /downloads

- **WHEN** any visitor opens the homepage
- **THEN** they see the same list of downloadable dictionaries, each with a download link, as they would at `/downloads`

#### Scenario: /downloads keeps working as its own URL

- **WHEN** any visitor navigates directly to `/downloads`
- **THEN** the all-dictionaries download page renders there, without redirecting to `/`

## REMOVED Requirements

### Requirement: Entry Points to the All-Dictionaries Download Page

**Reason**: The all-dictionaries download page's content is now rendered directly at the homepage (`/`) itself (see "Homepage Also Serves the All-Dictionaries Download Page"), so a separate "Download the latest dictionaries" hyperlink beneath a search box on the homepage no longer applies — the homepage no longer has a search box on it at all.

**Migration**: The top menu strip's "Downloads" item (see `navigation/top-menu-strip`) and the hamburger menu's existing "Download" item remain the ways to reach the download page from elsewhere in the app. Nothing replaces the old homepage hyperlink on the homepage itself, since the homepage's own content now serves that purpose directly.
