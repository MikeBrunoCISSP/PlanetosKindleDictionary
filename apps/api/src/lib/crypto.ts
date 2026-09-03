import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config } from "../config.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

// `config.settingsEncryptionKey` is validated at startup (min 32 chars,
// no placeholder) in strict mode; in development it is whatever `.env`
// supplies. AES-256 needs a 32-byte key, so we derive one via SHA-256.
function getKey(): Buffer {
  return createHash("sha256").update(config.settingsEncryptionKey).digest();
}

/** Encrypts `plaintext` with AES-256-GCM, packing IV + auth tag + ciphertext into one base64 string. */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Decrypts a value produced by `encrypt`. Throws if the packed value has been tampered with. */
export function decrypt(packed: string): string {
  const key = getKey();
  const buffer = Buffer.from(packed, "base64");
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
