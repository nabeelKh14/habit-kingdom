import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { errorHandler, notFound, requestLogger, apiLimiter } from "./middleware";
import * as fs from "fs";
import * as path from "path";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  const allowedOrigins = new Set<string>();

  // Environment-based origins
  if (process.env.REPLIT_DEV_DOMAIN) {
    allowedOrigins.add(`https://${process.env.REPLIT_DEV_DOMAIN}`);
  }

  if (process.env.REPLIT_DOMAINS) {
    process.env.REPLIT_DOMAINS.split(",").forEach((d) => {
      allowedOrigins.add(`https://${d.trim()}`);
    });
  }

  // Production domains
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(",").forEach((o) => {
      allowedOrigins.add(o.trim());
    });
  }

  // Add explicit production URL if set
  if (process.env.PRODUCTION_URL) {
    allowedOrigins.add(process.env.PRODUCTION_URL);
  }

  app.use((req, res, next) => {
    const origin = req.header("origin");

    // Allow localhost origins for development (any port)
    const isLocalhost =
      origin?.startsWith("http://localhost:") ||
      origin?.startsWith("http://127.0.0.1:");

    // Allow file:// for mobile webviews
    const isFileProtocol = origin === "null" || !origin;

    // Check if origin is allowed
    const isAllowed = origin && (allowedOrigins.has(origin) || isLocalhost || isFileProtocol);

    if (isAllowed && origin) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, PATCH");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept");
    res.header("Access-Control-Expose-Headers", "Content-Length, X-Request-Id");
    res.header("Access-Control-Max-Age", "86400"); // 24 hours
    res.header("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupBodyParsing(app: express.Application) {
  // Body size limit for security
  const MAX_BODY_SIZE = "1mb";

  app.use(
    express.json({
      limit: MAX_BODY_SIZE,
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: true, limit: MAX_BODY_SIZE }));
}

function setupSecurityHeaders(app: express.Application) {
  app.use((req, res, next) => {
    // Security headers
    res.header("X-Content-Type-Options", "nosniff");
    res.header("X-Frame-Options", "DENY");
    res.header("X-XSS-Protection", "1; mode=block");
    res.header("Referrer-Policy", "strict-origin-when-cross-origin");
    res.header("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
    next();
  });
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const requestId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Attach request ID
    (req as any).requestId = requestId;
    res.header("X-Request-Id", requestId);

    const originalResJson = res.json.bind(res);
    let capturedJsonResponse: Record<string, unknown> | undefined;

    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson(bodyJson, ...args);
    };

    res.on("finish", () => {
      const duration = Date.now() - start;
      const logLevel = res.statusCode >= 400 ? "error" : "info";

      const logData = {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        ip: req.ip || req.socket.remoteAddress,
        userAgent: req.get("user-agent")?.slice(0, 100),
      };

      if (logLevel === "error" || process.env.NODE_ENV === "development") {
        console[logLevel === "error" ? "error" : "log"](JSON.stringify(logData));
        if (capturedJsonResponse && logLevel === "error") {
          console.error("Response:", JSON.stringify(capturedJsonResponse));
        }
      }
    });

    next();
  });
}

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
  const expsUrl = `${host}`;

  log(`baseUrl: ${baseUrl}, expsUrl: ${expsUrl}`);

  const html = landingPageTemplate
    .replace(/BASE_URL_PLACEHOLDER/g, baseUrl)
    .replace(/EXPS_URL_PLACEHOLDER/g, expsUrl)
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
    log("Landing page template not found, using default");
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
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    if (req.path === "/") {
      return serveLandingPage({
        req,
        res,
        landingPageTemplate,
        appName,
      });
    }

    next();
  });

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
}

function setupErrorHandler(app: express.Application) {
  // 404 handler
  app.use(notFound);

  // Global error handler
  app.use(errorHandler);
}

async function startServer() {
  // Security middleware
  setupSecurityHeaders(app);

  // CORS
  setupCors(app);

  // Body parsing
  setupBodyParsing(app);

  // Request logging
  setupRequestLogging(app);

  // API rate limiting
  app.use("/api", apiLimiter);

  // Expo and landing page
  configureExpoAndLanding(app);

  // Register routes
  const server = await registerRoutes(app);

  // Error handling
  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);
  const host = process.env.HOST || "0.0.0.0";

  server.listen(
    {
      port,
      host,
      reusePort: true,
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
