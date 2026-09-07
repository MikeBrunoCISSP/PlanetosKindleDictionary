## MODIFIED Requirements

### Requirement: Hourly Change-Detection Sweep

The system SHALL run a scheduled sweep once per hour that checks only dictionaries (Series) that are marked as possibly changed since they were last checked — a durable per-series marker set as part of any write that changes that series' hashed content (its Published+Approved entries and inflections, or the series' own title, description, language, or book fields) — plus any series that has never had a successful build. For each such series, the sweep SHALL compute a content hash over that series' current Published+Approved entries and inflections and compare it to the hash recorded for that series' most recent successful build. When the hashes match, the system SHALL NOT enqueue a build for that series, and SHALL clear that series' changed marker. When the hashes differ, the system SHALL enqueue exactly one build for that series. Enqueueing SHALL be idempotent only while a build for that content state is already outstanding (waiting or actively running) — SHALL NOT be permanently suppressed on the basis of a content state having been built at some point in the past. The sweep SHALL process the series it checks with a bounded level of concurrency rather than unbounded parallel database load, and SHALL record, for each run, how many series were checked and how many builds were enqueued. So that multiple content changes occurring within the same hour still result in exactly one build being enqueued for the resulting content state, and so that a content state that was previously built, then changed away from, then changed back to, is rebuilt like any other change once no build for it is currently outstanding.

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

#### Scenario: An untouched, already-built series is not re-checked

- **WHEN** the hourly sweep runs and a series has no changed marker set and already has a successful build matching its current content
- **THEN** the sweep does not recompute that series' content hash on this run

#### Scenario: A new series with no successful build is always checked

- **WHEN** the hourly sweep runs for a series that has never had a successful build, regardless of whether its changed marker is set
- **THEN** the sweep computes its content hash and enqueues a build if it has any content to build

## ADDED Requirements

### Requirement: Change-Detection Reconciliation

In addition to the hourly change-detection sweep, the system SHALL run a periodic reconciliation that checks every dictionary (Series) regardless of its changed marker, using the same content-hash comparison the hourly sweep uses. This reconciliation SHALL run less frequently than the hourly sweep. Its purpose is to detect and correct any series whose changed marker was not set despite its content having actually changed, so that a defect in marking a series as changed does not permanently prevent that series from ever being rebuilt again. When reconciliation finds a series whose content hash differs from its recorded build hash, it SHALL enqueue a build for it exactly as the hourly sweep would. When it finds such a mismatch on a series whose changed marker was not set, it SHALL record that distinctly, so that a defect in dirty-marking is observable rather than silent.

#### Scenario: Reconciliation catches a change the hourly sweep would have missed

- **WHEN** a series' content has changed but its changed marker was never set, and the periodic reconciliation runs
- **THEN** reconciliation still enqueues a build for that series, and records that the mismatch was found on a series without a changed marker

#### Scenario: Reconciliation leaves an already-consistent series alone

- **WHEN** reconciliation checks a series whose content hash still matches its most recent successful build
- **THEN** no build is enqueued for that series

#### Scenario: Reconciliation runs less often than the hourly sweep

- **WHEN** comparing the reconciliation schedule to the hourly sweep schedule
- **THEN** reconciliation is configured to run at a longer interval than the hourly sweep
