import type { Express, Request, Response } from "express";

/**
 * Push notification routes and delivery engine for Habit Kingdom.
 * Integrates with Expo Push Notifications service via exp.host/--/api/v2/push/send.
 *
 * Architecture:
 * - Client registers Expo push token → server stores in memory (Supabase in production)
 * - Server sends push via Expo Push API when habits are due
 * - Background job scans habits periodically and sends reminders
 * - Token invalidation on delivery failure (invalidated tokens get cleaned up)
 */

// =========================================================================
// IN-MEMORY PUSH TOKEN STORE (replaced by push_tokens table in production)
// =========================================================================
interface PushTokenRecord {
  token: string;
  platform: "ios" | "android";
  registeredAt: string;
  isActive: boolean;
  lastError: string | null;
}

const pushTokens = new Map<string, PushTokenRecord[]>(); // userId -> tokens[]

function getUserTokens(userId: string): PushTokenRecord[] {
  return pushTokens.get(userId) ?? [];
}

function addToken(userId: string, record: PushTokenRecord): void {
  const tokens = getUserTokens(userId);
  // Deduplicate — same user + platform = replace
  const filtered = tokens.filter(t => t.platform !== record.platform);
  filtered.push(record);
  pushTokens.set(userId, filtered);
}

function invalidateToken(userId: string, token: string, error: string): void {
  const tokens = getUserTokens(userId);
  const updated = tokens.map(t =>
    t.token === token ? { ...t, isActive: false, lastError: error } : t
  );
  pushTokens.set(userId, updated);
}

// =========================================================================
// FCM (Firebase Cloud Messaging) token detection
// =========================================================================
function isFCMToken(token: string): boolean {
  // FCM tokens are longer and follow a specific pattern
  return token.length > 100 && /^[a-zA-Z0-9_-]+:APA91b/.test(token);
}

// =========================================================================
// EXPO PUSH API INTEGRATION
// =========================================================================
const EXPO_PUSH_API = "https://exp.host/--/api/v2/push/send";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority?: "default" | "high";
  sound?: "default" | null;
  badge?: number;
}

interface ExpoPushReceipt {
  status: "ok" | "error";
  message?: string;
  details?: {
    error?: "DeviceNotRegistered" | "MessageTooBig" | "MessageRateExceeded" | "InvalidCredentials";
    sentTime?: string;
  };
}

async function sendExpoPush(payload: ExpoPushMessage): Promise<boolean> {
  try {
    const response = await fetch(EXPO_PUSH_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        to: payload.to,
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        priority: payload.priority ?? "default",
        sound: payload.sound ?? "default",
        badge: payload.badge,
      }),
    });

    const result = await response.json();
    const ticket = result?.data;

    if (!response.ok) {
      console.error("[Push] Expo API returned non-ok:", response.status, result);
      return false;
    }

    // Expo returns an array of ticket objects; for single pushes it's a single ticket
    if (ticket?.status === "error") {
      console.error("[Push] Expo push ticket error:", ticket);
      return false;
    }

    return true;
  } catch (err) {
    console.error("[Push] Network error sending push:", err);
    return false;
  }
}

/**
 * Send push notification to a specific user. Looks up all their active tokens
 * and sends to each. Invalidates tokens that fail due to device unregistration.
 */
export async function sendNotificationToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ success: boolean; sentTo: number; errors: number }> {
  const tokens = getUserTokens(userId).filter(t => t.isActive);

  if (tokens.length === 0) {
    console.log(`[Push] No active tokens for user ${userId}`);
    return { success: false, sentTo: 0, errors: 0 };
  }

  let sentTo = 0;
  let errors = 0;

  for (const record of tokens) {
    const success = await sendExpoPush({
      to: record.token,
      title,
      body,
      data: { ...data, userId },
      priority: "high",
      sound: "default",
    });

    if (success) {
      sentTo++;
    } else {
      errors++;
      // Mark token as potentially invalid — will be cleaned up on next registration
      invalidateToken(userId, record.token, "delivery_failed");
    }
  }

  console.log(`[Push] Sent to ${sentTo}/${tokens.length} tokens for user ${userId} (${errors} failed)`);
  return { success: sentTo > 0, sentTo, errors };
}

// =========================================================================
// HABIT REMINDER BACKGROUND SCANNER
// =========================================================================
interface HabitForReminder {
  id: string;
  name: string;
  notificationTime: string; // "HH:MM"
  frequency: "once" | "daily" | "weekly" | "monthly";
  profileId: string;
}

const MOTIVATIONAL_MESSAGES = [
  "Time to build a great habit! 🌟",
  "Your future self will thank you! 💪",
  "Don't break the streak! 🔥",
  "You've got this! ⭐",
  "Building habits, one day at a time! 🎯",
  "Keep up the amazing work! 🚀",
  "Make today count! ✨",
];

// In production: query Supabase for habits due in the current time window
// For now we expose this as a callable endpoint
let cachedHabits: HabitForReminder[] = [];

export function setCachedHabits(habits: HabitForReminder[]): void {
  cachedHabits = habits;
}

/**
 * Scan habits due for reminders in the current hour window (+/- 5 minutes).
 * Called by a cron job or on-demand endpoint.
 */
export async function scanHabitReminders(): Promise<{
  scanned: number;
  sent: number;
  errors: number;
}> {
  const now = new Date();
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();

  // Habit reminders fire within a 5-minute window of their scheduled time
  const MINUTE_WINDOW = 5;

  const due = cachedHabits.filter(h => {
    const [hStr, mStr] = h.notificationTime.split(":");
    const habitHour = parseInt(hStr, 10);
    const habitMinute = parseInt(mStr, 10);
    return habitHour === currentHour && Math.abs(habitMinute - currentMinute) <= MINUTE_WINDOW;
  });

  let sent = 0;
  let errors = 0;

  for (const habit of due) {
    const message = MOTIVATIONAL_MESSAGES[Math.floor(Math.random() * MOTIVATIONAL_MESSAGES.length)];
    const result = await sendNotificationToUser(
      habit.profileId,
      `🔔 ${habit.name}`,
      message,
      { habitId: habit.id, type: "habit_reminder" }
    );
    if (result.success) sent++; else errors++;
  }

  return { scanned: due.length, sent, errors };
}

// =========================================================================
// ROUTE REGISTRATION
// =========================================================================
export function registerNotificationRoutes(
  app: Express,
  prefix: string,
  authenticate: (req: Request, res: Response, next: any) => void
) {
  // Register device push token
  app.post(`${prefix}/notifications/register`, authenticate, async (req: Request, res: Response) => {
    try {
      const { token, platform } = req.body;
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json({ error: "UNAUTHORIZED", message: "Authentication required" });
        return;
      }

      if (!token || typeof token !== "string") {
        res.status(400).json({ error: "INVALID_INPUT", message: "Push token is required" });
        return;
      }

      if (!platform || !["ios", "android"].includes(platform)) {
        res.status(400).json({ error: "INVALID_INPUT", message: "Platform must be 'ios' or 'android'" });
        return;
      }

      // Detect actual token type (Expo vs FCM)
      const actualPlatform = isFCMToken(token)
        ? "android" // FCM tokens are always android
        : platform;

      const record: PushTokenRecord = {
        token,
        platform: actualPlatform,
        registeredAt: new Date().toISOString(),
        isActive: true,
        lastError: null,
      };

      addToken(userId, record);
      console.log(`[Notifications] Token registered: user=${userId} platform=${actualPlatform} token_prefix=${token.slice(0, 12)}`);

      // In production: also upsert into push_tokens table in Supabase
      // await supabase.from("push_tokens").upsert({
      //   profile_id: userId,
      //   token,
      //   platform: actualPlatform,
      //   is_valid: true,
      // });

      res.json({ success: true, tokenCount: getUserTokens(userId).length });
    } catch (err: any) {
      console.error("[Notifications] Register error:", err);
      res.status(500).json({ error: "REGISTER_FAILED", message: "Failed to register push token" });
    }
  });

  // Unregister device push token (on sign-out or app uninstall)
  app.delete(`${prefix}/notifications/unregister`, authenticate, async (req: Request, res: Response) => {
    try {
      const { token } = req.query;
      const userId = (req as any).user?.userId;

      if (!userId) {
        res.status(401).json({ error: "UNAUTHORIZED" });
        return;
      }

      if (token && typeof token === "string") {
        invalidateToken(userId, token, "user_unregistered");
      } else {
        // No token specified → clear all
        pushTokens.delete(userId);
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("[Notifications] Unregister error:", err);
      res.status(500).json({ error: "UNREGISTER_FAILED", message: "Failed to unregister push token" });
    }
  });

  // Send notification to a specific user (admin/parent use)
  app.post(`${prefix}/notifications/send`, authenticate, async (req: Request, res: Response) => {
    try {
      const { title, body, data } = req.body;
      const userId = (req as any).user?.userId;

      if (!userId || !title || !body) {
        res.status(400).json({ error: "INVALID_INPUT", message: "userId, title, and body are required" });
        return;
      }

      const result = await sendNotificationToUser(userId, title, body, data);
      res.json({
        success: result.success,
        sentTo: result.sentTo,
        errors: result.errors,
        sentAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[Notifications] Send error:", err);
      res.status(500).json({ error: "SEND_FAILED", message: "Failed to send notification" });
    }
  });

  // Schedule a notification for future delivery
  app.post(`${prefix}/notifications/schedule`, authenticate, async (req: Request, res: Response) => {
    try {
      const { userId, title, body, scheduleAt } = req.body;

      if (!userId || !title || !body || !scheduleAt) {
        res.status(400).json({ error: "INVALID_INPUT", message: "userId, title, body, and scheduleAt are required" });
        return;
      }

      const when = new Date(scheduleAt);
      if (isNaN(when.getTime())) {
        res.status(400).json({ error: "INVALID_DATE", message: "scheduleAt must be a valid ISO date" });
        return;
      }

      const delayMs = when.getTime() - Date.now();
      if (delayMs < 0) {
        res.status(400).json({ error: "INVALID_DATE", message: "scheduleAt must be in the future" });
        return;
      }

      // Schedule in-process (in production: enqueue in a job system like Bull/BullMQ)
      setTimeout(() => {
        sendNotificationToUser(userId, title, body).catch(err =>
          console.error("[Push] Scheduled delivery failed:", err)
        );
      }, delayMs);

      console.log(`[Notifications] Scheduled for ${userId} at ${when.toISOString()} (in ${Math.round(delayMs / 1000)}s)`);
      res.json({ success: true, scheduledAt: when.toISOString(), delaySeconds: Math.round(delayMs / 1000) });
    } catch (err: any) {
      console.error("[Notifications] Schedule error:", err);
      res.status(500).json({ error: "SCHEDULE_FAILED", message: "Failed to schedule notification" });
    }
  });

  // Trigger habit reminder scan (called by cron or on-demand)
  app.post(`${prefix}/notifications/scan-habits`, authenticate, async (_req: Request, res: Response) => {
    try {
      const result = await scanHabitReminders();
      res.json({
        success: true,
        ...result,
        scannedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[Notifications] Scan error:", err);
      res.status(500).json({ error: "SCAN_FAILED", message: "Failed to scan habit reminders" });
    }
  });

  // Get reminder preferences for the authenticated user
  app.get(`${prefix}/notifications/reminders`, authenticate, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.userId;
      // In production: load from notification_settings table
      res.json({
        userId,
        middayEnabled: true,
        middayTime: "12:00",
        nightEnabled: false,
        nightTime: "21:00",
        timezone: "UTC",
        lastUpdated: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[Notifications] Reminders error:", err);
      res.status(500).json({ error: "GET_FAILED", message: "Failed to get reminder preferences" });
    }
  });

  // Update reminder preferences
  app.put(`${prefix}/notifications/reminders`, authenticate, async (req: Request, res: Response) => {
    try {
      const { middayEnabled, middayTime, nightEnabled, nightTime, timezone } = req.body;
      const userId = (req as any).user?.userId;

      console.log(`[Notifications] Reminder update for ${userId}:`, {
        middayEnabled, middayTime, nightEnabled, nightTime, timezone,
      });

      // In production: upsert into notification_settings table
      res.json({
        success: true,
        userId,
        middayEnabled: middayEnabled ?? true,
        middayTime: middayTime ?? "12:00",
        nightEnabled: nightEnabled ?? false,
        nightTime: nightTime ?? "21:00",
        timezone: timezone ?? "UTC",
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("[Notifications] Update reminders error:", err);
      res.status(500).json({ error: "UPDATE_FAILED", message: "Failed to update reminder preferences" });
    }
  });
}

// Export for use in background jobs
export { getUserTokens, sendExpoPush, isFCMToken };