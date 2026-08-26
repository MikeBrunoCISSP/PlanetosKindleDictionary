# Dictionary Search Specification

## Purpose

Lets any visitor — logged in or not — search across every dictionary's entries from the homepage and find the right entry even when they only know an inflected form of the word.

## Requirements

### Requirement: Public Homepage Search Access

The homepage (`/`) SHALL be fully usable for searching dictionary entries by any visitor, regardless of authentication state. The system SHALL NOT redirect an unauthenticated visitor away from `/`, and SHALL NOT require an account or session to submit a search or view results.

#### Scenario: Anonymous visitor searches without being redirected

- **WHEN** an unauthenticated visitor navigates to `/` and submits a search query
- **THEN** the browser stays on `/` and shows matching results, with no redirect to a login page at any point

#### Scenario: Logged-in visitor searches identically to an anonymous visitor

- **WHEN** an authenticated visitor navigates to `/` and submits a search query
- **THEN** they see the same search box and results behavior as an anonymous visitor

### Requirement: Empty-Query Homepage State

When no search query has been submitted, `/` SHALL show only a search box and SHALL NOT display a results grid or perform a search.

#### Scenario: First visit to the homepage

- **WHEN** a visitor navigates to `/` with no query
- **THEN** only a search box is shown; no results grid is rendered and no search is performed

### Requirement: Case-Insensitive Substring Matching Across Headwords and Inflections

A search query SHALL match an entry when the query (or, for multi-word queries, any individual word of it — see the multi-word requirement below) is a case-insensitive substring of the entry's headword or of any of the entry's inflected forms. Matching against the entry's definition text SHALL NOT be performed.

#### Scenario: Query matches the headword

- **WHEN** an entry has headword "Run" and a visitor searches "un"
- **THEN** that entry appears in the results

#### Scenario: Query matches an inflection, not the headword

- **WHEN** an entry has headword "Run" with inflection "Ran", and a visitor searches "ran"
- **THEN** that entry appears in the results

#### Scenario: Matching is case-insensitive

- **WHEN** an entry has headword "Aes Sedai" and a visitor searches "AES"
- **THEN** that entry appears in the results

#### Scenario: Query appearing only in the definition does not match

- **WHEN** an entry's definition contains the word "channeler" but neither its headword nor any inflection does, and a visitor searches "channeler"
- **THEN** that entry does not appear in the results

### Requirement: Multi-Word Matching with First-Word-Favored Ranking

When a search query contains more than one word (split on whitespace), the system SHALL include any entry matching at least one of the words. Entries matching an earlier word in the query SHALL be ranked ahead of entries that match only a later word. An entry matching more than one word SHALL be ranked according to the earliest word it matches.

#### Scenario: Query with two words returns entries matching either word

- **WHEN** a visitor searches "dragon fire" and one entry's headword contains "dragon" while a different entry's headword contains only "fire"
- **THEN** both entries appear in the results

#### Scenario: Entries matching the first word rank above entries matching only the second

- **WHEN** a visitor searches "dragon fire" and entry A matches only "dragon" while entry B matches only "fire"
- **THEN** entry A appears before entry B in the results

#### Scenario: An entry matching both words ranks by its earliest match

- **WHEN** a visitor searches "dragon fire" and entry C matches both "dragon" and "fire"
- **THEN** entry C is ranked as if it matched only "dragon" (the first word), not lower

### Requirement: Search Results Grid Display

Search results SHALL be displayed as a grid with, at minimum, two columns: the name of the dictionary (series) the entry belongs to, and the matched entry itself. The entry's headword SHALL be visually distinguished (e.g. bold) from the rest of the row whenever the headword itself was a matching value. The headword SHALL be rendered as a hyperlink to that entry's detail page, addressed by the entry's stable identifier.

#### Scenario: Result row shows the dictionary name and the headword

- **WHEN** a search returns an entry belonging to dictionary "ASOIAF" with headword "Valar Morghulis"
- **THEN** the result row shows "ASOIAF" as the dictionary name and "Valar Morghulis" as the entry, with the headword visually distinguished as the match

#### Scenario: Headword is not distinguished when it wasn't the matching value

- **WHEN** a search matches only via one of an entry's inflections, not its headword
- **THEN** the entry's headword is shown but is not visually distinguished as a match

#### Scenario: Headword links to the entry's detail page

- **WHEN** a search result is displayed
- **THEN** its headword is a hyperlink that navigates to that entry's detail page, addressed by the entry's identifier rather than its headword text

### Requirement: Inflection List with Match Highlighting

Each search result SHALL list the entry's inflected forms alongside the entry. Whichever inflected form(s) actually matched the search query SHALL be visually distinguished (e.g. bold) from the inflections that did not match.

#### Scenario: Matched inflection is distinguished from other inflections

- **WHEN** an entry with inflections "Ran", "Running", "Runs" is returned because the query matched "Ran"
- **THEN** the result lists all three inflections, with "Ran" visually distinguished as the match and the other two shown without that distinction

#### Scenario: No inflection is distinguished when the headword was the match

- **WHEN** an entry is returned because the query matched its headword, not any inflection
- **THEN** the result still lists all of the entry's inflections, none of them visually distinguished as a match

### Requirement: Definition Excerpt Truncation

Each search result SHALL show an excerpt of the entry's definition as plain text (with any markup removed), truncated to the first 256 characters with "..." appended if the plain-text definition is longer than 256 characters. A definition of 256 characters or fewer SHALL be shown in full, with no "..." appended.

#### Scenario: Long definition is truncated

- **WHEN** an entry's definition, as plain text, is longer than 256 characters
- **THEN** the result shows exactly the first 256 characters followed by "..."

#### Scenario: Short definition is shown in full

- **WHEN** an entry's definition, as plain text, is 256 characters or fewer
- **THEN** the result shows the complete definition text with no "..." appended

### Requirement: Pagination

Search results SHALL be limited to at most 50 results per page. When more than 50 entries match, the system SHALL provide a way to navigate to subsequent pages. When there are no matching results, no pagination controls SHALL be shown.

#### Scenario: More than 50 matches are paginated

- **WHEN** a search matches 120 entries
- **THEN** the first page shows 50 results and a way to reach the next page

#### Scenario: No results shown, no pagination controls

- **WHEN** a search matches no entries
- **THEN** the results area shows that there are no matches, and no pagination controls are displayed

### Requirement: Published and Approved Entries Only

Search results SHALL only ever include entries that are both published and approved. An entry that is pending, rejected, or deleted SHALL NOT appear in search results, even when it would otherwise substring-match the query.

#### Scenario: Pending entry is excluded

- **WHEN** an entry awaiting approval has a headword that substring-matches the query
- **THEN** that entry does not appear in the results

#### Scenario: Rejected entry is excluded

- **WHEN** an entry that was rejected has a headword that substring-matches the query
- **THEN** that entry does not appear in the results

#### Scenario: Deleted entry is excluded

- **WHEN** an entry that has been deleted has a headword that substring-matches the query
- **THEN** that entry does not appear in the results
