/**
 * PostHog product analytics — integration for Habit Kingdom.
 *
 * Uses posthog-react-native (v4): instantiate a singleton client with
 * `new PostHog(apiKey, { host })`. The SDK is dynamically imported so the app
 * still builds/runs where it is not installed. All functions gracefully no-op
 * when the SDK is unavailable or unconfigured.
 *
 * PII SAFETY (COPPA/GDPR-K): we never send emails or names. The user is
 * identified only by an anonymized ID; no personal properties are set.
 */

const POSTHOG_API_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY || "";
const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST ||
  "https://us.i.posthog.com";

let client: any = null;
let initialized = false;

/**
 * Initialize PostHog for product analytics.
 * Called once at app startup via initMonitoring().
 */
export async function initPostHog(): Promise<void> {
  if (!POSTHOG_API_KEY) {
    console.warn("[PostHog] API key not configured — skipping initialization");
    return;
  }

  try {
    // @ts-ignore — optional dependency, may not be installed
    const PostHog = (await import("posthog-react-native")).default;
    client = new PostHog(POSTHOG_API_KEY, {
      host: POSTHOG_HOST,
      // COPPA/GDPR-K: do not autocapture PII
      captureAppLifecycleEvents: false,
    });
    initialized = true;
    console.log("[PostHog] Initialized successfully");
  } catch (err) {
    console.warn("[PostHog] Failed to initialize:", err);
  }
}

export function isPostHogInitialized(): boolean {
  return initialized;
}

/**
 * Track an analytics event. Safe to call even if PostHog is not initialized.
 */
export function trackEvent(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (!initialized || !client) return;
    client.capture(event, properties);
  } catch {
    // Swallow — analytics must never crash the app
  }
}

/**
 * Identify the user for funnel/retention analysis.
 * Pass ONLY an anonymized ID — never email, name, or other PII.
 */
export function identifyUser(anonymousId: string): void {
  try {
    if (!initialized || !client) return;
    client.identify(anonymousId.slice(0, 8), {});
  } catch {
    // Swallow
  }
}

/**
 * Clear the user (on logout).
 */
export function resetUser(): void {
  try {
    if (!initialized || !client) return;
    client.reset();
  } catch {
    // Swallow
  }
}
