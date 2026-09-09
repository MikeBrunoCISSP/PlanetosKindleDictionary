import { describe, it, expect, vi, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { createContactMessage, processContactMessage } from "../../src/lib/contactMessages.js";
import { config } from "../../src/config.js";
import * as mailer from "../../src/lib/mailer.js";

const MAILPIT_API = "http://localhost:8025/api/v1";

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

interface MailpitMessage {
  Text: string;
  ReplyTo: { Address: string }[];
}

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.$disconnect();
});

describe("processContactMessage", () => {
  it("does nothing when the row is already SENT", async () => {
    const { id } = await prisma.contactMessage.create({
      data: {
        name: "Ada",
        email: "ada@example.com",
        subject: "already sent",
        message: "body",
        status: "SENT",
      },
      select: { id: true },
    });

    await processContactMessage(prisma, id);

    const row = await prisma.contactMessage.findUniqueOrThrow({ where: { id } });
    expect(row.attempts).toBe(0);
  });

  it("sends the email, marks the row SENT, and it arrives in Mailpit with the reply-to set to the visitor's address", async () => {
    const subject = `contact-test-${Date.now()}`;
    const visitorEmail = "visitor@example.com";
    const { id } = await createContactMessage(prisma, {
      name: "Ada Lovelace",
      email: visitorEmail,
      subject,
      message: "Hello, I have a question about the dictionaries.",
    });

    await processContactMessage(prisma, id);

    const row = await prisma.contactMessage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("SENT");
    expect(row.sentAt).not.toBeNull();

    const expectedSubject = `[eReader Dictionaries] ${subject}`;
    const listRes = await fetch(`${MAILPIT_API}/search?query=${encodeURIComponent(`subject:"${expectedSubject}"`)}`);
    const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
    expect(messages.length).toBeGreaterThan(0);

    const summary = messages[0]!;
    expect(summary.To.some((addr) => addr.Address === config.contactRecipientEmail)).toBe(true);

    const fullRes = await fetch(`${MAILPIT_API}/message/${summary.ID}`);
    const full = (await fullRes.json()) as MailpitMessage;
    expect(full.Text).toContain("Ada Lovelace");
    expect(full.Text).toContain("Hello, I have a question about the dictionaries.");
    expect(full.ReplyTo.some((addr) => addr.Address === visitorEmail)).toBe(true);
  });

  it("on failure, marks FAILED with the error and attempts incremented, then rethrows", async () => {
    const { id } = await prisma.contactMessage.create({
      data: { name: "Bad", email: "bad@example.com", subject: "s", message: "m" },
      select: { id: true },
    });

    const spy = vi.spyOn(mailer, "sendContactMessageEmail").mockRejectedValueOnce(new Error("network down"));

    await expect(processContactMessage(prisma, id)).rejects.toThrow("network down");

    const row = await prisma.contactMessage.findUniqueOrThrow({ where: { id } });
    expect(row.status).toBe("FAILED");
    expect(row.attempts).toBe(1);
    expect(row.error).toBeTruthy();

    spy.mockRestore();
  });
});
