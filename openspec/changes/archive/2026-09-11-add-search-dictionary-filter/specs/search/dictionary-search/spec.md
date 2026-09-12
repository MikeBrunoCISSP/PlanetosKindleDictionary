## ADDED Requirements

### Requirement: Dictionary Filter Narrows Results by Selection

The search results view SHALL provide a multi-select dictionary filter listing every dictionary. When one or more dictionaries are selected, search results SHALL include only entries belonging to a selected dictionary. When no dictionary is selected, search SHALL behave exactly as it does without any filter — results are drawn from every dictionary. The filter SHALL apply in combination with the existing text query and pagination, not in place of them.

#### Scenario: No dictionary selected searches everything

- **WHEN** a visitor submits a search query with no dictionary selected in the filter
- **THEN** results are drawn from every dictionary, identical to search behavior with no filter present

#### Scenario: Selecting one dictionary narrows results to it

- **WHEN** a visitor selects exactly one dictionary in the filter and submits a search query that matches entries in multiple dictionaries
- **THEN** only matching entries belonging to the selected dictionary appear in the results

#### Scenario: Selecting multiple dictionaries includes matches from any of them

- **WHEN** a visitor selects two dictionaries in the filter and submits a search query that matches entries in both of those dictionaries and a third, unselected dictionary
- **THEN** matching entries from both selected dictionaries appear in the results, and matching entries from the unselected dictionary do not

#### Scenario: Filter selection persists across pagination

- **WHEN** a visitor has one or more dictionaries selected in the filter, is viewing a page of results, and navigates to another page of the same search
- **THEN** the same dictionary filter still applies to the new page of results

### Requirement: Dictionary Filter Selection Is Visible and Adjustable

The current dictionary filter selection SHALL be visible on the search results view without opening the picker, and each selected dictionary SHALL be individually removable from that view.

#### Scenario: Selected dictionaries are shown without opening the picker

- **WHEN** a visitor has one or more dictionaries selected in the filter
- **THEN** the names of the selected dictionaries are visible on the search results view

#### Scenario: A single selected dictionary can be removed directly

- **WHEN** a visitor has multiple dictionaries selected and removes one directly from the visible selection, without opening the picker
- **THEN** that dictionary is no longer part of the filter and the remaining selected dictionaries are unaffected
