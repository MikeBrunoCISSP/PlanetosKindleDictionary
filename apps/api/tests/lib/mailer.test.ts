import { describe, expect, it } from "vitest";
import { sendPasswordResetEmail } from "../../src/lib/mailer.js";

const MAILPIT_API = "http://localhost:8025/api/v1";

interface MailpitMessageSummary {
  ID: string;
  To: { Address: string }[];
  Subject: string;
}

describe("mailer", () => {
  it("sends a real email that arrives in the local SMTP catcher with the expected recipient and reset URL", async () => {
    const to = `mailer-test-${Date.now()}@example.com`;
    const resetUrl = `http://localhost:5173/reset-password?token=test-token-${Date.now()}`;

    await sendPasswordResetEmail(to, resetUrl);

    const listRes = await fetch(`${MAILPIT_API}/search?query=to:${encodeURIComponent(to)}`);
    const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
    expect(messages.length).toBeGreaterThan(0);

    const summary = messages[0]!;
    expect(summary.To.some((addr) => addr.Address === to)).toBe(true);
    expect(summary.Subject).toContain("Reset your eReader Dictionaries password");

    const fullRes = await fetch(`${MAILPIT_API}/message/${summary.ID}`);
    const full = (await fullRes.json()) as { Text: string };
    expect(full.Text).toContain(resetUrl);
  });
});
