## Purpose

Lets any visitor view an individual dictionary entry's full content on its own page, reached from a search result, and shows an authenticated visitor a way to propose changes to it.

## ADDED Requirements

### Requirement: Public Entry Detail Access

The system SHALL expose an entry-detail page reachable by the entry's stable identifier (not its Headword), viewable by any visitor regardless of authentication state. An entry that is Approved and Published SHALL be shown normally. An entry that is Pending review SHALL also be shown, with a clear indication that it is awaiting approval. An entry that has been Rejected, or that has been soft-deleted, SHALL NOT be reachable via this page.

#### Scenario: Anonymous visitor views an approved entry

- **WHEN** an unauthenticated visitor navigates to the detail page for an Approved, Published entry
- **THEN** the page renders the entry's content

#### Scenario: Pending entry is visible with an awaiting-review indication

- **WHEN** any visitor navigates to the detail page for an entry whose approval status is Pending
- **THEN** the page renders the entry's current content along with a clear indication that it is awaiting administrator approval

#### Scenario: Rejected entry is not reachable

- **WHEN** any visitor navigates to the detail page for an entry whose approval status is Rejected
- **THEN** the page behaves as though no such entry exists

#### Scenario: Deleted entry is not reachable

- **WHEN** any visitor navigates to the detail page for an entry that has been soft-deleted
- **THEN** the page behaves as though no such entry exists

### Requirement: Entry Detail Read-Only Display

The entry-detail page SHALL display, by default, the entry's Headword, Definition, and Inflections in a read-only state. The Headword SHALL be presented as the primary/most prominent element on the page. If the entry has no Inflections, the page SHALL clearly indicate that rather than rendering an empty or broken list.

#### Scenario: Entry with inflections displays all of them

- **WHEN** a visitor views the detail page for an entry that has one or more Inflections
- **THEN** all of them are displayed

#### Scenario: Entry with no inflections is shown cleanly

- **WHEN** a visitor views the detail page for an entry that has zero Inflections
- **THEN** the page clearly indicates there are no Inflections rather than showing an empty or broken list

### Requirement: Edit Button Visibility

An Edit button SHALL be shown in the upper-left area of the entry-detail page only when the visitor is authenticated AND the entry's approval status is Approved. It SHALL NOT be shown to an unauthenticated visitor, and SHALL NOT be shown on an entry that is Pending review (editing before an entry has ever been approved is out of scope).

#### Scenario: Anonymous visitor does not see the Edit button

- **WHEN** an unauthenticated visitor views the detail page for an Approved entry
- **THEN** no Edit button is shown

#### Scenario: Authenticated visitor sees the Edit button on an approved entry

- **WHEN** an authenticated visitor (member or administrator) views the detail page for an Approved entry
- **THEN** an Edit button is shown in the upper-left area of the page

#### Scenario: Edit button is hidden on a Pending entry

- **WHEN** an authenticated visitor views the detail page for an entry that is still Pending its first review
- **THEN** no Edit button is shown
