import { randomUUID } from "node:crypto";
import type { CalendarClient } from "./google";
import { GoogleApiError } from "./google";
import { sign } from "./crypto";
import type { UserRecord } from "./store";

const WEEK_MS = 7 * 86_400_000;
const RENEW_BEFORE_MS = 36 * 3_600_000;

/**
 * Keeps one Google push channel per user so a new event is labeled within
 * seconds of being created. Google caps the lifetime, so the daily cron
 * renews channels that expire soon.
 */
export async function ensureWatch(user: UserRecord, calendar: CalendarClient, baseUrl: string, appSecret: string, now = Date.now()): Promise<boolean> {
  if (!baseUrl.startsWith("https://")) return false;
  const current = user.watch;
  if (current && current.expiration - now > RENEW_BEFORE_MS) return false;

  if (current) {
    try {
      await calendar.stopChannel(current.channelId, current.resourceId);
    } catch {
      // Expired or already gone. Nothing to do.
    }
  }
  const channelId = randomUUID();
  const res = await calendar.watchEvents({
    id: channelId,
    address: `${baseUrl}/api/webhook/google`,
    token: sign(user.id, appSecret),
    expiration: now + WEEK_MS,
  });
  user.watch = {
    channelId: res.id,
    resourceId: res.resourceId,
    expiration: res.expiration ? Number(res.expiration) : now + WEEK_MS,
  };
  return true;
}

export async function stopWatch(user: UserRecord, calendar: CalendarClient): Promise<void> {
  if (!user.watch) return;
  try {
    await calendar.stopChannel(user.watch.channelId, user.watch.resourceId);
  } catch (err) {
    if (!(err instanceof GoogleApiError)) throw err;
  }
  user.watch = undefined;
}
