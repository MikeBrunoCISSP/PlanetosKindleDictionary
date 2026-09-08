## ADDED Requirements

### Requirement: The API shuts down gracefully on termination

On receiving `SIGTERM` or `SIGINT`, the API service SHALL stop accepting new connections and allow requests already in flight to complete before the process exits. It SHALL then close every connection it owns to the database, the cache, and the job queues. Each such connection SHALL be closed exactly once regardless of how many termination signals the process receives, and the whole shutdown SHALL complete within a bounded period rather than waiting indefinitely for a dependency to close.

#### Scenario: A termination signal stops new connections and drains in-flight requests

- **WHEN** the API service receives `SIGTERM` or `SIGINT`
- **THEN** it stops accepting new connections and any request already in flight at that moment completes before the process exits

#### Scenario: Shutdown closes every owned connection exactly once

- **WHEN** the API service shuts down
- **THEN** its database connection, its Redis connections, and its job-queue connections are each closed exactly once

#### Scenario: A repeated termination signal does not restart shutdown

- **WHEN** the API service receives a second termination signal while it is already shutting down
- **THEN** it does not attempt to close its connections a second time

#### Scenario: Shutdown completes within a bounded period

- **WHEN** the API service shuts down
- **THEN** the process exits within a bounded time instead of waiting indefinitely for a dependency to close
