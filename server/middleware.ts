import { type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";

// JWT secret - in production, use environment variable
const JWT_SECRET = process.env.JWT_SECRET || "habit-kingdom-dev-secret-change-in-production";
const JWT_EXPIRES_IN = "7d";

// Simple JWT implementation (for local-only use)
interface JWTPayload {
  userId: string;
  username: string;
  profileId?: string;
  profileType?: 'child' | 'parent';
  iat?: number;
  exp?: number;
}

function base64UrlEncode(data: string): string {
  return Buffer.from(data).toString("base64url");
}

function base64UrlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function createSignature(header: string, payload: string, secret: string): string {
  const crypto = require("crypto");
  return crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
}

export function signToken(payload: Omit<JWTPayload, "iat" | "exp">): string {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadWithTime = { ...payload, iat: Math.floor(Date.now() / 1000) };
  const payloadStr = base64UrlEncode(JSON.stringify(payloadWithTime));
  const signature = createSignature(header, payloadStr, JWT_SECRET);
  return `${header}.${payloadStr}.${signature}`;
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    const [header, payload, signature] = token.split(".");
    if (!header || !payload || !signature) return null;

    const expectedSignature = createSignature(header, payload, JWT_SECRET);
    if (signature !== expectedSignature) return null;

    const decoded = JSON.parse(base64UrlDecode(payload)) as JWTPayload;

    // Check expiration
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

// Authentication middleware
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ error: "INVALID_TOKEN", message: "Token is invalid or expired" });
    return;
  }

  // Attach user to request
  (req as any).user = decoded;
  next();
}

// Optional authentication - doesn't fail if no token, but validates if present
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
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

// Parent-only access middleware
export function requireParent(req: Request, res: Response, next: NextFunction): void {
  const user = (req as any).user;

  if (!user) {
    res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
    return;
  }

  if (user.profileType !== "parent") {
    res.status(403).json({ error: "FORBIDDEN", message: "Parent access required" });
    return;
  }

  next();
}

// Rate limiting for auth endpoints
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: { error: "TOO_MANY_ATTEMPTS", message: "Too many authentication attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiting for general API
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: { error: "RATE_LIMIT_EXCEEDED", message: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

// Input sanitization middleware
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  const sensitiveFields = ["password", "token", "secret"];

  const sanitize = (obj: any): any => {
    if (!obj || typeof obj !== "object") return obj;

    const sanitized: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (sensitiveFields.includes(key)) {
        sanitized[key] = "[REDACTED]";
      } else if (typeof value === "string") {
        // Trim whitespace and limit length
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

// Error handling middleware
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
  console.error("[Server Error]", err);

  // Don't expose internal error details in production
  const isDev = process.env.NODE_ENV === "development";

  res.status(500).json({
    error: "INTERNAL_ERROR",
    message: isDev ? err.message : "An unexpected error occurred",
    ...(isDev && { stack: err.stack }),
  });
}

// Not found middleware
export function notFound(req: Request, res: Response): void {
  res.status(404).json({
    error: "NOT_FOUND",
    message: `Route ${req.method} ${req.path} not found`,
  });
}

// Request logging middleware
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - start;
    const log = `[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`;
    console.log(log);
  });

  next();
}
