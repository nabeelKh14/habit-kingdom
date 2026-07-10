import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptField,
  decryptField,
  maybeEncrypt,
  maybeDecrypt,
  isEncryptionEnabled,
  generateKey,
  resetCryptoKeyCache,
} from "../crypto";

const KEY = "a".repeat(64); // 64 hex chars = 32 bytes

describe("server/crypto (AES-256-GCM field encryption)", () => {
  const saved = process.env.HK_FIELD_ENCRYPTION_KEY;

  afterEach(() => {
    resetCryptoKeyCache();
    if (saved === undefined) delete process.env.HK_FIELD_ENCRYPTION_KEY;
    else process.env.HK_FIELD_ENCRYPTION_KEY = saved;
    // reset module cache of key not needed: key is read fresh each call
  });

  describe("with key configured (production mode)", () => {
    beforeEach(() => {
      process.env.HK_FIELD_ENCRYPTION_KEY = KEY;
    });

    it("round-trips a value", () => {
      const secret = "ExponentPushToken[abc123DEF456]";
      const enc = encryptField(secret);
      expect(enc).not.toContain(secret);
      expect(enc.startsWith("hkenc:v1:")).toBe(true);
      expect(decryptField(enc)).toBe(secret);
    });

    it("produces different ciphertext each time (random IV)", () => {
      const a = encryptField("same");
      const b = encryptField("same");
      expect(a).not.toBe(b);
      expect(decryptField(a)).toBe("same");
      expect(decryptField(b)).toBe("same");
    });

    it("detects tampering (auth tag fails closed)", () => {
      const enc = encryptField("child-profile-name");
      const b64 = enc.slice("hkenc:v1:".length);
      const buf = Buffer.from(b64, "base64");
      buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
      const tampered = "hkenc:v1:" + buf.toString("base64");
      expect(() => decryptField(tampered)).toThrow();
    });

    it("encrypts via maybeEncrypt and decrypts via maybeDecrypt", () => {
      const v = maybeEncrypt("PII-token");
      expect(v.startsWith("hkenc:v1:")).toBe(true);
      expect(maybeDecrypt(v)).toBe("PII-token");
    });

    it("isEncryptionEnabled() is true", () => {
      expect(isEncryptionEnabled()).toBe(true);
    });

    it("refuses to decrypt when key is missing but value is tagged", () => {
      const enc = encryptField("secret");
      delete process.env.HK_FIELD_ENCRYPTION_KEY;
      expect(() => decryptField(enc)).toThrow(/not set/i);
    });
  });

  describe("without key configured (dev / NO-OP mode)", () => {
    beforeEach(() => {
      delete process.env.HK_FIELD_ENCRYPTION_KEY;
    });

    it("passes cleartext through unchanged", () => {
      expect(encryptField("plain")).toBe("plain");
      expect(maybeEncrypt("plain")).toBe("plain");
      expect(isEncryptionEnabled()).toBe(false);
    });

    it("decryptField passes through untagged values", () => {
      expect(decryptField("plain")).toBe("plain");
      expect(maybeDecrypt("plain")).toBe("plain");
    });

    it("does not double-encrypt across a no-op round trip", () => {
      const v = maybeEncrypt(maybeDecrypt("anything"));
      expect(v).toBe("anything");
    });
  });

  it("generateKey produces a 64-char hex string (32 bytes)", () => {
    const k = generateKey();
    expect(k).toMatch(/^[0-9a-f]{64}$/);
  });
});
