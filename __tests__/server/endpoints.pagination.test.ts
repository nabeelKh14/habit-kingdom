import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { AddressInfo } from "node:net";
import { registerRoutes } from "../../server/routes";
import { signToken } from "../../server/middleware";

/**
 * Live endpoint tests for the paginated list routes.
 * Boots the real Express app via registerRoutes and exercises the
 * three GET list endpoints over loopback HTTP using the global fetch.
 */
describe("List endpoints — pagination envelope", () => {
  let baseUrl = "";
  let server: Server | null = null;
  const token = signToken({ userId: "test-user", username: "tester" });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    server = await registerRoutes(app);
    await new Promise<void>((resolve) => {
      server!.listen(0, "127.0.0.1", () => resolve());
    });
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server?.close();
  });

  const auth = () => ({ Authorization: `Bearer ${token}` });

  it("GET /api/v1/habits returns a pagination envelope", async () => {
    const res = await fetch(`${baseUrl}/api/v1/habits?page=1&limit=20`, {
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.habits).toEqual([]);
    expect(body.pagination).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 0,
      totalPages: 1,
      hasNext: false,
      hasPrev: false,
    });
  });

  it("GET /api/v1/habits rejects requests without a token (401)", async () => {
    const res = await fetch(`${baseUrl}/api/v1/habits`);
    expect(res.status).toBe(401);
  });

  it("GET /api/v1/rewards returns a pagination envelope and clamps an out-of-range page for an empty collection", async () => {
    const res = await fetch(`${baseUrl}/api/v1/rewards?page=2&limit=10`, {
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    // Empty collection has only 1 page, so page=2 clamps to page=1.
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  });

  it("GET /api/v1/sync/download returns a pagination envelope", async () => {
    const res = await fetch(`${baseUrl}/api/v1/sync/download?page=1`, {
      headers: auth(),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.pagination).toBeDefined();
    expect(body.pagination.page).toBe(1);
  });

  it("caps pageSize at the configured maximum", async () => {
    const res = await fetch(`${baseUrl}/api/v1/habits?limit=99999`, {
      headers: auth(),
    });
    const body = (await res.json()) as any;
    expect(body.pagination.pageSize).toBeLessThanOrEqual(100);
  });
});
