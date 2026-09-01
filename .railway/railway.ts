import {
  bucket,
  defineRailway,
  github,
  postgres,
  preserve,
  redis,
  service,
} from "railway/iac";

// Railway project definition (Infrastructure as Code).
//
//   railway config plan     # review the diff against the linked project
//   railway config apply    # apply it (operator-run - see infra/railway/README.md)
//
// Topology (openspec: deployment/railway):
//   - `app`    public Fastify service that also serves the built SPA
//   - `worker` private BullMQ worker (same repo, same build, different start)
//   - managed Postgres, managed Redis, one S3-compatible bucket
//
// Secret / environment-specific values are declared `preserve()` here and
// set by the operator as Railway variables - never committed.

const REPO = "MikeBrunoCISSP/PlanetosKindleDictionary";
const BRANCH = "main";

// Pins the Railpack builder's Node version to match the repo's `engines.node`.
const NODE_VERSION = "22";

// One build for the whole monorepo; see the root `build:railway` script.
const BUILD_COMMAND = "pnpm run build:railway";

export default defineRailway(() => {
  const db = postgres("postgres");
  const cache = redis("redis");
  // Generated dictionary EPUBs + source zips. Region is operator-adjustable
  // (sjc | iad | ams | sin); iad matches the app's default S3 region.
  const artifacts = bucket("dictionaries", { region: "iad" });

  // Bucket credentials (endpoint / keys / region) are not exposed through the
  // IaC graph - the operator reads them once with `railway bucket credentials`
  // and sets these five vars. Declared preserve() so apply never clears them.
  const s3Vars = {
    S3_ENDPOINT: preserve(),
    S3_BUCKET: preserve(),
    S3_REGION: preserve(),
    S3_ACCESS_KEY_ID: preserve(),
    S3_SECRET_ACCESS_KEY: preserve(),
  };

  const app = service("app", {
    source: github(REPO, { branch: BRANCH }),
    build: {
      builder: "RAILPACK",
      buildCommand: BUILD_COMMAND,
      watchPatterns: [
        "apps/api/**",
        "apps/web/**",
        "packages/**",
        "pnpm-lock.yaml",
        ".railway/**",
      ],
    },
    start: "pnpm --filter @planetos/api start",
    // Applied before the new version receives traffic; a failure fails the
    // deploy and leaves the previous version serving. On the app only - never
    // the worker - so two services never run `migrate deploy` concurrently.
    preDeploy: "pnpm --filter @planetos/api exec prisma migrate deploy",
    healthcheckPath: "/health",
    env: {
      NODE_ENV: "production",
      RAILPACK_NODE_VERSION: NODE_VERSION,
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      // The single public origin. Railway interpolates RAILWAY_PUBLIC_DOMAIN
      // once a domain is attached; for a custom domain the operator overrides
      // this with the custom origin (see the runbook).
      PUBLIC_BASE_URL: "https://${{RAILWAY_PUBLIC_DOMAIN}}",
      ...s3Vars,
      SESSION_SECRET: preserve(),
      // Also encrypts the admin-configured Turnstile secret at rest.
      SETTINGS_ENCRYPTION_KEY: preserve(),
      SMTP_URL: preserve(),
      ADMIN_EMAIL: preserve(),
      ADMIN_PASSWORD: preserve(),
    },
  });

  const worker = service("worker", {
    source: github(REPO, { branch: BRANCH }),
    build: {
      builder: "RAILPACK",
      buildCommand: BUILD_COMMAND,
      watchPatterns: [
        "apps/api/**",
        "packages/kindle/**",
        "packages/shared/**",
        "pnpm-lock.yaml",
        ".railway/**",
      ],
    },
    start: "pnpm --filter @planetos/api start:worker",
    // No domains[] => private service, reachable only on the project network.
    env: {
      NODE_ENV: "production",
      RAILPACK_NODE_VERSION: NODE_VERSION,
      DATABASE_URL: db.env.DATABASE_URL,
      REDIS_URL: cache.env.REDIS_URL,
      ...s3Vars,
      // The build job decrypts the Turnstile secret at rest.
      SETTINGS_ENCRYPTION_KEY: preserve(),
    },
  });

  return {
    name: "planetos-kindle-dictionary",
    resources: [db, cache, artifacts, app, worker],
  };
});
