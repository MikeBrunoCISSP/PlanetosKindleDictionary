import { describe, expect, it } from "vitest";
import {
  passwordSchema,
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  resendVerificationSchema,
} from "../auth.js";

describe("passwordSchema", () => {
  it("accepts a valid password", () => {
    const result = passwordSchema.safeParse("Abc12345");
    expect(result.success).toBe(true);
  });

  it("rejects passwords shorter than 8 characters", () => {
    const result = passwordSchema.safeParse("Ab1");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/at least 8 characters/i);
  });

  it("rejects passwords with no uppercase letter", () => {
    const result = passwordSchema.safeParse("abc12345");
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => /uppercase/i.test(m))).toBe(true);
  });

  it("rejects passwords with no lowercase letter", () => {
    const result = passwordSchema.safeParse("ABC12345");
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => /lowercase/i.test(m))).toBe(true);
  });

  it("rejects passwords with no digit", () => {
    const result = passwordSchema.safeParse("AbcdefgH");
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => /digit/i.test(m))).toBe(true);
  });

  it("reports multiple violations at once", () => {
    const result = passwordSchema.safeParse("alllower");
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => /uppercase/i.test(m))).toBe(true);
    expect(messages.some((m) => /digit/i.test(m))).toBe(true);
  });
});

describe("registerSchema", () => {
  const valid = {
    email: "test@example.com",
    username: "TestUser",
    reasonForJoining: "I'd like to contribute definitions for my favorite series.",
    password: "SecureP4ss",
  };

  it("accepts valid registration data", () => {
    const result = registerSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("accepts an optional turnstileToken", () => {
    const result = registerSchema.safeParse({ ...valid, turnstileToken: "abc123" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "not-an-email" });
    expect(result.success).toBe(false);
  });

  it("rejects empty username", () => {
    const result = registerSchema.safeParse({ ...valid, username: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only username", () => {
    const result = registerSchema.safeParse({ ...valid, username: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects empty reasonForJoining", () => {
    const result = registerSchema.safeParse({ ...valid, reasonForJoining: "" });
    expect(result.success).toBe(false);
  });

  it("rejects whitespace-only reasonForJoining", () => {
    const result = registerSchema.safeParse({ ...valid, reasonForJoining: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects reasonForJoining over 2000 characters", () => {
    const result = registerSchema.safeParse({ ...valid, reasonForJoining: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts valid login data", () => {
    const result = loginSchema.safeParse({
      identifier: "test@example.com",
      password: "anypassword",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a username as the identifier", () => {
    const result = loginSchema.safeParse({
      identifier: "TestUser",
      password: "anypassword",
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      identifier: "test@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty identifier", () => {
    const result = loginSchema.safeParse({
      identifier: "",
      password: "anypassword",
    });
    expect(result.success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts an email as the identifier", () => {
    const result = forgotPasswordSchema.safeParse({ identifier: "test@example.com" });
    expect(result.success).toBe(true);
  });

  it("accepts a username as the identifier", () => {
    const result = forgotPasswordSchema.safeParse({ identifier: "TestUser" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty identifier", () => {
    const result = forgotPasswordSchema.safeParse({ identifier: "" });
    expect(result.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  const valid = { token: "some-random-token", password: "SecureP4ss" };

  it("accepts a valid token and password", () => {
    const result = resetPasswordSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("rejects an empty token", () => {
    const result = resetPasswordSchema.safeParse({ ...valid, token: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a password that violates complexity rules", () => {
    const result = resetPasswordSchema.safeParse({ ...valid, password: "alllower" });
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => /uppercase/i.test(m))).toBe(true);
    expect(messages.some((m) => /digit/i.test(m))).toBe(true);
  });
});

describe("resendVerificationSchema", () => {
  it("accepts an email as the identifier", () => {
    const result = resendVerificationSchema.safeParse({ identifier: "test@example.com" });
    expect(result.success).toBe(true);
  });

  it("accepts a username as the identifier", () => {
    const result = resendVerificationSchema.safeParse({ identifier: "TestUser" });
    expect(result.success).toBe(true);
  });

  it("rejects an empty identifier", () => {
    const result = resendVerificationSchema.safeParse({ identifier: "" });
    expect(result.success).toBe(false);
  });
});
