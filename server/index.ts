import express from "express";
import type { Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes.js";
import {
  errorHandler,
  notFound,
  requestLogger,
  apiLimiter,
  setupHelmet,
  setupCors,
  setupBodyParsing,
  setupRequestLogging,
  setupCsrfProtection,
  validateEnv,
  sanitizeInput,
} from "./middleware";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

// Validate environment variables at startup
try {
  validateEnv();
} catch (err: any) {
  console.error("[FATAL] Environment validation failed:", err.message);
  process.exit(1);
}

// Middleware pipeline (order matters)
setupHelmet(app);          // 1. Security headers
setupCors(app);           // 2. CORS
setupBodyParsing(app);    // 3. JSON/URL-encoded body parsing
setupRequestLogging(app); // 4. Request logging with IDs
setupCsrfProtection(app); // 5. CSRF tokens
app.use(compression());   // 6. Gzip compression for responses
app.use("/api", apiLimiter); // 6. Rate limiting

// Static files and Expo routing
configureExpoAndLanding(app);

// API routes
const server = await registerRoutes(app);

// Error handlers (must be last)
app.use(notFound);
app.use(errorHandler);

// ── Helpers ──

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "Habit Kingdom";
  } catch {
    return "Habit Kingdom";
  }
}

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}

function serveLandingPage({
  req,
  res,
  landingPageTemplate,
  appName,
}: {
  req: Request;
  res: Response;
  landingPageTemplate: string;
  appName: string;
}) {
  const forwardedProto = req.header("x-forwarded-proto");
  const protocol = forwardedProto || req.protocol || "https";
  const forwardedHost = req.header("x-forwarded-host");
  const host = forwardedHost || req.get("host");
  const baseUrl = `${protocol}://${host}`;

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/APP_NAME_PLACEHOLDER/g, appName);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

function configureExpoAndLanding(app: express.Application) {
  const templatePath = path.resolve(
    process.cwd(),
    "server",
    "templates",
    "landing-page.html",
  );

  let landingPageTemplate = "";
  try {
    landingPageTemplate = fs.readFileSync(templatePath, "utf-8");
  } catch {
    landingPageTemplate = `
      <!DOCTYPE html>
      <html>
        <head><title>Habit Kingdom</title></head>
        <body>
          <h1>Habit Kingdom API Server</h1>
          <p>Server is running. API endpoints available at /api/*</p>
        </body>
      </html>
    `;
  }

  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    if (req.path !== "/" && req.path !== "/manifest") return next();

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({ req, res, landingPageTemplate, appName });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

async function startServer() {
  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";

  server.listen(
    {
      port,
      host,
    },
    () => {
      log(`\n🚀 Habit Kingdom API Server started`);
      log(`   Environment: ${process.env.NODE_ENV || "development"}`);
      log(`   Port: ${port}`);
      log(`   Host: ${host}`);
      log(`   API Base: http://${host}:${port}/api`);
      log(`\n   Press Ctrl+C to stop\n`);
    },
  );

  // Graceful shutdown
  process.on("SIGTERM", () => {
    log("SIGTERM received, shutting down gracefully...");
    server.close(() => {
      log("Server closed");
      process.exit(0);
    });
  });

  process.on("SIGINT", () => {
    log("SIGINT received, shutting down gracefully...");
    server.close(() => {
      log("Server closed");
      process.exit(0);
    });
  });
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});