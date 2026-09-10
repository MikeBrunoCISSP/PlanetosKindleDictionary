import { describe, it, expect } from "vitest";
import { validateEnv, parseEnv } from "../src/config.js";

// A strict (production-shaped) environment with every required value valid.
const VALID_STRICT_ENV: Record<string, string | undefined> = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://user:pass@db.internal:5432/app",
  REDIS_URL: "redis://cache.internal:6379",
  SESSION_SECRET: "s".repeat(40),
  SETTINGS_ENCRYPTION_KEY: "k".repeat(40),
  PUBLIC_BASE_URL: "https://dict.example.com",
  MAIL_TRANSPORT: "smtp",
  SMTP_URL: "smtp://mailer:secret@smtp.provider.net:587",
  MAIL_FROM_ADDRESS: "notify@mail.dict-app.io",
  CONTACT_RECIPIENT_EMAIL: "owner@gmail.com",
  ADMIN_DIGEST_RECIPIENT_EMAIL: "owner@gmail.com",
  S3_BUCKET: "dictionaries",
  S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
  S3_SECRET_ACCESS_KEY: "abc123secret",
  PORT: "8080",
};

// The same, but delivering through the Brevo HTTPS API.
const VALID_BREVO_ENV: Record<string, string | undefined> = {
  ...VALID_STRICT_ENV,
  MAIL_TRANSPORT: "brevo-api",
  SMTP_URL: undefined,
  BREVO_API_KEY: "xkeysib-realish-key",
};

describe("validateEnv (strict mode)", () => {
  it("accepts a fully-valid strict environment", () => {
    expect(validateEnv(VALID_STRICT_ENV)).toEqual([]);
  });

  it("reports a missing required variable, naming it", () => {
    const { REDIS_URL: _omit, ...env } = VALID_STRICT_ENV;
    const issues = validateEnv(env);
    expect(issues.some((i) => i.startsWith("REDIS_URL"))).toBe(true);
  });

  it("aggregates every problem, not just the first", () => {
    const issues = validateEnv({
      NODE_ENV: "production",
      // DATABASE_URL, REDIS_URL missing; PUBLIC_BASE_URL malformed
      SESSION_SECRET: "s".repeat(40),
      SETTINGS_ENCRYPTION_KEY: "k".repeat(40),
      PUBLIC_BASE_URL: "not-a-url",
      SMTP_URL: "smtp://smtp.example.com",
      S3_BUCKET: "b",
      S3_ACCESS_KEY_ID: "a",
      S3_SECRET_ACCESS_KEY: "s",
    });
    expect(issues.some((i) => i.startsWith("DATABASE_URL"))).toBe(true);
    expect(issues.some((i) => i.startsWith("REDIS_URL"))).toBe(true);
    expect(issues.some((i) => i.startsWith("PUBLIC_BASE_URL"))).toBe(true);
    expect(issues.length).toBeGreaterThanOrEqual(3);
  });

  it("rejects the old committed fallback session secret", () => {
    const issues = validateEnv({
      ...VALID_STRICT_ENV,
      SESSION_SECRET: "fallback-dev-secret-change-in-production-32c",
    });
    expect(issues.some((i) => i.startsWith("SESSION_SECRET"))).toBe(true);
  });

  it("rejects the .env.example placeholder secret", () => {
    const issues = validateEnv({
      ...VALID_STRICT_ENV,
      SETTINGS_ENCRYPTION_KEY: "change-me-to-a-long-random-string-at-least-32-chars",
    });
    expect(issues.some((i) => i.startsWith("SETTINGS_ENCRYPTION_KEY"))).toBe(true);
  });

  it("rejects a secret shorter than 32 characters", () => {
    const issues = validateEnv({ ...VALID_STRICT_ENV, SESSION_SECRET: "tooshort" });
    expect(issues.some((i) => i.startsWith("SESSION_SECRET"))).toBe(true);
  });

  it("rejects a non-URL PUBLIC_BASE_URL and names the variable", () => {
    const issues = validateEnv({ ...VALID_STRICT_ENV, PUBLIC_BASE_URL: "example.com" });
    expect(issues.some((i) => i.startsWith("PUBLIC_BASE_URL"))).toBe(true);
  });

  it("rejects a localhost PUBLIC_BASE_URL in production", () => {
    const issues = validateEnv({ ...VALID_STRICT_ENV, PUBLIC_BASE_URL: "http://localhost:5173" });
    expect(issues.some((i) => i.startsWith("PUBLIC_BASE_URL"))).toBe(true);
  });

  it("rejects empty storage credentials", () => {
    const issues = validateEnv({ ...VALID_STRICT_ENV, S3_ACCESS_KEY_ID: "" });
    expect(issues.some((i) => i.startsWith("S3_ACCESS_KEY_ID"))).toBe(true);
  });

  it("treats an unset NODE_ENV as strict", () => {
    const { NODE_ENV: _omit, REDIS_URL: _omit2, ...env } = VALID_STRICT_ENV;
    expect(validateEnv(env).length).toBeGreaterThan(0);
  });

  it("rejects a non-numeric TRUST_PROXY_HOPS regardless of NODE_ENV", () => {
    expect(
      validateEnv({ ...VALID_STRICT_ENV, TRUST_PROXY_HOPS: "one" }).some((i) =>
        i.startsWith("TRUST_PROXY_HOPS")
      )
    ).toBe(true);
    expect(
      validateEnv({ NODE_ENV: "development", TRUST_PROXY_HOPS: "one" }).some((i) =>
        i.startsWith("TRUST_PROXY_HOPS")
      )
    ).toBe(false); // format checks only run in strict mode, matching PORT/S3_ENDPOINT
  });

  it("rejects a negative TRUST_PROXY_HOPS", () => {
    const issues = validateEnv({ ...VALID_STRICT_ENV, TRUST_PROXY_HOPS: "-1" });
    expect(issues.some((i) => i.startsWith("TRUST_PROXY_HOPS"))).toBe(true);
  });

  it("accepts an explicit TRUST_PROXY_HOPS of 0", () => {
    const issues = validateEnv({ ...VALID_STRICT_ENV, TRUST_PROXY_HOPS: "0" });
    expect(issues.some((i) => i.startsWith("TRUST_PROXY_HOPS"))).toBe(false);
  });

  it("rejects an S3_FORCE_PATH_STYLE that isn't exactly \"true\" or \"false\"", () => {
    expect(
      validateEnv({ ...VALID_STRICT_ENV, S3_FORCE_PATH_STYLE: "yes" }).some((i) =>
        i.startsWith("S3_FORCE_PATH_STYLE")
      )
    ).toBe(true);
  });

  it("accepts S3_FORCE_PATH_STYLE=false", () => {
    const issues = validateEnv({ ...VALID_STRICT_ENV, S3_FORCE_PATH_STYLE: "false" });
    expect(issues.some((i) => i.startsWith("S3_FORCE_PATH_STYLE"))).toBe(false);
  });
});

describe("validateEnv (mail transport)", () => {
  it("accepts a fully-valid Brevo-API environment", () => {
    expect(validateEnv(VALID_BREVO_ENV)).toEqual([]);
  });

  it("requires MAIL_TRANSPORT in strict mode", () => {
    const { MAIL_TRANSPORT: _omit, ...env } = VALID_STRICT_ENV;
    expect(validateEnv(env).some((i) => i.startsWith("MAIL_TRANSPORT"))).toBe(true);
  });

  it("rejects an unknown MAIL_TRANSPORT value", () => {
    const issues = validateEnv({ ...VALID_STRICT_ENV, MAIL_TRANSPORT: "sendgrid" });
    expect(issues.some((i) => i.startsWith("MAIL_TRANSPORT"))).toBe(true);
  });

  it("requires SMTP_URL only for the smtp transport", () => {
    const { SMTP_URL: _omit, ...smtpEnv } = VALID_STRICT_ENV;
    expect(validateEnv(smtpEnv).some((i) => i.startsWith("SMTP_URL"))).toBe(true);

    const { SMTP_URL: _omit2, ...brevoEnv } = VALID_BREVO_ENV;
    expect(validateEnv(brevoEnv).some((i) => i.startsWith("SMTP_URL"))).toBe(false);
  });

  it("requires BREVO_API_KEY only for the brevo-api transport", () => {
    const { BREVO_API_KEY: _omit, ...env } = VALID_BREVO_ENV;
    expect(validateEnv(env).some((i) => i.startsWith("BREVO_API_KEY"))).toBe(true);
  });

  it("rejects the .env.example placeholder Brevo key", () => {
    const issues = validateEnv({ ...VALID_BREVO_ENV, BREVO_API_KEY: "your-brevo-api-key" });
    expect(issues.some((i) => i.startsWith("BREVO_API_KEY"))).toBe(true);
  });

  it("requires MAIL_FROM_ADDRESS and rejects a .local domain", () => {
    const { MAIL_FROM_ADDRESS: _omit, ...env } = VALID_STRICT_ENV;
    expect(validateEnv(env).some((i) => i.startsWith("MAIL_FROM_ADDRESS"))).toBe(true);

    const issues = validateEnv({ ...VALID_STRICT_ENV, MAIL_FROM_ADDRESS: "no-reply@planetos.local" });
    expect(issues.some((i) => i.startsWith("MAIL_FROM_ADDRESS"))).toBe(true);
  });

  it("rejects an example.com sender but not an example.com public base URL", () => {
    const issues = validateEnv({ ...VALID_STRICT_ENV, MAIL_FROM_ADDRESS: "hi@example.com" });
    expect(issues.some((i) => i.startsWith("MAIL_FROM_ADDRESS"))).toBe(true);
    // PUBLIC_BASE_URL is https://dict.example.com and stays valid
    expect(issues.some((i) => i.startsWith("PUBLIC_BASE_URL"))).toBe(false);
  });

  it("requires CONTACT_RECIPIENT_EMAIL and rejects a malformed address", () => {
    const { CONTACT_RECIPIENT_EMAIL: _omit, ...env } = VALID_STRICT_ENV;
    expect(validateEnv(env).some((i) => i.startsWith("CONTACT_RECIPIENT_EMAIL"))).toBe(true);

    const issues = validateEnv({ ...VALID_STRICT_ENV, CONTACT_RECIPIENT_EMAIL: "not-an-email" });
    expect(issues.some((i) => i.startsWith("CONTACT_RECIPIENT_EMAIL"))).toBe(true);
  });

  it("accepts an ordinary personal domain for CONTACT_RECIPIENT_EMAIL that MAIL_FROM_ADDRESS's blocklist would reject", () => {
    // Proves the blocklist (localhost/.local/.test/.example/example.com) was
    // deliberately not reused here - this is a destination inbox, not a
    // verified sending identity.
    const issues = validateEnv({ ...VALID_STRICT_ENV, CONTACT_RECIPIENT_EMAIL: "me@example.com" });
    expect(issues.some((i) => i.startsWith("CONTACT_RECIPIENT_EMAIL"))).toBe(false);
  });

  it("parseEnv exposes the transport and sender", () => {
    const cfg = parseEnv(VALID_BREVO_ENV);
    expect(cfg.mailTransport).toBe("brevo-api");
    expect(cfg.brevoApiKey).toBe("xkeysib-realish-key");
    expect(cfg.mailFromAddress).toBe("notify@mail.dict-app.io");
    expect(cfg.mailFromName).toBe("eReader Dictionaries");
    expect(parseEnv({ NODE_ENV: "development" }).mailTransport).toBe("smtp");
  });

  it("requires ADMIN_DIGEST_RECIPIENT_EMAIL and rejects a malformed address", () => {
    const { ADMIN_DIGEST_RECIPIENT_EMAIL: _omit, ...env } = VALID_STRICT_ENV;
    expect(validateEnv(env).some((i) => i.startsWith("ADMIN_DIGEST_RECIPIENT_EMAIL"))).toBe(true);

    const issues = validateEnv({ ...VALID_STRICT_ENV, ADMIN_DIGEST_RECIPIENT_EMAIL: "not-an-email" });
    expect(issues.some((i) => i.startsWith("ADMIN_DIGEST_RECIPIENT_EMAIL"))).toBe(true);
  });

  it("accepts an ordinary personal domain for ADMIN_DIGEST_RECIPIENT_EMAIL that MAIL_FROM_ADDRESS's blocklist would reject", () => {
    // Same reasoning as CONTACT_RECIPIENT_EMAIL - this is a destination
    // inbox, not a verified sending identity.
    const issues = validateEnv({ ...VALID_STRICT_ENV, ADMIN_DIGEST_RECIPIENT_EMAIL: "me@example.com" });
    expect(issues.some((i) => i.startsWith("ADMIN_DIGEST_RECIPIENT_EMAIL"))).toBe(false);
  });

  it("never flags ADMIN_DIGEST_CRON - it has no strict-mode requirement, same as BUILD_CRON", () => {
    const { ADMIN_DIGEST_CRON: _omit, ...env } = VALID_STRICT_ENV as Record<string, string | undefined>;
    expect(validateEnv(env).some((i) => i.startsWith("ADMIN_DIGEST_CRON"))).toBe(false);
  });

  it("parseEnv defaults ADMIN_DIGEST_CRON outside strict mode", () => {
    expect(parseEnv({ NODE_ENV: "development" }).adminDigestCron).toBe("0 13 * * *");
    expect(parseEnv({ NODE_ENV: "test" }).adminDigestCron).toBe("0 13 * * *");
    expect(parseEnv({ NODE_ENV: "production", ADMIN_DIGEST_CRON: "0 9 * * *" }).adminDigestCron).toBe("0 9 * * *");
  });
});

describe("validateEnv (worker scope)", () => {
  it("requires queues + storage + Prisma + mail, not session/public-url", () => {
    const issues = validateEnv(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.internal:5432/app",
        REDIS_URL: "redis://cache.internal:6379",
        S3_BUCKET: "dictionaries",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "abc123secret",
        MAIL_TRANSPORT: "brevo-api",
        BREVO_API_KEY: "xkeysib-realish-key",
        MAIL_FROM_ADDRESS: "notify@mail.dict-app.io",
        CONTACT_RECIPIENT_EMAIL: "owner@gmail.com",
        ADMIN_DIGEST_RECIPIENT_EMAIL: "owner@gmail.com",
        // no SESSION_SECRET / SETTINGS_ENCRYPTION_KEY / PUBLIC_BASE_URL
      },
      "worker"
    );
    expect(issues).toEqual([]);
  });

  it("still fails when a worker-required value is missing", () => {
    const issues = validateEnv({ NODE_ENV: "production" }, "worker");
    expect(issues.some((i) => i.startsWith("REDIS_URL"))).toBe(true);
    expect(issues.some((i) => i.startsWith("S3_BUCKET"))).toBe(true);
    expect(issues.some((i) => i.startsWith("SESSION_SECRET"))).toBe(false);
  });

  it("PROD (live bug): the worker requires MAIL_TRANSPORT, since it's the one that sends email", () => {
    const issues = validateEnv(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.internal:5432/app",
        REDIS_URL: "redis://cache.internal:6379",
        S3_BUCKET: "dictionaries",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "abc123secret",
        // no mail config at all - this is the exact shape that silently
        // deployed and broke email sending in production.
      },
      "worker"
    );
    expect(issues.some((i) => i.startsWith("MAIL_TRANSPORT"))).toBe(true);
  });

  it("also requires BREVO_API_KEY and MAIL_FROM_ADDRESS for the worker once a transport is chosen", () => {
    const issues = validateEnv(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.internal:5432/app",
        REDIS_URL: "redis://cache.internal:6379",
        S3_BUCKET: "dictionaries",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "abc123secret",
        MAIL_TRANSPORT: "brevo-api",
        // no BREVO_API_KEY / MAIL_FROM_ADDRESS
      },
      "worker"
    );
    expect(issues.some((i) => i.startsWith("BREVO_API_KEY"))).toBe(true);
    expect(issues.some((i) => i.startsWith("MAIL_FROM_ADDRESS"))).toBe(true);
  });

  it("also requires CONTACT_RECIPIENT_EMAIL for the worker, since it's the one that sends the contact email", () => {
    const issues = validateEnv(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.internal:5432/app",
        REDIS_URL: "redis://cache.internal:6379",
        S3_BUCKET: "dictionaries",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "abc123secret",
        MAIL_TRANSPORT: "brevo-api",
        BREVO_API_KEY: "xkeysib-realish-key",
        MAIL_FROM_ADDRESS: "notify@mail.dict-app.io",
        // no CONTACT_RECIPIENT_EMAIL
      },
      "worker"
    );
    expect(issues.some((i) => i.startsWith("CONTACT_RECIPIENT_EMAIL"))).toBe(true);
  });

  it("also requires ADMIN_DIGEST_RECIPIENT_EMAIL for the worker, since it's the one that sends the digest email", () => {
    const issues = validateEnv(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.internal:5432/app",
        REDIS_URL: "redis://cache.internal:6379",
        S3_BUCKET: "dictionaries",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "abc123secret",
        MAIL_TRANSPORT: "brevo-api",
        BREVO_API_KEY: "xkeysib-realish-key",
        MAIL_FROM_ADDRESS: "notify@mail.dict-app.io",
        CONTACT_RECIPIENT_EMAIL: "owner@gmail.com",
        // no ADMIN_DIGEST_RECIPIENT_EMAIL
      },
      "worker"
    );
    expect(issues.some((i) => i.startsWith("ADMIN_DIGEST_RECIPIENT_EMAIL"))).toBe(true);
  });
});

describe("validateEnv (development / test)", () => {
  it("returns no issues for development regardless of missing values", () => {
    expect(validateEnv({ NODE_ENV: "development" })).toEqual([]);
  });

  it("returns no issues for test", () => {
    expect(validateEnv({ NODE_ENV: "test" })).toEqual([]);
  });
});

describe("parseEnv", () => {
  it("fills documented local defaults in development when values are unset", () => {
    const cfg = parseEnv({ NODE_ENV: "development" });
    expect(cfg.redisUrl).toBe("redis://localhost:6379");
    expect(cfg.publicBaseUrl).toBe("http://localhost:5173");
    expect(cfg.smtpUrl).toBe("smtp://localhost:1025");
    expect(cfg.s3.bucket).toBe("dictionaries");
    expect(cfg.s3.endpoint).toBe("http://localhost:9000");
    expect(cfg.s3.forcePathStyle).toBe(true);
    expect(cfg.port).toBe(3000);
    expect(cfg.buildCron).toBe("0 * * * *");
    expect(cfg.isProduction).toBe(false);
  });

  it("defaults s3.forcePathStyle to true, and honors an explicit \"false\"", () => {
    expect(parseEnv({ NODE_ENV: "development" }).s3.forcePathStyle).toBe(true);
    expect(parseEnv({ ...VALID_STRICT_ENV, S3_FORCE_PATH_STYLE: "false" }).s3.forcePathStyle).toBe(false);
    expect(parseEnv({ ...VALID_STRICT_ENV, S3_FORCE_PATH_STYLE: "true" }).s3.forcePathStyle).toBe(true);
  });

  it("takes values verbatim in strict mode and does not substitute defaults", () => {
    const cfg = parseEnv(VALID_STRICT_ENV);
    expect(cfg.redisUrl).toBe("redis://cache.internal:6379");
    expect(cfg.isProduction).toBe(true);
    expect(cfg.port).toBe(8080);
    // no S3_ENDPOINT set → undefined in strict mode (real AWS), not the MinIO default
    expect(cfg.s3.endpoint).toBeUndefined();
  });
});
