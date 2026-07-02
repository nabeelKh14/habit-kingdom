/**
 * Sentry error monitoring — integration for Habit Kingdom.
 *
 * NOTE: @sentry/react-native is an OPTIONAL dependency.
 * All functions gracefully no-op when it's not installed.
 */

// @ts-ignore — optional dependency, may not be installed
import * as Sentry from "@sentry/react-native";

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";

/**
 * Initialize Sentry for crash reporting.
 * Should be called once at app startup (before any other code).
 */
export function initSentry(): void {
  if (!SENTRY_DSN) {
    console.warn("[Sentry] DSN not configured — skipping initialization");
    return;
  }

  if (typeof Sentry.init !== "function") {
    console.warn("[Sentry] SDK not available — skipping init");
    return;
  }

  try {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 0.2, // 20% trace sampling for performance monitoring
      enableAutoPerformanceTracing: true,
      enableWatchdogTerminationTracking: true,
      attachStacktrace: true,
      // Never send personally identifiable information
      // @ts-ignore — Sentry types unavailable when SDK not installed
      beforeSend(event: any) {
        // Strip user email from events
        if (event.user?.email) {
          event.user.email = "[REDACTED]";
        }
        return event;
      },
    });

    console.log("[Sentry] Initialized successfully");
  } catch (err) {
    console.warn("[Sentry] Failed to initialize:", err);
  }
}

/**
 * Capture an error with optional context.
 * Safe to call even if Sentry is not initialized.
 */
export function captureError(error: Error | string, extra?: Record<string, unknown>): void {
  try {
    const err = typeof error === "string" ? new Error(error) : error;
    if (typeof Sentry.captureException === "function") {
      Sentry.captureException(err, { extra });
    } else {
      console.warn("[Sentry] captureException not available");
    }
  } catch {
    // Swallow — don't crash the app if Sentry fails
  }
}

/**
 * Add a breadcrumb for debugging.
 */
export function addBreadcrumb(message: string, category?: string): void {
  try {
    if (typeof Sentry.addBreadcrumb === "function") {
      Sentry.addBreadcrumb({
        message,
        category: category || "app",
        level: "info",
      });
    }
  } catch {
    // Swallow
  }
}

/**
 * Set the current user ID for issue grouping.
 * Does NOT send PII — uses anonymous user ID.
 */
export function setSentryUser(userId: string): void {
  try {
    if (typeof Sentry.setUser === "function") {
      Sentry.setUser({ id: userId.slice(0, 8) });
    }
  } catch {
    // Swallow
  }
}

/**
 * Clear the user (on logout).
 */
export function clearSentryUser(): void {
  try {
    if (typeof Sentry.setUser === "function") {
      Sentry.setUser(null);
    }
  } catch {
    // Swallow
  }
}

/**
 * Wrap a function in a Sentry transaction for performance monitoring.
 */
export function trace<T>(name: string, fn: () => Promise<T>): Promise<T> {
  return fn(); // Placeholder — Sentry transaction wrapper
}
