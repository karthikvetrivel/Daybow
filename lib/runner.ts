import { decrypt } from "./crypto";
import { readEnv, type Env } from "./env";
import { CalendarClient, RefreshTokenSource } from "./google";
import { createJevClient } from "./jev";
import { runForUser } from "./labeler";
import { patchUser, type RunSummary, type Store, type UserRecord } from "./store";
import { ensureWatch } from "./watch";

/** Wires real Google and Jev clients to the labeler for one stored user. */
export async function labelUser(user: UserRecord, store: Store, opts: { env?: Env; baseUrl?: string; maxClassifications?: number } = {}): Promise<RunSummary> {
  const env = opts.env ?? readEnv();
  const refreshToken = decrypt(user.refreshTokenEnc, env.appSecret);
  const calendar = new CalendarClient(new RefreshTokenSource({ clientId: env.googleClientId, clientSecret: env.googleClientSecret }, refreshToken));
  const jev = createJevClient({ apiKey: env.typesafeApiKey, model: env.jevModel });
  const summary = await runForUser(user, {
    calendar,
    jev,
    minConfidence: env.minConfidence,
    windowPastDays: env.windowPastDays,
    windowFutureDays: env.windowFutureDays,
    maxClassifications: opts.maxClassifications,
  });
  if (opts.baseUrl) {
    try {
      await ensureWatch(user, calendar, opts.baseUrl, env.appSecret);
    } catch (err) {
      summary.errors.push(`watch: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Another writer (a settings save, the webhook, the cron) may have stored the
  // record while this run was in flight. Merge our fields onto the fresh copy.
  const merged = await patchUser(store, user.id, (fresh) => {
    fresh.labelMode = user.labelMode;
    fresh.labelModeReason = user.labelModeReason;
    fresh.labelIds = user.labelIds;
    fresh.lastRun = user.lastRun;
    fresh.watch = user.watch;
    fresh.timeZone = user.timeZone;
    fresh.processed = { ...fresh.processed, ...user.processed };
    fresh.labelSynced = user.labelSynced;
    if (summary.adopted) {
      // Label edits made in Google Calendar were adopted into the categories.
      fresh.customLabels = user.customLabels;
      fresh.customColors = undefined;
    }
  });
  if (!merged) summary.errors.push("record deleted during the run (disconnected); nothing stored");
  return summary;
}
