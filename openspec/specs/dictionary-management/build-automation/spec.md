# build-automation Specification

## Purpose

Defines the behavioral contract for automatically generating each dictionary's downloadable Kindle EPUB: an hourly change-detection sweep that rebuilds only series whose content has actually changed, the build process itself, and retention of past builds.

## Requirements

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

### Requirement: Build Generates and Stores the Dictionary EPUB

When a build runs for a series, the system SHALL load that series' Published and Approved entries and inflections, generate a Kindle-format EPUB and an accompanying archive of the raw generator inputs, and store both in object storage. On successful completion, the system SHALL record the build as successful, along with the entry count and the content hash it was built from. The dictionary previously available for download SHALL remain available, unmodified, for the entire duration of a build that has not yet succeeded.

#### Scenario: Successful build produces a downloadable EPUB

- **WHEN** a build for a series completes successfully
- **THEN** an EPUB file and a sources archive are stored in object storage, and the build is recorded as successful with its entry count and content hash

#### Scenario: In-progress build does not affect the current download

- **WHEN** a build for a series is running but has not yet completed
- **THEN** the series' previously-built EPUB, if any, remains unchanged and continues to be what the download routes serve

#### Scenario: Only Published and Approved content is included

- **WHEN** a series has entries that are not both Published and Approved (Pending, Rejected, or Deleted)
- **THEN** those entries do not appear in the generated EPUB

### Requirement: A Failed Build Never Removes a Working Dictionary

When a build fails, the system SHALL record the failure (including error detail for diagnostic purposes) and SHALL retry the build automatically a bounded number of times with increasing delay between attempts. If all retries fail, the series' most recently successful build SHALL remain the one served for download, unaffected by the failure. Any object-storage artifact the failed attempt itself managed to upload before failing SHALL eventually be removed, since a failed attempt's Build record never becomes the one referenced for download.

#### Scenario: A failed build is retried automatically

- **WHEN** a build attempt for a series fails
- **THEN** the system automatically retries the build, waiting longer between each successive attempt, up to a bounded number of attempts

#### Scenario: Exhausted retries leave the last successful build intact

- **WHEN** a build for a series fails on every retry attempt
- **THEN** the series' most recently successful build remains available for download exactly as it was before the failed attempts

#### Scenario: A failed attempt's own partial upload is eventually cleaned up

- **WHEN** a build attempt uploads one or both of its EPUB and sources artifacts and then fails before recording a successful build
- **THEN** any artifact that attempt uploaded is eventually removed from object storage, without requiring any further action

### Requirement: Administrator Manual Rebuild

The system SHALL allow an administrator to trigger an immediate build for a specific series, bypassing the change-detection comparison the hourly sweep uses. This action SHALL be restricted to administrators; a non-administrator or unauthenticated request SHALL be rejected.

#### Scenario: Admin triggers an immediate rebuild

- **WHEN** an administrator requests an immediate rebuild for a series, even one whose content has not changed since its last build
- **THEN** a build is enqueued for that series regardless of whether its content hash has changed

#### Scenario: Non-admin cannot trigger a rebuild

- **WHEN** an authenticated non-administrator requests an immediate rebuild for a series
- **THEN** the request is rejected and no build is enqueued

#### Scenario: Unauthenticated request cannot trigger a rebuild

- **WHEN** an unauthenticated request attempts to trigger an immediate rebuild for a series
- **THEN** the request is rejected and no build is enqueued

### Requirement: Build Retention

The system SHALL retain at most the 10 most recent successful builds per series. When a series accumulates more than 10 successful builds, the system SHALL remove the stored EPUB and sources archive of the oldest excess builds, while never removing the most recent successful build. Removing a build's stored files SHALL NOT be required to delete that build's historical record.

#### Scenario: Older builds are pruned beyond the retention limit

- **WHEN** a series has more than 10 successful builds
- **THEN** the stored files for the oldest builds beyond the 10 most recent are removed

#### Scenario: The most recent successful build is never pruned

- **WHEN** retention pruning runs for a series
- **THEN** the files for that series' single most recent successful build are never removed, regardless of how old it is
