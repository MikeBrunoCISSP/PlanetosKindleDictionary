import { afterEach, describe, expect, it, vi } from "vitest";
import { sendViaBrevoApi } from "../../src/lib/mailer.js";
import { config } from "../../src/config.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: { ok: boolean; status: number; body?: string }) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
    ok: response.ok,
    status: response.status,
    text: async () => response.body ?? "",
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("sendViaBrevoApi", () => {
  it("POSTs to the Brevo transactional endpoint with the api-key header and correct body", async () => {
    const fetchMock = stubFetch({ ok: true, status: 201 });

    await sendViaBrevoApi({
      to: "recipient@example.org",
      subject: "Verify your email",
      text: "Follow this link: https://dict.example.com/verify-email?token=abc",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["api-key"]).toBe(config.brevoApiKey);
    expect(headers["content-type"]).toBe("application/json");

    const payload = JSON.parse(init.body as string);
    expect(payload.sender).toEqual({ email: config.mailFromAddress, name: config.mailFromName });
    expect(payload.to).toEqual([{ email: "recipient@example.org" }]);
    expect(payload.subject).toBe("Verify your email");
    expect(payload.textContent).toContain("https://dict.example.com/verify-email?token=abc");
  });

  it("throws when Brevo responds with a non-2xx status", async () => {
    stubFetch({ ok: false, status: 401, body: '{"message":"Key not found"}' });

    await expect(
      sendViaBrevoApi({ to: "x@example.org", subject: "s", text: "t" })
    ).rejects.toThrow(/Brevo API 401/);
  });
});
