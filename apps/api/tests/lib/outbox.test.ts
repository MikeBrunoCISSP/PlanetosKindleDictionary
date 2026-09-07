import { describe, it, expect, vi, afterEach } from "vitest";
import type { PrismaClient } from "@prisma/client";

vi.mock("../../src/lib/mailer.js", () => ({
  sendVerificationEmail: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
}));

import { sendVerificationEmail, sendPasswordResetEmail } from "../../src/lib/mailer.js";
import { processEmailOutbox } from "../../src/lib/outbox.js";
import { encrypt } from "../../src/lib/crypto.js";

function fakePrisma(row: {
  status: string;
  type: string;
  recipientEmail: string;
  payloadEncrypted: string | null;
}) {
  const update = vi.fn().mockResolvedValue({});
  const findUniqueOrThrow = vi.fn().mockResolvedValue(row);
  return { prisma: { emailOutbox: { findUniqueOrThrow, update } } as unknown as PrismaClient, update, findUniqueOrThrow };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("processEmailOutbox", () => {
  it("does nothing and calls no mailer function when the row is already SENT", async () => {
    const { prisma, update } = fakePrisma({
      status: "SENT",
      type: "VERIFICATION",
      recipientEmail: "a@example.com",
      payloadEncrypted: null,
    });

    await processEmailOutbox(prisma, "outbox-1");

    expect(sendVerificationEmail).not.toHaveBeenCalled();
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("sends a VERIFICATION email, then marks SENT and clears the payload", async () => {
    const url = "https://example.com/verify-email?token=abc123";
    const { prisma, update } = fakePrisma({
      status: "PENDING",
      type: "VERIFICATION",
      recipientEmail: "a@example.com",
      payloadEncrypted: encrypt(url),
    });
    vi.mocked(sendVerificationEmail).mockResolvedValue(undefined);

    await processEmailOutbox(prisma, "outbox-1");

    expect(sendVerificationEmail).toHaveBeenCalledWith("a@example.com", url);
    expect(update).toHaveBeenCalledWith({
      where: { id: "outbox-1" },
      data: { status: "SENT", sentAt: expect.any(Date), payloadEncrypted: null },
    });
  });

  it("sends a PASSWORD_RESET email via the correct mailer function", async () => {
    const url = "https://example.com/reset-password?token=xyz789";
    const { prisma } = fakePrisma({
      status: "PENDING",
      type: "PASSWORD_RESET",
      recipientEmail: "b@example.com",
      payloadEncrypted: encrypt(url),
    });
    vi.mocked(sendPasswordResetEmail).mockResolvedValue(undefined);

    await processEmailOutbox(prisma, "outbox-2");

    expect(sendPasswordResetEmail).toHaveBeenCalledWith("b@example.com", url);
    expect(sendVerificationEmail).not.toHaveBeenCalled();
  });

  it("on failure, marks FAILED with the error and attempts incremented, then rethrows", async () => {
    const url = "https://example.com/verify-email?token=abc123";
    const { prisma, update } = fakePrisma({
      status: "PENDING",
      type: "VERIFICATION",
      recipientEmail: "a@example.com",
      payloadEncrypted: encrypt(url),
    });
    vi.mocked(sendVerificationEmail).mockRejectedValue(new Error("Brevo API 503: down"));

    await expect(processEmailOutbox(prisma, "outbox-1")).rejects.toThrow("Brevo API 503: down");

    expect(update).toHaveBeenCalledWith({
      where: { id: "outbox-1" },
      data: { status: "FAILED", attempts: { increment: 1 }, error: expect.stringContaining("Brevo API 503") },
    });
  });
});
