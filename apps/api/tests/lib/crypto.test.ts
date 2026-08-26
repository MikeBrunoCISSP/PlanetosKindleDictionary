import { describe, expect, it } from "vitest";
import { encrypt, decrypt } from "../../src/lib/crypto.js";

describe("crypto", () => {
  it("round-trips a plaintext value through encrypt/decrypt", () => {
    const packed = encrypt("s3cret-value");
    expect(decrypt(packed)).toBe("s3cret-value");
  });

  it("produces a different packed value each time (random IV)", () => {
    const a = encrypt("same-input");
    const b = encrypt("same-input");
    expect(a).not.toBe(b);
  });

  it("throws when decrypting a tampered value", () => {
    const packed = encrypt("s3cret-value");
    const buffer = Buffer.from(packed, "base64");
    buffer[buffer.length - 1] = buffer[buffer.length - 1]! ^ 0xff;
    const tampered = buffer.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when decrypting garbage input", () => {
    expect(() => decrypt("not-a-valid-packed-value")).toThrow();
  });
});
