import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "../../src/lib/cursor.js";
import { DomainError } from "../../src/lib/errors.js";

describe("cursor", () => {
  it("round-trips a cursor through encode then decode", () => {
    const cursor = { createdAt: "2026-01-01T00:00:00.000Z", id: "abc123" };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it("rejects a garbage/tampered string", () => {
    expect(() => decodeCursor("not-valid-base64url-json!!!")).toThrow(DomainError);
    try {
      decodeCursor("not-valid-base64url-json!!!");
    } catch (err) {
      expect((err as DomainError).code).toBe("INVALID_CURSOR");
      expect((err as DomainError).statusCode).toBe(400);
    }
  });

  it("rejects a validly-encoded but wrong-shaped payload (missing fields)", () => {
    const malformed = Buffer.from(JSON.stringify({ createdAt: "2026-01-01T00:00:00.000Z" }), "utf8").toString(
      "base64url"
    );
    expect(() => decodeCursor(malformed)).toThrow(DomainError);
  });

  it("rejects a validly-encoded but wrong-shaped payload (wrong types)", () => {
    const malformed = Buffer.from(JSON.stringify({ createdAt: 12345, id: null }), "utf8").toString("base64url");
    expect(() => decodeCursor(malformed)).toThrow(DomainError);
  });

  it("rejects a payload that isn't a JSON object at all", () => {
    const malformed = Buffer.from(JSON.stringify("just a string"), "utf8").toString("base64url");
    expect(() => decodeCursor(malformed)).toThrow(DomainError);
  });
});
