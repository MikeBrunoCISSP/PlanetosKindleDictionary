import { describe, expect, it } from "vitest";
import { plainText } from "../validation.js";

describe("plainText", () => {
  const schema = plainText({ max: 20 });

  it("accepts ordinary punctuation-heavy text", () => {
    const result = schema.safeParse("Sales & Marketing!");
    expect(result.success).toBe(true);
  });

  it("rejects a script tag payload", () => {
    const result = schema.safeParse("<script>alert(1)</script>");
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => /markup/i.test(m))).toBe(true);
  });

  it("rejects any HTML-like tag", () => {
    const result = schema.safeParse("<b>bold</b>");
    expect(result.success).toBe(false);
  });

  it("rejects input longer than max", () => {
    const result = schema.safeParse("this string is definitely too long");
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message) ?? [];
    expect(messages.some((m) => /at most 20 characters/i.test(m))).toBe(true);
  });

  it("rejects empty input by default", () => {
    const result = schema.safeParse("");
    expect(result.success).toBe(false);
  });

  it("uses a custom min message when provided", () => {
    const withMessage = plainText({ max: 20, minMessage: "Title is required" });
    const result = withMessage.safeParse("");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("Title is required");
  });

  it("rejects whitespace-only input", () => {
    const result = schema.safeParse("    ");
    expect(result.success).toBe(false);
  });

  it("stores a padded value trimmed", () => {
    const result = schema.safeParse("  hello  ");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("hello");
  });

  it("trims before enforcing the max length", () => {
    const withMessage = plainText({ max: 5 });
    const result = withMessage.safeParse("  hello  ");
    expect(result.success).toBe(true);
    expect(result.success && result.data).toBe("hello");
  });
});
