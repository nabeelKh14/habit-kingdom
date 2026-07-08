import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock the native SDKs so tests never touch real network / native modules.
const sentryInit = vi.fn();
const sentryCaptureException = vi.fn();
const sentrySetUser = vi.fn();
const sentryAddBreadcrumb = vi.fn();
const posthogCapture = vi.fn();
const posthogIdentify = vi.fn();
const posthogReset = vi.fn();
const posthogCtor = vi.fn().mockImplementation(() => ({
  capture: (...a: any[]) => posthogCapture(...a),
  identify: (...a: any[]) => posthogIdentify(...a),
  reset: (...a: any[]) => posthogReset(...a),
}));

vi.mock("@sentry/react-native", () => ({
  default: {
    init: (...a: any[]) => sentryInit(...a),
    captureException: (...a: any[]) => sentryCaptureException(...a),
    setUser: (...a: any[]) => sentrySetUser(...a),
    addBreadcrumb: (...a: any[]) => sentryAddBreadcrumb(...a),
  },
  init: (...a: any[]) => sentryInit(...a),
  captureException: (...a: any[]) => sentryCaptureException(...a),
  setUser: (...a: any[]) => sentrySetUser(...a),
  addBreadcrumb: (...a: any[]) => sentryAddBreadcrumb(...a),
}));

vi.mock("posthog-react-native", () => ({
  default: posthogCtor,
}));

describe("monitoring integration", () => {
  beforeEach(() => {
    // Provide real-looking keys so init actually runs in tests.
    process.env.EXPO_PUBLIC_SENTRY_DSN = "https://test@o0.ingest.sentry.io/1";
    process.env.EXPO_PUBLIC_POSTHOG_KEY = "phc_testkey";
    // Fresh module state per test so `initialized` flags don't leak.
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
  });

  it("initMonitoring boots both Sentry and PostHog when keys are set", async () => {
    const { initMonitoring } = await import("../../lib/monitoring");
    await initMonitoring();
    expect(sentryInit).toHaveBeenCalledTimes(1);
    expect(posthogCtor).toHaveBeenCalledTimes(1);
  });

  it("captureError forwards to Sentry after init", async () => {
    const { initMonitoring } = await import("../../lib/monitoring");
    await initMonitoring();
    const { captureError } = await import("../../lib/sentry");
    captureError(new Error("boom"));
    // allow dynamic import microtask to flush
    await new Promise((r) => setTimeout(r, 10));
    expect(sentryCaptureException).toHaveBeenCalled();
  });

  it("setSentryUser truncates the id (PII safety)", async () => {
    const { initMonitoring } = await import("../../lib/monitoring");
    await initMonitoring();
    const { setSentryUser } = await import("../../lib/sentry");
    setSentryUser("abcdef1234567890");
    await new Promise((r) => setTimeout(r, 10));
    expect(sentrySetUser).toHaveBeenCalledWith({ id: "abcdef12" });
  });

  it("trackEvent forwards to PostHog after init", async () => {
    const { initMonitoring } = await import("../../lib/monitoring");
    await initMonitoring();
    const { trackEvent } = await import("../../lib/analytics");
    trackEvent("habit_completed", { count: 1 });
    await new Promise((r) => setTimeout(r, 10));
    expect(posthogCapture).toHaveBeenCalledWith("habit_completed", { count: 1 });
  });

  it("identifyUser truncates the id and sends no PII", async () => {
    const { initMonitoring } = await import("../../lib/monitoring");
    await initMonitoring();
    const { identifyUser } = await import("../../lib/analytics");
    identifyUser("user-abcdef1234567890");
    await new Promise((r) => setTimeout(r, 10));
    expect(posthogIdentify).toHaveBeenCalledWith("user-abc", {});
  });

  it("no-ops cleanly when keys are absent", async () => {
    // Delete keys BEFORE importing so the modules see an unconfigured state.
    delete process.env.EXPO_PUBLIC_SENTRY_DSN;
    delete process.env.EXPO_PUBLIC_POSTHOG_KEY;
    vi.resetModules();
    // Fresh imports see no keys.
    const { captureError } = await import("../../lib/sentry");
    const { trackEvent } = await import("../../lib/analytics");
    // Should not throw even though nothing is initialized.
    expect(() => captureError("x")).not.toThrow();
    expect(() => trackEvent("y")).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
    expect(sentryCaptureException).not.toHaveBeenCalled();
    expect(posthogCapture).not.toHaveBeenCalled();
  });
});
