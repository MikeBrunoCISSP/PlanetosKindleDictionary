import "./load-env.js";
import { z } from "zod";

/**
 * Single source of truth for runtime configuration (finding PROD-002).
 *
 * `process.env` is parsed once, here. Every other module imports `config`
 * instead of reading `process.env` directly.
 *
 * Validation is **strict** unless `NODE_ENV` is explicitly `development`
 * or `test`: in strict mode a missing/empty/malformed required value makes
 * `assertConfigValid()` throw, and the entry points (`index.ts`,
 * `worker.ts`) print the aggregated error and exit non-zero before Fastify
 * / the worker is constructed. In development/test the documented local
 * defaults apply.
 */

/** Secret values that must never be accepted in strict mode. */
export const PLACEHOLDER_SECRETS: ReadonlySet<string> = new Set([
  // Former committed fallback in plugins/session.ts
  "fallback-dev-secret-change-in-production-32c",
  // Sample value shipped in .env.example (used for both secrets there)
  "change-me-to-a-long-random-string-at-least-32-chars",
]);

/** Sample `BREVO_API_KEY` value from .env.example — rejected in strict mode. */
const PLACEHOLDER_BREVO_KEYS: ReadonlySet<string> = new Set(["your-brevo-api-key"]);

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Local defaults — applied only outside strict mode. Mirrors .env.example / docker-compose. */
const DEV_DEFAULTS = {
  DATABASE_URL: "postgresql://planetos:planetos@localhost:5432/planetos",
  REDIS_URL: "redis://localhost:6379",
  SESSION_SECRET: "dev-only-session-secret-not-valid-in-production",
  SETTINGS_ENCRYPTION_KEY: "dev-only-settings-encryption-key-not-valid-in-prod",
  PUBLIC_BASE_URL: "http://localhost:5173",
  SMTP_URL: "smtp://localhost:1025",
  BREVO_API_KEY: "",
  MAIL_FROM_ADDRESS: "no-reply@localhost",
  MAIL_FROM_NAME: "eReader Dictionaries",
  S3_ENDPOINT: "http://localhost:9000",
  S3_BUCKET: "dictionaries",
  S3_REGION: "us-east-1",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  BUILD_CRON: "0 * * * *",
  PORT: "3000",
} as const;

/** Mail transports, in `.env.example` order. */
const MAIL_TRANSPORTS = ["smtp", "brevo-api"] as const;
export type MailTransport = (typeof MAIL_TRANSPORTS)[number];

type RawEnv = Record<string, string | undefined>;

function isStrict(env: RawEnv): boolean {
  const mode = env["NODE_ENV"];
  return mode !== "development" && mode !== "test";
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/** Which process is validating — each requires only what it actually uses. */
export type Scope = "api" | "worker";

/** Variables the background worker actually consumes (queues + storage + Prisma). */
const WORKER_REQUIRED: ReadonlySet<string> = new Set([
  "DATABASE_URL",
  "REDIS_URL",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
]);

function requiredFor(name: string, scope: Scope): boolean {
  return scope === "api" || WORKER_REQUIRED.has(name);
}

/**
 * Returns a list of human-readable problems with `env` for the given process
 * scope (empty = valid). Only enforces rules in strict mode;
 * development/test always returns `[]`. Exported for focused testing.
 */
export function validateEnv(env: RawEnv, scope: Scope = "api"): string[] {
  if (!isStrict(env)) return [];

  const issues: string[] = [];

  const requireSecret = (name: string) => {
    if (!requiredFor(name, scope)) return;
    const v = env[name];
    if (!v) return issues.push(`${name} — required (min 32 characters)`);
    if (v.length < 32) issues.push(`${name} — must be at least 32 characters`);
    if (PLACEHOLDER_SECRETS.has(v)) issues.push(`${name} — must not be a placeholder / example value`);
  };

  const requireUrl = (name: string, schemes: string[], opts: { noLoopback?: boolean } = {}) => {
    if (!requiredFor(name, scope)) return;
    const v = env[name];
    if (!v) return issues.push(`${name} — required (must be a valid ${schemes.join("/")} URL)`);
    const u = parseUrl(v);
    if (!u || !schemes.includes(u.protocol.replace(/:$/, ""))) {
      return issues.push(`${name} — must be a valid ${schemes.join("/")} URL`);
    }
    if (opts.noLoopback && LOOPBACK_HOSTS.has(u.hostname)) {
      issues.push(`${name} — must not point at localhost / a loopback address in production`);
    }
  };

  const requireNonEmpty = (name: string) => {
    if (requiredFor(name, scope) && !env[name]) issues.push(`${name} — required`);
  };

  requireNonEmpty("DATABASE_URL");
  requireUrl("REDIS_URL", ["redis", "rediss"]);
  requireSecret("SESSION_SECRET");
  requireSecret("SETTINGS_ENCRYPTION_KEY");
  requireUrl("PUBLIC_BASE_URL", ["http", "https"], { noLoopback: true });
  requireNonEmpty("S3_BUCKET");
  requireNonEmpty("S3_ACCESS_KEY_ID");
  requireNonEmpty("S3_SECRET_ACCESS_KEY");

  // Mail — api scope only (the worker sends no mail). The required set
  // depends on the selected transport.
  if (requiredFor("MAIL_TRANSPORT", scope)) {
    const transport = env["MAIL_TRANSPORT"];
    if (!transport) {
      issues.push(`MAIL_TRANSPORT — required (one of ${MAIL_TRANSPORTS.map((t) => `"${t}"`).join(", ")})`);
    } else if (!(MAIL_TRANSPORTS as readonly string[]).includes(transport)) {
      issues.push(`MAIL_TRANSPORT — must be one of ${MAIL_TRANSPORTS.map((t) => `"${t}"`).join(", ")}`);
    } else if (transport === "smtp") {
      requireUrl("SMTP_URL", ["smtp", "smtps"]);
    } else {
      const key = env["BREVO_API_KEY"];
      if (!key) issues.push(`BREVO_API_KEY — required when MAIL_TRANSPORT=brevo-api`);
      else if (PLACEHOLDER_BREVO_KEYS.has(key)) {
        issues.push(`BREVO_API_KEY — must not be a placeholder / example value`);
      }
    }

    const from = env["MAIL_FROM_ADDRESS"];
    if (!from) {
      issues.push(`MAIL_FROM_ADDRESS — required`);
    } else {
      const match = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/.exec(from);
      const host = match?.[1]?.toLowerCase();
      const blocked =
        !host ||
        host === "localhost" ||
        host === "127.0.0.1" ||
        /\.(local|test|example)$/.test(host) ||
        ["example.com", "example.org", "example.net"].includes(host);
      if (blocked) {
        issues.push(
          `MAIL_FROM_ADDRESS — must be a valid address on a real public domain (not localhost / .local / .test / .example)`
        );
      }
    }
  }

  // Format checks for optional-but-if-set values, regardless of scope.
  const port = env["PORT"];
  if (port !== undefined && !/^[1-9]\d*$/.test(port)) {
    issues.push(`PORT — must be a positive integer`);
  }
  if (env["S3_ENDPOINT"] !== undefined && parseUrl(env["S3_ENDPOINT"]) === null) {
    issues.push(`S3_ENDPOINT — must be a valid URL when set`);
  }

  return issues;
}

export interface Config {
  readonly nodeEnv: string;
  readonly isProduction: boolean;
  readonly port: number;
  readonly databaseUrl: string;
  readonly redisUrl: string;
  readonly sessionSecret: string;
  readonly settingsEncryptionKey: string;
  readonly publicBaseUrl: string;
  readonly mailTransport: MailTransport;
  readonly smtpUrl: string;
  readonly brevoApiKey: string;
  readonly mailFromAddress: string;
  readonly mailFromName: string;
  readonly s3: {
    readonly endpoint: string | undefined;
    readonly bucket: string;
    readonly region: string;
    readonly accessKeyId: string;
    readonly secretAccessKey: string;
  };
  readonly buildCron: string;
}

/**
 * Builds the typed config from `env`. In strict mode a value is taken
 * verbatim from the environment (or left blank — `assertConfigValid()` is
 * the gate); outside strict mode any unset value falls back to its
 * documented local default. Exported for focused testing.
 */
export function parseEnv(env: RawEnv): Config {
  const strict = isStrict(env);
  // Secrets / URLs / credentials: verbatim in strict mode (blank if unset -
  // `assertConfigValid()` is the gate), local default otherwise.
  const secret = (name: keyof typeof DEV_DEFAULTS): string =>
    env[name] ?? (strict ? "" : DEV_DEFAULTS[name]);
  // Non-sensitive operational settings: always fall back to their documented
  // default (also the production value), in every mode.
  const operational = (name: keyof typeof DEV_DEFAULTS): string =>
    env[name] ?? DEV_DEFAULTS[name];

  const portNum = z.coerce.number().int().positive().catch(3000).parse(operational("PORT"));

  return {
    nodeEnv: env["NODE_ENV"] ?? "",
    isProduction: env["NODE_ENV"] === "production",
    port: portNum,
    databaseUrl: secret("DATABASE_URL"),
    redisUrl: secret("REDIS_URL"),
    sessionSecret: secret("SESSION_SECRET"),
    settingsEncryptionKey: secret("SETTINGS_ENCRYPTION_KEY"),
    publicBaseUrl: secret("PUBLIC_BASE_URL"),
    mailTransport: env["MAIL_TRANSPORT"] === "brevo-api" ? "brevo-api" : "smtp",
    smtpUrl: secret("SMTP_URL"),
    brevoApiKey: secret("BREVO_API_KEY"),
    mailFromAddress: secret("MAIL_FROM_ADDRESS"),
    mailFromName: operational("MAIL_FROM_NAME"),
    s3: {
      endpoint: env["S3_ENDPOINT"] ?? (strict ? undefined : DEV_DEFAULTS.S3_ENDPOINT),
      bucket: secret("S3_BUCKET"),
      region: operational("S3_REGION"),
      accessKeyId: secret("S3_ACCESS_KEY_ID"),
      secretAccessKey: secret("S3_SECRET_ACCESS_KEY"),
    },
    buildCron: operational("BUILD_CRON"),
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

/** Parsed-once, frozen configuration for this process. */
export const config: Config = deepFreeze(parseEnv(process.env));

/**
 * Throws with an aggregated, operator-readable message when the current
 * environment fails strict validation for `scope`. Call this from an entry
 * point before constructing anything, then exit non-zero on catch.
 */
export function assertConfigValid(scope: Scope = "api"): void {
  const issues = validateEnv(process.env, scope);
  if (issues.length === 0) return;
  const nodeEnv = process.env["NODE_ENV"] ?? "(unset)";
  throw new Error(
    `Invalid ${scope} configuration (NODE_ENV=${nodeEnv}). Fix all of the following and restart:\n` +
      issues.map((i) => `  - ${i}`).join("\n") +
      `\n\nFor local development set NODE_ENV=development in your .env.`
  );
}
