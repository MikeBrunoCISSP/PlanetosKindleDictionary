# railway Specification

## Purpose

Defines the production deployment topology on Railway and the guarantees it must uphold: one public origin serving both the single-page app and the API with a working browser session, an independently running background worker on the same job queues, database migrations applied before traffic, GitHub-triggered releases with scoped rebuilds, generated artifacts persisted to object storage, and operator secrets supplied externally rather than committed.

## Requirements

### Requirement: Single public origin serves the SPA and the API

The deployed application SHALL expose exactly one public origin that serves both the browser application and the HTTP API. A GET request to a path that is not under `/api` and does not resolve to a built static asset SHALL return the SPA's HTML entry document with a 200 status, so that client-side routes are directly loadable and survive a hard refresh. Requests under `/api` SHALL be handled by the API exactly as before this change, and a request to an unknown `/api` path SHALL return an `application/problem+json` error response, never the HTML entry document. The Bull Board dashboard path and the health-check path SHALL continue to serve their own responses and SHALL NOT be shadowed by the SPA fallback.

#### Scenario: Deep link to a client-side route loads the app

- **WHEN** a browser requests `GET /login` (or any other client-side route) directly against the public origin
- **THEN** the response is 200 with the SPA HTML entry document and the app renders that route

#### Scenario: Unknown API path returns a JSON problem, not HTML

- **WHEN** a client requests `GET /api/does-not-exist`
- **THEN** the response is a 404 `application/problem+json` body and is not the SPA HTML entry document

#### Scenario: Health and dashboard paths are not shadowed

- **WHEN** a client requests the health-check path or a path under the Bull Board dashboard prefix
- **THEN** the response is that endpoint's own response, not the SPA HTML entry document

### Requirement: Production browser sessions persist across requests

A browser using the deployed public origin SHALL be able to authenticate and remain authenticated. After a successful login, the session cookie SHALL be accepted on subsequent same-origin API requests without any cross-origin, CORS, or third-party-cookie relaxation, and the current-user endpoint SHALL return the authenticated user.

#### Scenario: Session survives after login

- **WHEN** a browser logs in through the deployed origin and then requests the current-user endpoint
- **THEN** the request carries the session cookie and the API returns the authenticated user's profile

#### Scenario: Logout clears the session

- **WHEN** an authenticated browser calls the logout endpoint and then requests the current-user endpoint
- **THEN** the API responds as unauthenticated

### Requirement: The background worker runs as its own service

The background worker SHALL run as a deployable unit separate from the public API service, with no public network exposure. On start it SHALL connect to the same Redis instance the API uses, register the recurring dictionary-sweep schedule exactly once per deployment, and process jobs from the same queues the API enqueues to.

#### Scenario: Worker consumes work enqueued by the API

- **WHEN** the API enqueues a dictionary-build job and the worker service is running
- **THEN** the worker picks up and processes that job from the shared queue

#### Scenario: Worker has no public endpoint

- **WHEN** the deployed topology is inspected
- **THEN** the worker service has no public domain and is reachable only on the private network

#### Scenario: Redeploying the worker does not duplicate the recurring sweep

- **WHEN** the worker service is redeployed
- **THEN** exactly one recurring sweep schedule remains registered

### Requirement: Database migrations are applied before the new version serves traffic

Each deployment of the API service SHALL apply all pending database migrations before the new version begins accepting requests. Migrations SHALL run from exactly one service (the API), not the worker. If a migration fails, the deployment SHALL fail and the previously running version SHALL remain live and serving.

#### Scenario: Pending migrations run before cutover

- **WHEN** a deployment includes a new migration
- **THEN** the migration is applied and only then does the new version start receiving traffic

#### Scenario: Failed migration does not take the app offline

- **WHEN** a migration fails during deployment
- **THEN** the deployment is marked failed and the previous version continues to serve requests

### Requirement: Releases are triggered from the GitHub repository

The API and worker services SHALL deploy from the project's GitHub repository. A push to the default branch SHALL build and release both services using deterministic, source-controlled build and start commands. A push that changes only files unrelated to a given service SHALL NOT trigger a rebuild of that service.

#### Scenario: Push to the default branch releases both services

- **WHEN** a commit is pushed to the default branch
- **THEN** the API and worker services each build and release from that commit

#### Scenario: Unrelated change does not rebuild a service

- **WHEN** a push changes only files outside a service's configured watch paths
- **THEN** that service is not rebuilt or redeployed

### Requirement: Generated build artifacts persist in production object storage

Generated dictionary artifacts (the EPUB and the sources archive) SHALL be written to the production object-storage bucket, and public downloads SHALL be served from that bucket via time-limited pre-signed URLs. A deployment SHALL NOT depend on any local or ephemeral filesystem for these artifacts.

#### Scenario: A completed build is downloadable after a redeploy

- **WHEN** a dictionary build completes and the services are later redeployed
- **THEN** the previously generated EPUB is still downloadable via a pre-signed URL from the bucket

### Requirement: Absolute URLs use the public deployment origin

Every absolute URL the application generates for external delivery — in particular email verification and password-reset links — SHALL use the configured public base URL, and that value SHALL equal the application's public deployment origin. No generated link SHALL point at `localhost` or a development host in production.

#### Scenario: Verification email links to the public origin

- **WHEN** a user registers on the deployed application and a verification email is sent
- **THEN** the verification link's origin is the public deployment origin, not a localhost or development URL

### Requirement: Operator secrets are supplied externally and documented

Production configuration values that are secret or environment-specific — the session signing secret, the settings encryption key, the email-delivery credentials (a hosted mail-API key and verified sender address, or an SMTP connection URL), and the initial administrator credentials — SHALL be provided as deployment environment variables and SHALL NOT be committed to the repository. Cloudflare Turnstile keys are configured in-app by an administrator after deployment and the stored secret is encrypted at rest with the settings encryption key, so they are not deployment variables; the runbook SHALL still tell the operator how to complete that in-app step. The repository SHALL document the complete set of variables required for a production deployment, distinguishing those the platform provides automatically from those the operator must set.

#### Scenario: No production secret is committed

- **WHEN** the repository is inspected
- **THEN** it contains no production session secret, encryption key, mail-delivery credential, admin password, or Turnstile secret — only placeholders and documentation

#### Scenario: Required configuration is documented

- **WHEN** an operator follows the deployment runbook
- **THEN** every variable the application needs in production is listed, marked as platform-provided or operator-set, with guidance on acceptable values, plus the post-deploy in-app step for Turnstile and the sender-domain verification step for email
