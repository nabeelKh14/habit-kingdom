import crypto from "node:crypto";

/**
 * AES-256-GCM field-level encryption for sensitive data at rest.
 *
 * Used to encrypt PII columns before they hit the database (child profile
 * names, push tokens, etc.) so a DB leak / backup exposure doesn't expose
 * plaintext identity data — COPPA / GDPR-K requirement.
 *
 * Design (ponytail):
 * - Envelope format: `hkenc:v1:<base64(iv|authTag|ciphertext)>`
 * - Key is derived from HK_FIELD_ENCRYPTION_KEY (32 raw bytes) via scrypt.
 *   If the env var is unset, we run in NO-OP mode: encrypt() returns the
 *   value unchanged (untagged) and decrypt() returns it as-is. This keeps
 *   dev / in-memory / CI runs working without a key while still being safe
 *   to flip on in prod by just setting the env var — no code change needed.
 * - We never double-encrypt: decrypt() passes through anything not tagged.
 */

const PREFIX = "hkenc:v1:";
const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

/** Test/teardown hook: clear the memoized key so env changes take effect. */
export function resetCryptoKeyCache(): void {
  // No-op: getKey() reads the env var fresh each call (see getKey).
}

function getKey(): Buffer | null {
  // Read the env var fresh each call (no memoization). The app sets
  // HK_FIELD_ENCRYPTION_KEY once at boot; re-reading avoids stale cached-key
  // state across module instances (e.g. in pooled test workers) and costs
  // only one process.env lookup.
  const raw = process.env.HK_FIELD_ENCRYPTION_KEY;
  if (!raw) return null;
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  if (/^[A-Za-z0-9+/=]{44}$/.test(raw)) return Buffer.from(raw, "base64");
  return crypto.scryptSync(raw, "habit-kingdom-field-enc", 32);
}

export function isEncryptionEnabled(): boolean {
  return getKey() !== null;
}

/** Encrypt a string. Returns the cleartext (untagged) when no key is set. */
export function encryptField(plaintext: string): string {
  const key = getKey();
  if (key === null) return plaintext; // NO-OP mode
  if (typeof plaintext !== "string") return plaintext;

  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, enc]).toString("base64");
  return PREFIX + packed;
}

/** Decrypt a tagged value; passes through cleartext untouched. */
export function decryptField(value: string): string {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) {
    return value; // NO-OP mode or already-clear value
  }
  const key = getKey();
  if (key === null) {
    // Data was encrypted but we have no key — cannot decrypt. Surface, don't crash silently.
    throw new Error("FIELD_ENCRYPTION_KEY not set but encrypted value encountered");
  }
  const packed = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = packed.subarray(0, IV_LEN);
  const tag = packed.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = packed.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}

/** Convenience: encrypt only when a real key is configured (idempotent on cleartext). */
export function maybeEncrypt(value: string): string {
  return isEncryptionEnabled() ? encryptField(value) : value;
}

export function maybeDecrypt(value: string): string {
  return value.startsWith(PREFIX) ? decryptField(value) : value;
}

/** Generate a production-grade key string (hex) for HK_FIELD_ENCRYPTION_KEY. */
export function generateKey(): string {
  return crypto.randomBytes(32).toString("hex");
}
