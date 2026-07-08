/**
 * Sentry error monitoring — integration for Habit Kingdom.
 *
 * Uses @sentry/react-native. The SDK is dynamically imported so the app
 * still builds/runs in environments where it is not installed (e.g. Expo Go).
 * All functions gracefully no-op when the SDK is unavailable or unconfigured.
 *
 * PII SAFETY (COPPA/GDPR-K): we never send emails or names. User identity is
 * set to a truncated anonymous ID at most.
 */

const SENTRY_DSN =
  process.env.EXPO_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";

let initialized = false;

/**
 * Initialize Sentry for crash + performance reporting.
 * Called once at app startup (before any other code) via initMonitoring().
 */
export async function initSentry(): Promise<void> {
  if (!SENTRY_DSN) {
    console.warn("[Sentry] DSN not configured — skipping initialization");
    return;
  }

  try {
    // @ts-ignore — optional dependency, may not be installed
    const Sentry = await import("@sentry/react-native");

    Sentry.init({
      dsn: SENTRY_DSN,
      environment: process.env.NODE_ENV || "development",
      tracesSampleRate: 0.2, // 20% trace sampling for performance monitoring
      enableAutoPerformanceTracing: true,
      enableWatchdogTerminationTracking: true,
      attachStacktrace: true,
      // Never send personally identifiable information
      beforeSend(event) {
        // Strip user email from events
        if (event.user?.email) {
          event.user.email = "[REDACTED]";
        }
        // Strip display names
        if (event.user?.username) {
          event.user.username = "[REDACTED]";
        }
        return event;
      },
    });

    initialized = true;
    console.log("[Sentry] Initialized successfully");
  } catch (err) {
    console.warn("[Sentry] Failed to initialize:", err);
  }
}

export function isSentryInitialized(): boolean {
  return initialized;
}

/**
 * Capture an error with optional context.
 * Safe to call even if Sentry is not initialized.
 */
export function captureError(
  error: Error | string,
  extra?: Record<string, unknown>,
): void {
  try {
    if (!initialized) return;
    const err = typeof error === "string" ? new Error(error) : error;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    void import("@sentry/react-native").then((Sentry) => {
      Sentry.captureException(err, { extra });
    });
  } catch {
    // Swallow — don't crash the app if Sentry fails
  }
}

/**
 * Add a breadcrumb for debugging.
 */
export function addBreadcrumb(message: string, category?: string): void {
  try {
    if (!initialized) return;
    void import("@sentry/react-native").then((Sentry) => {
      Sentry.addBreadcrumb({
        message,
        category: category || "app",
        level: "info",
      });
    });
  } catch {
    // Swallow
  }
}

/**
 * Set the current user ID for issue grouping.
 * Does NOT send PII — uses anonymous/anonymized user ID only.
 */
export function setSentryUser(userId: string): void {
  try {
    if (!initialized) return;
    void import("@sentry/react-native").then((Sentry) => {
      Sentry.setUser({ id: userId.slice(0, 8) });
    });
  } catch {
    // Swallow
  }
}

/**
 * Clear the user (on logout).
 */
export function clearSentryUser(): void {
  try {
    if (!initialized) return;
    void import("@sentry/react-native").then((Sentry) => {
      Sentry.setUser(null);
    });
  } catch {
    // Swallow
  }
}
