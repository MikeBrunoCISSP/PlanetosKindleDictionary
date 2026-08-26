import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import { buildApp, cleanUsers, resetTurnstileSettings } from "./helpers.js";

vi.mock("../src/lib/turnstile.js", () => ({
  isSecretKeyRecognized: vi.fn(),
  verify: vi.fn(),
}));

import { isSecretKeyRecognized } from "../src/lib/turnstile.js";

const ADMIN_EMAIL = "turnstileadmin@example.com";
const ADMIN_USERNAME = "TurnstileAdminUser";
const MEMBER_EMAIL = "turnstilemember@example.com";
const MEMBER_USERNAME = "TurnstileMemberUser";
const PASSWORD = "SecureP4ss!";
const REASON = "Testing Turnstile settings.";

let app: FastifyInstance;
let prisma: PrismaClient;

async function registerAndGetCookie(email: string, username: string): Promise<string> {
  const res = await app.inject({
    method: "POST",
    url: "/api/auth/register",
    payload: { email, username, reasonForJoining: REASON, password: PASSWORD },
  });
  const cookie = res.headers["set-cookie"] as string | string[];
  return ((Array.isArray(cookie) ? cookie[0] : cookie) ?? "").split(";")[0] ?? "";
}

async function setupAdmin(): Promise<string> {
  const cookie = await registerAndGetCookie(ADMIN_EMAIL, ADMIN_USERNAME);
  await prisma.user.update({
    where: { email: ADMIN_EMAIL },
    data: { role: "ADMIN", approvalStatus: "APPROVED" },
  });
  return cookie;
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL]);
  await resetTurnstileSettings(prisma);
});

afterEach(async () => {
  await cleanUsers(prisma, [ADMIN_EMAIL, MEMBER_EMAIL]);
  await resetTurnstileSettings(prisma);
  vi.clearAllMocks();
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

describe("GET /api/turnstile/config", () => {
  it("returns disabled/null when no settings row exists", async () => {
    const res = await app.inject({ method: "GET", url: "/api/turnstile/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: false, siteKey: null });
  });

  it("returns the site key when enabled", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
      payload: { enabled: true, siteKey: "1x00000000000000000000AA", secretKey: "1x0000000000000000000000000000000AA" },
    });

    const res = await app.inject({ method: "GET", url: "/api/turnstile/config" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: true, siteKey: "1x00000000000000000000AA" });
  });

  it("returns siteKey: null when disabled, even if a site key is stored", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
      payload: { enabled: false, siteKey: "1x00000000000000000000AA" },
    });

    const res = await app.inject({ method: "GET", url: "/api/turnstile/config" });
    expect(res.json()).toEqual({ enabled: false, siteKey: null });
  });
});

describe("GET /api/admin/turnstile", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "GET", url: "/api/admin/turnstile" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/turnstile",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns default values when no settings row exists", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ enabled: false, siteKey: null, secretConfigured: false, updatedAt: null });
  });

  it("never includes a secret value in the response", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
      payload: { enabled: true, siteKey: "sitekey", secretKey: "topsecretvalue" },
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
    });
    const text = JSON.stringify(res.json());
    expect(text).not.toContain("topsecretvalue");
    expect(res.json<{ secretConfigured: boolean }>().secretConfigured).toBe(true);
  });
});

describe("PATCH /api/admin/turnstile", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      payload: { enabled: false, siteKey: null },
    });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      headers: { cookie: memberCookie },
      payload: { enabled: false, siteKey: null },
    });
    expect(res.statusCode).toBe(403);
  });

  it("updates enabled and siteKey, and sets secretConfigured when a secretKey is submitted", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
      payload: { enabled: true, siteKey: "sitekey-1", secretKey: "secret-1" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ enabled: boolean; siteKey: string | null; secretConfigured: boolean }>();
    expect(body.enabled).toBe(true);
    expect(body.siteKey).toBe("sitekey-1");
    expect(body.secretConfigured).toBe(true);
  });

  it("leaves the stored secret unchanged when secretKey is blank/omitted", async () => {
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
      payload: { enabled: true, siteKey: "sitekey-1", secretKey: "secret-1" },
    });
    const before = await prisma.turnstileSettings.findUniqueOrThrow({ where: { id: "singleton" } });

    const res = await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
      payload: { enabled: true, siteKey: "sitekey-2" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{ siteKey: string | null; secretConfigured: boolean }>();
    expect(body.siteKey).toBe("sitekey-2");
    expect(body.secretConfigured).toBe(true);

    const after = await prisma.turnstileSettings.findUniqueOrThrow({ where: { id: "singleton" } });
    expect(after.secretKeyEncrypted).toBe(before.secretKeyEncrypted);
  });
});

describe("POST /api/admin/turnstile/test", () => {
  it("returns 401 for unauthenticated request", async () => {
    const res = await app.inject({ method: "POST", url: "/api/admin/turnstile/test" });
    expect(res.statusCode).toBe(401);
  });

  it("returns 403 for authenticated non-admin", async () => {
    const memberCookie = await registerAndGetCookie(MEMBER_EMAIL, MEMBER_USERNAME);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/turnstile/test",
      headers: { cookie: memberCookie },
    });
    expect(res.statusCode).toBe(403);
  });

  it("returns success: false when no secret is configured", async () => {
    const adminCookie = await setupAdmin();
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/turnstile/test",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: false });
  });

  it("returns success: true when the configured secret is recognized", async () => {
    vi.mocked(isSecretKeyRecognized).mockResolvedValue(true);
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
      payload: { enabled: true, siteKey: "sitekey", secretKey: "good-secret" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/turnstile/test",
      headers: { cookie: adminCookie },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ success: true });
    const text = JSON.stringify(res.json());
    expect(text).not.toContain("good-secret");
  });

  it("returns success: false when the configured secret is not recognized", async () => {
    vi.mocked(isSecretKeyRecognized).mockResolvedValue(false);
    const adminCookie = await setupAdmin();
    await app.inject({
      method: "PATCH",
      url: "/api/admin/turnstile",
      headers: { cookie: adminCookie },
      payload: { enabled: true, siteKey: "sitekey", secretKey: "bad-secret" },
    });

    const res = await app.inject({
      method: "POST",
      url: "/api/admin/turnstile/test",
      headers: { cookie: adminCookie },
    });
    expect(res.json()).toEqual({ success: false });
  });
});
