## ADDED Requirements

### Requirement: Readiness reports real dependency health

The health-check path SHALL report whether the API can actually serve requests, not merely that the process is running. It SHALL verify connectivity to PostgreSQL and to Redis, each with a bounded timeout, and SHALL respond with a non-200 status if either is unreachable. Each dependency's individual result SHALL be included in the response so an operator can tell which one failed. To avoid overloading either dependency, a recently-computed result MAY be reused for a short window instead of probing again on every request.

#### Scenario: Both dependencies reachable

- **WHEN** the health-check path is requested and PostgreSQL and Redis are both reachable
- **THEN** the response is 200 and reports both as healthy

#### Scenario: PostgreSQL unreachable

- **WHEN** the health-check path is requested and PostgreSQL cannot be reached
- **THEN** the response is a non-200 status and identifies PostgreSQL as unhealthy

#### Scenario: Redis unreachable

- **WHEN** the health-check path is requested and Redis cannot be reached
- **THEN** the response is a non-200 status and identifies Redis as unhealthy

#### Scenario: A slow dependency does not hang the check

- **WHEN** a dependency does not respond within its bounded timeout
- **THEN** the health check treats it as unreachable rather than waiting indefinitely

### Requirement: The worker fails startup when required dependencies are unusable

Before the background worker registers to process jobs from any queue, it SHALL verify that PostgreSQL, Redis, and the configured object-storage bucket are all reachable, retrying briefly to tolerate a dependency that is still starting up. If a required dependency remains unreachable after those retries, the worker SHALL exit without registering to process any job.

#### Scenario: Worker starts normally when all dependencies are reachable

- **WHEN** the worker starts and PostgreSQL, Redis, and object storage are all reachable
- **THEN** the worker registers and begins processing jobs

#### Scenario: Worker exits when storage is misconfigured

- **WHEN** the worker starts and the configured object-storage bucket cannot be reached after retries
- **THEN** the worker exits without registering to process any job

#### Scenario: Worker exits when a required dependency is unreachable

- **WHEN** the worker starts and PostgreSQL or Redis remains unreachable after retries
- **THEN** the worker exits without registering to process any job

#### Scenario: A brief startup race does not fail the worker

- **WHEN** a required dependency is unreachable at the worker's first attempt but becomes reachable within the retry window
- **THEN** the worker starts normally and registers to process jobs
