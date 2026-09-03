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
  SMTP_URL: "smtp://mailer:secret@smtp.example.com:587",
  S3_BUCKET: "dictionaries",
  S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
  S3_SECRET_ACCESS_KEY: "abc123secret",
  PORT: "8080",
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
});

describe("validateEnv (worker scope)", () => {
  it("requires only queues + storage + Prisma, not session/email/public-url", () => {
    const issues = validateEnv(
      {
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://user:pass@db.internal:5432/app",
        REDIS_URL: "redis://cache.internal:6379",
        S3_BUCKET: "dictionaries",
        S3_ACCESS_KEY_ID: "AKIAEXAMPLE",
        S3_SECRET_ACCESS_KEY: "abc123secret",
        // no SESSION_SECRET / SETTINGS_ENCRYPTION_KEY / PUBLIC_BASE_URL / SMTP_URL
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
    expect(cfg.port).toBe(3000);
    expect(cfg.buildCron).toBe("0 * * * *");
    expect(cfg.isProduction).toBe(false);
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
