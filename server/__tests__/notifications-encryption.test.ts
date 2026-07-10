import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import { createServer, type Server } from "node:http";
import { registerNotificationRoutes, __test_getRawStoredTokens, getUserTokens } from "../notifications";
import { resetCryptoKeyCache, isEncryptionEnabled } from "../crypto";

function startApp(userId = "u_test"): { server: Server; url: string; close: () => Promise<void> } {
  const app = express();
  app.use(express.json());
  // stub auth middleware: inject a fake user
  const auth = (_req: any, _res: any, next: any) => {
    _req.user = { userId, username: "tester" };
    next();
  };
  registerNotificationRoutes(app, "/api/v1", auth);
  const server = createServer(app);
  return {
    server,
    url: "http://127.0.0.1:5191",
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

async function registerToken(url: string, token: string, platform: string) {
  return fetch(`${url}/api/v1/notifications/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
}

describe("push token encryption at rest (integration)", () => {
  const saved = process.env.HK_FIELD_ENCRYPTION_KEY;

  afterEach(() => {
    resetCryptoKeyCache();
    if (saved === undefined) delete process.env.HK_FIELD_ENCRYPTION_KEY;
    else process.env.HK_FIELD_ENCRYPTION_KEY = saved;
  });

  it("stores the token ENCRYPTED when HK_FIELD_ENCRYPTION_KEY is set", async () => {
    delete process.env.HK_FIELD_ENCRYPTION_KEY;
    resetCryptoKeyCache();
    process.env.HK_FIELD_ENCRYPTION_KEY = "c".repeat(64);
    const { server, url } = startApp("u_enc");
    await new Promise<void>((r) => server.listen(5191, "127.0.0.1", () => r()));
    const realToken = "ExponentPushToken[real-plaintext-token-xyz]";

    const res = await registerToken(url, realToken, "ios");
    expect(res.status).toBe(200);

    // raw stored value must be encrypted + NOT contain the plaintext
    const raw = __test_getRawStoredTokens("u_enc");
    expect(raw.length).toBe(1);
    expect(raw[0].token).not.toBe(realToken);
    expect(raw[0].token.startsWith("hkenc:v1:")).toBe(true);
    expect(raw[0].token).not.toContain("real-plaintext-token");

    // ...but the read path (delivery) gets plaintext back
    const read = getUserTokens("u_enc");
    expect(read[0].token).toBe(realToken);
    server.close();
  });

  it("stores the token CLEARTEXT in NO-OP mode (no key)", async () => {
    delete process.env.HK_FIELD_ENCRYPTION_KEY;
    resetCryptoKeyCache();
    const { server, url } = startApp("u_noop");
    await new Promise<void>((r) => server.listen(5191, "127.0.0.1", () => r()));
    const realToken = "ExponentPushToken[nokey-token-abc]";

    const res = await registerToken(url, realToken, "android");
    expect(res.status).toBe(200);

    const raw = __test_getRawStoredTokens("u_noop");
    expect(raw[0].token).toBe(realToken); // no encryption without key
    server.close();
  });
});
