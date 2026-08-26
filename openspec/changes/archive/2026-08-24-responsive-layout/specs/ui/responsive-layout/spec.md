## Purpose

Defines the behavioral contract for the web application's responsive layout: the application SHALL display correctly and remain fully usable across desktop, tablet, and phone viewports without horizontal page scrolling.

## ADDED Requirements

### Requirement: No Horizontal Page Overflow

The application SHALL never require horizontal scrolling of the top-level page. Every authenticated route SHALL fit within the viewport width at all sizes from 360 px upward.

#### Scenario: Page renders within 360 px viewport

- **WHEN** a user views any page of the application at 360 px viewport width
- **THEN** the page content fits within the viewport and no horizontal scrollbar appears on the page

#### Scenario: Page renders within 1920 px viewport

- **WHEN** a user views any page of the application at 1920 px viewport width
- **THEN** the page content is centered and does not stretch edge-to-edge

### Requirement: Contained Table Scrolling

Where a data table's content exceeds the available width, the table SHALL scroll horizontally within its own container. The overall page SHALL NOT scroll horizontally because of a table.

#### Scenario: Wide table scrolls within its container on mobile

- **WHEN** a user views a page containing a table at a narrow viewport where the table columns exceed the available width
- **THEN** a horizontal scrollbar appears on the table's container and the page itself does not scroll horizontally

### Requirement: Fixed-Height Scrollable Text Areas

Multi-line text input fields SHALL have a bounded initial height and SHALL NOT grow vertically without limit as content is entered. When content exceeds the visible area, the field SHALL display its own vertical scrollbar.

#### Scenario: Text area does not grow beyond its initial height

- **WHEN** a user types text that exceeds the visible area of a multi-line field
- **THEN** the field height remains fixed and a vertical scrollbar appears inside the field

#### Scenario: Text area does not expand horizontally

- **WHEN** a user enters or pastes long unbroken text into a multi-line field
- **THEN** the text wraps within the field and the field does not grow wider than its container

### Requirement: Responsive Page Padding

Content pages SHALL use padding that is appropriate for the viewport size: narrower on mobile to maximize usable content width, wider on larger screens for visual breathing room.

#### Scenario: Narrow viewport receives reduced page padding

- **WHEN** a user views a content page (Admin, Create Dictionary, Edit Dictionary) at a phone-sized viewport
- **THEN** the page uses 16 px of horizontal and vertical padding, leaving adequate content width

#### Scenario: Wide viewport receives full page padding

- **WHEN** a user views a content page at a viewport width of 640 px or wider
- **THEN** the page uses 32 px of horizontal and vertical padding
