import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@prisma/client";
import type { Worker } from "bullmq";
import { buildApp, startEmailWorker } from "./helpers.js";
import { Errors } from "../src/lib/errors.js";

// requireTurnstileIfEnabled defaults to a no-op resolve (Turnstile disabled),
// matching the pattern established in tests/auth.test.ts - individual tests
// override it with mockResolvedValueOnce/mockRejectedValueOnce to exercise
// the enabled/failure paths without touching real Cloudflare or the DB-backed
// TurnstileSettings row.
vi.mock("../src/lib/turnstile.js", () => ({
  requireTurnstileIfEnabled: vi.fn().mockResolvedValue(undefined),
}));

import { requireTurnstileIfEnabled as requireTurnstileMock } from "../src/lib/turnstile.js";

const MAILPIT_API = "http://localhost:8025/api/v1";
const EMAIL_PREFIX = "contacttest-";

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

interface MailpitMessage {
  Text: string;
  ReplyTo: { Address: string }[];
}

let app: FastifyInstance;
let prisma: PrismaClient;
let emailWorker: Worker;

function uniqueEmail(): string {
  return `${EMAIL_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

function submitContact(payload: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/api/contact", payload });
}

async function findContactEmail(subject: string, timeoutMs = 10000): Promise<MailpitMessage | undefined> {
  const start = Date.now();
  do {
    const listRes = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`subject:"${subject}"`)}`);
    const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
    if (messages.length > 0) {
      const fullRes = await fetch(`${MAILPIT_API}/message/${messages[0]!.ID}`);
      return (await fullRes.json()) as MailpitMessage;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() - start < timeoutMs);
  return undefined;
}

beforeAll(async () => {
  ({ app, prisma } = await buildApp());
  emailWorker = startEmailWorker(prisma);
});

afterEach(async () => {
  vi.mocked(requireTurnstileMock).mockClear();
  vi.mocked(requireTurnstileMock).mockResolvedValue(undefined);
  await prisma.contactMessage.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
});

afterAll(async () => {
  await emailWorker.close();
  await app.close();
  await prisma.$disconnect();
});

describe("POST /api/contact", () => {
  it("accepts a valid submission, creates a row, and delivers a real email with the subject prefix and reply-to", async () => {
    const email = uniqueEmail();
    const subject = `contact-route-test-${Date.now()}`;

    const res = await submitContact({
      name: "Grace Hopper",
      email,
      subject,
      message: "Any chance you could add a glossary for COBOL terms?",
    });

    expect(res.statusCode).toBe(201);
    const { id } = res.json<{ id: string }>();

    const row = await prisma.contactMessage.findUniqueOrThrow({ where: { id } });
    expect(row.name).toBe("Grace Hopper");
    expect(row.email).toBe(email);

    const expectedSubject = `[eReader Dictionaries] ${subject}`;
    const delivered = await findContactEmail(expectedSubject);
    expect(delivered).toBeDefined();
    expect(delivered!.Text).toContain("Grace Hopper");
    expect(delivered!.Text).toContain("Any chance you could add a glossary for COBOL terms?");
    expect(delivered!.ReplyTo.some((addr) => addr.Address === email)).toBe(true);
  });

  it("rejects a message over 3000 characters", async () => {
    const res = await submitContact({
      name: "Ada",
      email: uniqueEmail(),
      subject: "Too long",
      message: "a".repeat(3001),
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects markup in the name field", async () => {
    const res = await submitContact({
      name: "<script>alert(1)</script>",
      email: uniqueEmail(),
      subject: "Markup test",
      message: "Hello",
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects markup in the subject field", async () => {
    const res = await submitContact({
      name: "Ada",
      email: uniqueEmail(),
      subject: "<b>hi</b>",
      message: "Hello",
    });
    expect(res.statusCode).toBe(400);
  });

  it("rejects an invalid email format", async () => {
    const res = await submitContact({
      name: "Ada",
      email: "not-an-email",
      subject: "Subject",
      message: "Hello",
    });
    expect(res.statusCode).toBe(400);
  });

  it("accepts a valid token when Turnstile is enabled", async () => {
    vi.mocked(requireTurnstileMock).mockResolvedValueOnce(undefined);

    const res = await submitContact({
      name: "Ada",
      email: uniqueEmail(),
      subject: "Turnstile ok",
      message: "Hello",
      turnstileToken: "valid-token",
    });

    expect(res.statusCode).toBe(201);
    expect(requireTurnstileMock).toHaveBeenCalledWith(expect.anything(), "valid-token", expect.any(String));
  });

  it("rejects a missing/invalid token when Turnstile is enabled", async () => {
    vi.mocked(requireTurnstileMock).mockRejectedValueOnce(Errors.TURNSTILE_VERIFICATION_FAILED());

    const res = await submitContact({
      name: "Ada",
      email: uniqueEmail(),
      subject: "Turnstile fail",
      message: "Hello",
    });

    expect(res.statusCode).toBe(400);
  });

  it("bypasses verification entirely when Turnstile is disabled", async () => {
    // The default mock (no-op resolve) is exactly what requireTurnstileIfEnabled
    // does in production when Turnstile is disabled - no token required.
    const res = await submitContact({
      name: "Ada",
      email: uniqueEmail(),
      subject: "Turnstile disabled",
      message: "Hello",
    });

    expect(res.statusCode).toBe(201);
  });
});

describe("POST /api/contact (rate limiting)", () => {
  it("returns 429 with a Retry-After header once the same client exceeds 5 requests/hour", async () => {
    const trustOneHop = (_address: string, hop: number) => hop < 1;
    const built = await buildApp({ trustProxy: trustOneHop, rateLimit: true });
    const edgeIp = "10.0.0.1";
    const clientIp = `203.0.${(Date.now() >> 8) % 256}.${Date.now() % 256}`;

    const send = () =>
      built.app.inject({
        method: "POST",
        url: "/api/contact",
        remoteAddress: edgeIp,
        headers: { "x-forwarded-for": clientIp },
        payload: { name: "Ada", email: uniqueEmail(), subject: "Rate limit test", message: "Hello" },
      });

    for (let i = 0; i < 5; i += 1) {
      const res = await send();
      expect(res.statusCode).toBe(201);
    }
    const limited = await send();
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["retry-after"]).toBeDefined();

    await built.prisma.contactMessage.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
    await built.app.close();
    await built.prisma.$disconnect();
  });
});
