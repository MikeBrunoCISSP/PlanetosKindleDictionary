## MODIFIED Requirements

### Requirement: Operator secrets are supplied externally and documented

Production configuration values that are secret or environment-specific — the session signing secret, the settings encryption key, the email-delivery credentials (a hosted mail-API key and verified sender address, or an SMTP connection URL), and the initial administrator credentials — SHALL be provided as deployment environment variables and SHALL NOT be committed to the repository. Cloudflare Turnstile keys are configured in-app by an administrator after deployment and the stored secret is encrypted at rest with the settings encryption key, so they are not deployment variables; the runbook SHALL still tell the operator how to complete that in-app step. The repository SHALL document the complete set of variables required for a production deployment, distinguishing those the platform provides automatically from those the operator must set.

#### Scenario: No production secret is committed

- **WHEN** the repository is inspected
- **THEN** it contains no production session secret, encryption key, mail-delivery credential, admin password, or Turnstile secret — only placeholders and documentation

#### Scenario: Required configuration is documented

- **WHEN** an operator follows the deployment runbook
- **THEN** every variable the application needs in production is listed, marked as platform-provided or operator-set, with guidance on acceptable values, plus the post-deploy in-app step for Turnstile and the sender-domain verification step for email
