## MODIFIED Requirements

### Requirement: Hourly Change-Detection Sweep

The system SHALL run a scheduled sweep once per hour that, for every dictionary (Series), computes a content hash over that series' current Published+Approved entries and inflections and compares it to the hash recorded for that series' most recent successful build. When the hashes match, the system SHALL NOT enqueue a build for that series. When the hashes differ, the system SHALL enqueue exactly one build for that series. Enqueueing SHALL be idempotent only while a build for that content state is already outstanding (waiting or actively running) — SHALL NOT be permanently suppressed on the basis of a content state having been built at some point in the past. So that multiple content changes occurring within the same hour still result in exactly one build being enqueued for the resulting content state, and so that a content state that was previously built, then changed away from, then changed back to, is rebuilt like any other change once no build for it is currently outstanding.

#### Scenario: Unchanged dictionary is not rebuilt

- **WHEN** the hourly sweep runs for a series whose content has not changed since its last successful build
- **THEN** no build is enqueued for that series

#### Scenario: Changed dictionary is rebuilt

- **WHEN** the hourly sweep runs for a series whose Published+Approved entries or inflections have changed since its last successful build
- **THEN** exactly one build is enqueued for that series

#### Scenario: Multiple changes within one sweep interval still produce one build

- **WHEN** a series' content is edited more than once between two sweep runs, ending in a single final content state
- **THEN** the next sweep enqueues exactly one build reflecting that final state, not one per edit

#### Scenario: A reverted edit does not trigger a rebuild

- **WHEN** a series' content is edited and then edited back to its exact prior state before the next sweep runs
- **THEN** the sweep does not enqueue a build for that series

#### Scenario: A content state that was previously built produces a new build once reverted to

- **WHEN** a series' content is built as state A, later changed and rebuilt as state B, and then changed back to state A after B's build has completed
- **THEN** the next sweep enqueues and completes a new build for state A, and the series' most recently successful build reflects state A again

#### Scenario: A sweep firing while a build is already in progress still enqueues only once

- **WHEN** the sweep runs again for a series while a previously-enqueued build for that series' current content state is still waiting or actively running
- **THEN** no additional build is enqueued for that series until the in-progress build finishes
