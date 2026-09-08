## MODIFIED Requirements

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
