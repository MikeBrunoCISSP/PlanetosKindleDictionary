import { describe, expect, it, vi } from "vitest";
import {
  sendPasswordResetEmail,
  sendVerificationEmail,
  sendAccountApprovedEmail,
  sendViaBrevoApi,
} from "../../src/lib/mailer.js";

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

  it("sends a real verification email that arrives with the expected recipient and verify URL", async () => {
    const to = `mailer-verify-test-${Date.now()}@example.com`;
    const verifyUrl = `http://localhost:5173/verify-email?token=test-token-${Date.now()}`;

    await sendVerificationEmail(to, verifyUrl);

    const listRes = await fetch(`${MAILPIT_API}/search?query=to:${encodeURIComponent(to)}`);
    const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
    expect(messages.length).toBeGreaterThan(0);

    const summary = messages[0]!;
    expect(summary.To.some((addr) => addr.Address === to)).toBe(true);
    expect(summary.Subject).toContain("Verify your eReader Dictionaries email address");

    const fullRes = await fetch(`${MAILPIT_API}/message/${summary.ID}`);
    const full = (await fullRes.json()) as { Text: string };
    expect(full.Text).toContain(verifyUrl);
  });

  it("sends a real account-approved email that arrives with the expected recipient", async () => {
    const to = `mailer-approved-test-${Date.now()}@example.com`;

    await sendAccountApprovedEmail(to);

    const listRes = await fetch(`${MAILPIT_API}/search?query=to:${encodeURIComponent(to)}`);
    const { messages } = (await listRes.json()) as { messages: MailpitMessageSummary[] };
    expect(messages.length).toBeGreaterThan(0);

    const summary = messages[0]!;
    expect(summary.To.some((addr) => addr.Address === to)).toBe(true);
    expect(summary.Subject).toContain("Your eReader Dictionaries account has been approved");

    const fullRes = await fetch(`${MAILPIT_API}/message/${summary.ID}`);
    const full = (await fullRes.json()) as { Text: string };
    expect(full.Text).toContain("You can now log in and start creating and editing dictionary entries.");
  });

  it("PROD-006: aborts a stalled Brevo request rather than hanging indefinitely", async () => {
    // AbortSignal.timeout() doesn't respect vitest's fake timers (confirmed
    // empirically - it kept the real 10s production default running under
    // fake timers). sendViaBrevoApi's timeoutMs parameter exists precisely
    // so tests can use a short real timeout instead of waiting one out.
    const fetchMock = vi.fn((_url: unknown, init: { signal: AbortSignal }) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => reject(new Error("The operation was aborted")));
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sendViaBrevoApi({ to: "test@example.com", subject: "Subject", text: "Body" }, 50).then(
      () => "resolved",
      (err: unknown) => (err instanceof Error ? err.message : String(err))
    );

    expect(result).not.toBe("resolved");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });
});
