/**
 * Monitoring orchestrator for Habit Kingdom.
 *
 * Single entrypoint that boots both Sentry (crash/error monitoring) and
 * PostHog (product analytics). Both are env-gated and gracefully no-op when
 * their keys are absent, so the app runs unchanged in dev / Expo Go.
 *
 * Call `initMonitoring()` once, as early as possible in app startup.
 */

import { initSentry, captureError } from "./sentry";
import { initPostHog } from "./analytics";

export { captureError };

let bootstrapped = false;

/**
 * Initialize all monitoring integrations. Safe to call multiple times —
 * only the first call does real work.
 */
export async function initMonitoring(): Promise<void> {
  if (bootstrapped) return;
  bootstrapped = true;

  try {
    await Promise.allSettled([initSentry(), initPostHog()]);
  } catch (err) {
    // Monitoring must never block or crash app startup
    console.warn("[Monitoring] Initialization encountered an error:", err);
  }
}
