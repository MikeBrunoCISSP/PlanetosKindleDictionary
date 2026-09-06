## MODIFIED Requirements

### Requirement: Database migrations are applied before the new version serves traffic

Each deployment of the API service and each deployment of the worker service SHALL apply all pending database migrations before that service's new version begins accepting requests or consuming jobs, respectively. Applying migrations SHALL require no manual coordination between the two services' deploys — a deployment of one service SHALL NOT have to wait for a deployment of the other to reach a particular step. If a migration fails during a given service's deployment, that deployment SHALL fail and the previously running version of that service SHALL remain live and serving or consuming.

#### Scenario: Pending migrations run before cutover

- **WHEN** a deployment includes a new migration
- **THEN** the migration is applied and only then does the new version start receiving traffic

#### Scenario: Failed migration does not take the app offline

- **WHEN** a migration fails during deployment
- **THEN** the deployment is marked failed and the previous version continues to serve requests

#### Scenario: Worker deployment also waits on migrations

- **WHEN** the worker service is deployed and pending migrations exist
- **THEN** they are applied before the worker begins consuming jobs from its queues

#### Scenario: A failed migration on one service does not affect the other's availability

- **WHEN** a migration fails during the worker's deployment
- **THEN** the worker deployment fails and the previous worker version keeps consuming jobs, while the API service is unaffected — and the same holds in reverse

## ADDED Requirements

### Requirement: Rollback and backup expectations are documented

The deployment runbook SHALL document how to roll back a bad release and SHALL document the operator's responsibility for database backups before a deployment that includes a schema-changing migration. It SHALL state explicitly that rolling back application code does not reverse an already-applied migration, and SHALL tell the operator to have a recent backup — scheduled or freshly taken — before deploying a migration, especially a destructive one.

#### Scenario: Rollback procedure and its limits are documented

- **WHEN** an operator consults the runbook to roll back a bad deployment
- **THEN** it gives the command to redeploy the previous version and states that this reverts application code only, not an already-applied database migration

#### Scenario: Backup expectations are documented

- **WHEN** an operator is about to deploy a change containing a migration
- **THEN** the runbook tells them how to ensure a recent database backup exists (a recurring schedule or an on-demand backup taken immediately before) and how to restore one

### Requirement: Schema migrations are authored for rolling compatibility

Because the API and worker services deploy independently rather than atomically together, a migration SHALL NOT remove or narrow something that code from the other, not-yet-redeployed service may still read. Such a change SHALL ship only after a prior release has already stopped every code path from depending on the old shape. The repository SHALL document this expand/contract authoring rule for anyone writing a migration.

#### Scenario: A destructive change is split across two releases

- **WHEN** a migration would remove a column, table, or enum value that running code might still read
- **THEN** it is deployed only in a release after a prior release has already stopped all code from depending on it

#### Scenario: An additive migration needs no such split

- **WHEN** a migration only adds new nullable columns, tables, or indexes
- **THEN** it may deploy in the same release as the code that starts using it, with no prior release required
