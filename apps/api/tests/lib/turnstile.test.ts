import { afterEach, describe, expect, it, vi } from "vitest";
import { verify, isSecretKeyRecognized } from "../../src/lib/turnstile.js";

function mockFetchOnce(body: unknown, ok = true) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok,
      json: () => Promise.resolve(body),
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verify", () => {
  it("returns success on a successful siteverify response", async () => {
    mockFetchOnce({ success: true });
    const result = await verify("secret", "token");
    expect(result).toEqual({ success: true, errorCodes: [] });
  });

  it("returns failure with error codes on a failed siteverify response", async () => {
    mockFetchOnce({ success: false, "error-codes": ["invalid-input-response"] });
    const result = await verify("secret", "token");
    expect(result).toEqual({ success: false, errorCodes: ["invalid-input-response"] });
  });

  it("returns a network-error result when fetch throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );
    const result = await verify("secret", "token");
    expect(result.success).toBe(false);
    expect(result.errorCodes).toContain("network-error");
  });
});

describe("isSecretKeyRecognized", () => {
  it("returns false when Cloudflare reports the secret as malformed", async () => {
    mockFetchOnce({ success: false, "error-codes": ["invalid-input-secret"] });
    expect(await isSecretKeyRecognized("bad-secret")).toBe(false);
  });

  it("returns true when the secret is recognized but the dummy token is rejected", async () => {
    mockFetchOnce({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await isSecretKeyRecognized("good-secret")).toBe(true);
  });

  it("returns false on a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );
    expect(await isSecretKeyRecognized("good-secret")).toBe(false);
  });
});
