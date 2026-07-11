import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { registerRoutes } from '../../server/routes';
import { signToken } from '../../server/middleware';

/**
 * Live-endpoint proof for the remote feature-flags source. Boots the REAL
 * Express app (the same process that ships) and exercises
 * GET /api/v1/feature-flags over loopback HTTP. This proves the "remote
 * feature flags" DoD item is actually served by the server — not just present
 * in code. Mirrors __tests__/server/endpoints.pagination.test.ts.
 */
describe('GET /api/v1/feature-flags — live server proof', () => {
  let baseUrl = '';
  let server: Server | null = null;
  const token = signToken({ userId: 'e2e-user', username: 'e2e', profileType: 'parent' });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server?.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it('serves effective feature flags to an authenticated caller', async () => {
    const res = await fetch(`${baseUrl}/api/v1/feature-flags`, { headers: auth() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.effectiveFlags).toBeDefined();
    expect(Object.keys(body.effectiveFlags).length).toBeGreaterThan(0);
    // A few safe-default flags the client also knows about.
    expect(body.effectiveFlags.cloud_sync).toBe(true);
    expect(body.effectiveFlags.social_features).toBe(false);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await fetch(`${baseUrl}/api/v1/feature-flags`);
    expect(res.status).toBe(401);
  });
});
