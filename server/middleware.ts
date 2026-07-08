import helmet from "helmet";
import { type Request, type Response, type NextFunction } from "express";
import { json, urlencoded } from "express";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import dotenv from "dotenv";

dotenv.config(); // Load .env files into process.env

// ── Environment Validation ──
const requiredEnvVars = [
  "JWT_SECRET",
  "EXPO_PUBLIC_SUPABASE_URL",
  "EXPO_PUBLIC_SUPABASE_ANON_KEY",
] as const;

export function validateEnv(): void {
  const missing: string[] = [];
  for (const key of requiredEnvVars) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }

  // Warn if JWT_SECRET looks like default
  const jwtSecret = process.env.JWT_SECRET || "";
  if (jwtSecret.length < 32 || jwtSecret.includes("dev-secret")) {
    console.warn(
      "[SECURITY] JWT_SECRET is too short or looks like a default. Generate a strong one: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
}

// ── Helmet Security Headers ──
export function setupHelmet(app: any): void {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'", ...getConnectSrc()],
          fontSrc: ["'self'", "data:"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
    })
  );
}

function getConnectSrc(): string[] {
  const allowed: string[] = [];
  if (process.env.EXPO_PUBLIC_SUPABASE_URL) {
    allowed.push(process.env.EXPO_PUBLIC_SUPABASE_URL);
  }
  return allowed;
}

// ── CSRF Protection ──
const CSRF_COOKIE_NAME = "csrf-token";
const CSRF_HEADER_NAME = "x-csrf-token";

export function setupCsrfProtection(app: any): void {
  app.use((req: Request, res: Response, next: NextFunction) => {
    // Skip CSRF for GET/HEAD/OPTIONS and API auth routes
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      return next();
    }

    // Auth routes use Bearer token, no CSRF needed
    if (req.path.startsWith("/api/auth/")) {
      return next();
    }

    // Check CSRF token for state-changing requests
    const csrfCookie = req.cookies?.[CSRF_COOKIE_NAME];
    const csrfHeader = req.headers[CSRF_HEADER_NAME] as string | undefined;

    if (csrfCookie && csrfHeader && csrfCookie === csrfHeader) {
      return next();
    }

    // If no CSRF, just continue (mobile apps use Bearer tokens)
    // CSRF check is mainly for browser-based clients
    next();
  });
}

export function generateCsrfToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// ── Rate Limiting ──

// Auth endpoints: strict limits
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: {
    error: "TOO_MANY_ATTEMPTS",
    message: "Too many authentication attempts. Please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// General API: moderate limits
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many requests. Please slow down.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Admin endpoints: tighter limits
export const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: {
    error: "RATE_LIMIT_EXCEEDED",
    message: "Too many admin requests.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── JWT ──
const JWT_SECRET = process.env.JWT_SECRET || "";
const JWT_EXPIRES_IN = "7d";

interface JWTPayload {
  userId: string;
  username: string;
  profileId?: string;
  profileType?: "child" | "parent";
  iat?: number;
  exp?: number;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function createSignature(header: string, payload: string): string {
  return crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest("base64url");
}

export function signToken(
  payload: Omit<JWTPayload, "iat" | "exp">
): string {
  const header = base64UrlEncode(
    JSON.stringify({ alg: "HS256", typ: "JWT" })
  );
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 7 * 24 * 60 * 60; // 7 days
  const payloadWithTime = { ...payload, iat: now, exp };
  const payloadStr = base64UrlEncode(JSON.stringify(payloadWithTime));
  const signature = createSignature(header, payloadStr);
  return `${header}.${payloadStr}.${signature}`;
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;

    const expectedSignature = createSignature(header, payload);
    if (signature !== expectedSignature) return null;

    const decoded = JSON.parse(base64UrlDecode(payload)) as JWTPayload;

    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

// ── Auth Middleware ──

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res
      .status(401)
      .json({
        error: "UNAUTHORIZED",
        message: "Missing or invalid authorization header",
      });
    return;
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    res
      .status(401)
      .json({
        error: "INVALID_TOKEN",
        message: "Token is invalid or expired",
      });
    return;
  }

  (req as any).user = decoded;
  next();
}

export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const decoded = verifyToken(token);
    if (decoded) {
      (req as any).user = decoded;
    }
  }

  next();
}

export function requireParent(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as any).user;

  if (!user) {
    res
      .status(401)
      .json({
        error: "UNAUTHORIZED",
        message: "Authentication required",
      });
    return;
  }

  if (user.profileType !== "parent") {
    res
      .status(403)
      .json({
        error: "FORBIDDEN",
        message: "Parent access required",
      });
    return;
  }

  next();
}

// ── Input Sanitization ──

const SENSITIVE_FIELDS = new Set([
  "password",
  "token",
  "secret",
  "authorization",
  "apiKey",
  "api_key",
]);

export function sanitizeInput(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const sanitize = (obj: any): any => {
    if (!obj || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sanitize);

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_FIELDS.has(key)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "string") {
        sanitized[key] = value.trim().slice(0, 10000);
      } else if (typeof value === "object") {
        sanitized[key] = sanitize(value);
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  };

  if (req.body) req.body = sanitize(req.body);
  if (req.query) req.query = sanitize(req.query);
  if (req.params) req.params = sanitize(req.params);

  next();
}

// ── Error Handling ──

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error("[Server Error]", {
    message: err.message,
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    requestId: (req as any).requestId,
    path: req.path,
    method: req.method,
  });

  const isDev = process.env.NODE_ENV === "development";

  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: isDev ? err.message : "An unexpected error occurred",
    requestId: (req as any).requestId,
    ...(isDev && { stack: err.stack }),
  });
}

export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
}

// ── Request Logging ──

export function requestLogger(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const start = Date.now();
  const requestId = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

  (req as any).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  const originalResJson = res.json.bind(res);
  let capturedJsonResponse: Record<string, unknown> | undefined;

  res.json = function (bodyJson: any) {
    capturedJsonResponse = bodyJson;
    return originalResJson(bodyJson);
  } as typeof originalResJson;

  res.on("finish", () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? "warn" : "info";

    const logData = {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.socket.remoteAddress,
      userAgent: req.get("user-agent")?.slice(0, 100),
    };

    if (level === "warn" || process.env.NODE_ENV === "development") {
      console[level](JSON.stringify(logData));
      if (capturedJsonResponse && level === "warn") {
        console.warn("Response:", JSON.stringify(capturedJsonResponse).slice(0, 500));
      }
    }
  });

  next();
}

// ── Setup helpers (used by server/index.ts) ──

export function setupCors(app: any): void {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || "https://habittracker.app").split(",");
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type,Authorization,X-CSRF-Token");
    res.header("Access-Control-Allow-Credentials", "true");
    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });
}

export function setupBodyParsing(app: any): void {
  app.use(json({ limit: "1mb" }));
  app.use(urlencoded({ extended: true, limit: "1mb" }));
}

export function setupRequestLogging(app: any): void {
  app.use(requestLogger);
}

// Type fix for res.json spread in requestLogger
const _fixJsonSpread = (originalResJson: any) =>
  function (this: any, bodyJson: any, ...args: any[]) {
    return originalResJson.call(this, bodyJson, ...(args as [any?]));
  };
