# Security conventions

## No raw/unparameterized SQL

Always use the Prisma query builder, or a parameterized `$queryRaw`/`$executeRaw` tagged template, for database access. Never use `$queryRawUnsafe`/`$executeRawUnsafe`, and never build SQL by concatenating or interpolating untrusted input into a query string. This is enforced by an ESLint `no-restricted-syntax` rule in `apps/api/eslint.config.js`.

## No unsanitized HTML rendering

Never render user-supplied or externally-sourced content via `dangerouslySetInnerHTML` (or equivalent) without first passing it through a sanitizer (e.g. DOMPurify) that strips executable content. This is enforced by the `react/no-danger` ESLint rule in `apps/web/eslint.config.js`.
