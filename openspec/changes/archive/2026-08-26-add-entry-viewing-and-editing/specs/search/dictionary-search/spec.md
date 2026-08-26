## MODIFIED Requirements

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
