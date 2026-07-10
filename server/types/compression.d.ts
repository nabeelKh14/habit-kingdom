// Ambient type shim for `compression` (no @types/compression in deps).
// The server uses it only for `app.use(compression())` gzip middleware.
// ponytail: compression's API surface used here is just the default export fn.
declare module "compression" {
  import type { RequestHandler } from "express";
  function compression(options?: unknown): RequestHandler;
  export = compression;
}
