/**
 * Service worker: signs in, labels events, and answers the options page and
 * the content script.
 *
 * Latency path for an event created on the Calendar page:
 * 1. While the user types the title, the page asks `predict` (a cached answer
 *    or one Jev call, about 180 ms).
 * 2. When the new chip appears, the page paints it with the prediction at
 *    once and asks `labelNow`, which writes the label (about 0.4 s, unseen).
 * Background sweeps and polls catch everything else.
 */
import { contentHash, isLabelable, type GEvent } from "../../lib/features";
import { CalendarClient, GoogleApiError, type AccessTokenSource } from "../../lib/google";
import { createJevClient, type JevClient } from "../../lib/jev";
import { applyLabelChanges, labelEvents, rememberLabelBaseline, runForUser } from "../../lib/labeler";
import type { UserRecord } from "../../lib/store";
import { colorIdForLabel, effectiveLabels, type UserLabel } from "../../lib/taxonomy";
import { SignedOutError, currentEmail, getAccessToken, signIn, signOut, tokenExpiresAt } from "./auth";
import type { Paint } from "./paint";
import { addPaints, clearPaints, invalidateLabelColors, paintForLabel, paintFromEvent, paintsSince } from "./paints";
import { cachedPrediction, categoriesVersion, fixedJev, normalizeTitle, predictTitle, rememberPrediction, type Prediction } from "./predict";
import { makeWaker, retryUntilStored, seriesOf, type Waker } from "./retry";
import { clearUser, getSettings, getUser, newUserRecord, putUser, saveSettings, type Settings } from "./store";

const SWEEP_ALARM = "sweep";
const TOKEN_ALARM = "token";

class ChromeTokenSource implements AccessTokenSource {
  getAccessToken(forceRefresh?: boolean) {
    return getAccessToken(forceRefresh);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- Long-lived clients (reset when the worker restarts) ---------- */

let calendarCache: { email: string; client: CalendarClient } | null = null;
/**
 * One client per account. It addresses the primary calendar by its real id
 * (the account email), which saves the lookup that the "primary" alias needs.
 */
function calendarFor(email: string): CalendarClient {
  if (!calendarCache || calendarCache.email !== email) calendarCache = { email, client: new CalendarClient(new ChromeTokenSource(), email) };
  return calendarCache.client;
}

let jevCache: { key: string; client: JevClient } | null = null;
function jevFor(apiKey: string): JevClient {
  if (!jevCache || jevCache.key !== apiKey) jevCache = { key: apiKey, client: createJevClient({ apiKey }) };
  return jevCache.client;
}

/* ---------- Record writes ---------- */

/** Sweeps and polls run one at a time; each loads and saves the record inside. */
let chain: Promise<unknown> = Promise.resolve();
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  const p = chain.then(fn, fn);
  chain = p.catch(() => undefined);
  return p;
}

/**
 * Saves work done outside `exclusive` by merging it onto the stored record,
 * so a sweep that finished in the meantime loses nothing. Never call this
 * from inside `exclusive`.
 */
function persist(user: UserRecord): Promise<void> {
  return exclusive(async () => {
    const fresh = await getUser();
    if (!fresh || fresh.email !== user.email) return; // signed out meanwhile
    fresh.processed = { ...fresh.processed, ...user.processed };
    fresh.labelIds = { ...fresh.labelIds, ...user.labelIds };
    if (user.labelMode !== "unknown") {
      fresh.labelMode = user.labelMode;
      fresh.labelModeReason = user.labelModeReason;
    }
    if (user.labelSynced) fresh.labelSynced = user.labelSynced;
    await putUser(fresh);
  });
}

/** Events the fast path is labeling right now; sweeps leave them alone. */
const inflight = new Set<string>();

let running: Promise<RunResult> | null = null;

export interface RunResult {
  ok: boolean;
  message: string;
  summary?: import("../../lib/store").RunSummary;
}

async function ensureUser(): Promise<UserRecord> {
  const email = await currentEmail();
  if (!email) throw new SignedOutError();
  let user = await getUser();
  if (!user || user.email !== email) {
    let tz = "UTC";
    try {
      tz = await calendarFor(email).getTimeZone();
    } catch {
      // keep UTC
    }
    user = newUserRecord(email, tz);
    await putUser(user);
  }
  return user;
}

/** Shared pieces for one unit of work, or null when signed out. */
async function context() {
  const settings = await getSettings();
  let user: UserRecord;
  try {
    user = await ensureUser();
  } catch {
    return null;
  }
  const calendar = calendarFor(user.email);
  const jev = settings.jevApiKey ? jevFor(settings.jevApiKey) : null;
  const labelerOpts = (applied: Paint[]) => ({
    calendar,
    jev: jev!,
    minConfidence: settings.minConfidence,
    windowPastDays: settings.windowPastDays,
    windowFutureDays: settings.windowFutureDays,
    onApplied: (target: string, label: UserLabel, mode: "labels" | "colors") => applied.push(paintForLabel(target, label, mode)),
    shouldSkip: (target: string) => inflight.has(target),
  });
  return { settings, user, calendar, jev, labelerOpts };
}

/* ---------- Full sweep and server check (inside `exclusive`) ---------- */

async function runOnce(maxClassifications = 200): Promise<RunResult> {
  const settings = await getSettings();
  if (!settings.jevApiKey) return { ok: false, message: "Add your Jev API key in the extension options." };
  const ctx = await context();
  if (!ctx) return { ok: false, message: "Sign in with Google in the extension options." };
  const applied: Paint[] = [];
  try {
    const summary = await runForUser(ctx.user, { ...ctx.labelerOpts(applied), maxClassifications });
    await putUser(ctx.user);
    await addPaints(applied);
    return { ok: true, message: `Labeled ${summary.labeled}, scanned ${summary.scanned}.`, summary };
  } catch (err) {
    await putUser(ctx.user);
    await addPaints(applied);
    return { ok: false, message: err instanceof SignedOutError ? "Sign in again in the extension options." : err instanceof Error ? err.message : String(err) };
  }
}

/** One full run at a time; callers that arrive during a run share its result. */
function run(maxClassifications?: number): Promise<RunResult> {
  if (!running) {
    running = exclusive(() => runOnce(maxClassifications)).finally(() => {
      running = null;
    });
  }
  return running;
}

let lastCheck = 0;
const CHECK_EVERY_MS = 15_000;

/**
 * Looks for events whose color changed on the server since the last check
 * (at most every 15 seconds), records their colors, and labels new events
 * that nobody has labeled yet.
 */
async function serverCheck(): Promise<void> {
  const now = Date.now();
  if (now - lastCheck < CHECK_EVERY_MS) return;
  const ctx = await context();
  if (!ctx) return;
  const updatedMin = new Date((lastCheck || now - 120_000) - 20_000).toISOString();
  lastCheck = now;
  const events = await ctx.calendar.listEvents(
    new Date(now - ctx.settings.windowPastDays * 86_400_000).toISOString(),
    new Date(now + ctx.settings.windowFutureDays * 86_400_000).toISOString(),
    ctx.user.labelMode !== "colors",
    { updatedMin },
  );
  const paints: Paint[] = [];
  const unlabeled: GEvent[] = [];
  for (const e of events) {
    if (e.status === "cancelled") continue;
    const p = await paintFromEvent(e, ctx.calendar);
    if (p) paints.push(p);
    else if (isLabelable(e)) unlabeled.push(e);
  }
  if (unlabeled.length && ctx.jev) await labelEvents(ctx.user, ctx.labelerOpts(paints), unlabeled);
  await putUser(ctx.user);
  await addPaints(paints);
}

/* ---------- Fast path (outside `exclusive`) ---------- */

interface Hint {
  title: string;
  key: string;
}

/**
 * Labels specific events the page just showed. With a hint from the title
 * prediction, the predicted category is written directly (no second Jev
 * call). `waitForCommit` retries while Google has not stored the event yet,
 * because the page can draw the chip before the save completes.
 */
async function labelIds(ids: string[], hint: Hint | null, waitForCommit: boolean): Promise<Paint[]> {
  const ctx = await context();
  if (!ctx || !ids.length) return [];
  const fetchOne = async (id: string): Promise<GEvent | null> => {
    const waits = waitForCommit ? [0, 150, 300, 600, 900, 1200] : [0];
    for (const w of waits) {
      if (w) await sleep(w);
      const e = await ctx.calendar.getEvent(id, ctx.user.labelMode !== "colors").catch(() => null);
      if (e && e.status !== "cancelled") return e;
    }
    return null;
  };
  const events = (await Promise.all(ids.slice(0, 10).map(fetchOne))).filter((e): e is GEvent => Boolean(e));
  const paints: Paint[] = [];
  const hinted: GEvent[] = [];
  const others: GEvent[] = [];
  for (const e of events) {
    if (e.eventLabelId || e.colorId) {
      // Already labeled (by the user, the web app, or a sweep): paint what the server has.
      const p = await paintFromEvent(e, ctx.calendar);
      if (p) paints.push(p);
      continue;
    }
    if (hint && normalizeTitle(e.summary ?? "") === normalizeTitle(hint.title)) hinted.push(e);
    else others.push(e);
  }
  const targets = [...hinted, ...others].map((e) => e.recurringEventId ?? e.id).filter((t) => !inflight.has(t));
  for (const t of targets) inflight.add(t);
  try {
    const labels = effectiveLabels(ctx.user);
    const hintOk = hint && labels.some((l) => l.key === hint.key);
    if (hinted.length && hintOk) await labelEvents(ctx.user, { ...ctx.labelerOpts(paints), jev: fixedJev(hint!.key), shouldSkip: () => false }, hinted.filter((e) => targets.includes(e.recurringEventId ?? e.id)));
    const rest = hintOk ? others : [...hinted, ...others];
    if (rest.length && ctx.jev) await labelEvents(ctx.user, { ...ctx.labelerOpts(paints), shouldSkip: () => false }, rest.filter((e) => targets.includes(e.recurringEventId ?? e.id)));
  } finally {
    for (const t of targets) inflight.delete(t);
  }
  await persist(ctx.user);
  await addPaints(paints);
  return paints;
}

/** Pending fast writes by chip id; "Event saved" on the page wakes them. */
const writers = new Map<string, Waker>();

/**
 * Writes the predicted category to a new event right away. The page draws
 * the chip before Google has stored the event, so the write retries until it
 * lands, and a wake from the "Event saved" toast sends it at once. Returns
 * found: false when the id never turns into an event (a task, for example).
 */
async function writePrediction(id: string, hint: Hint): Promise<{ found: boolean; paints: Paint[] }> {
  const ctx = await context();
  if (!ctx) return { found: true, paints: [] };
  const mode = ctx.user.labelMode === "colors" ? "colors" : "labels";
  const label = effectiveLabels(ctx.user).find((l) => l.key === hint.key);
  if (!label || (mode === "labels" && !ctx.user.labelIds[label.key])) {
    // Categories are not on the calendar yet: take the regular path.
    return { found: true, paints: await labelIds([id], hint, true) };
  }
  const target = seriesOf(id);
  const prev = ctx.user.processed[target];
  if (prev && (prev.r === "cleared" || prev.r === "manual")) return { found: true, paints: [] }; // the user's own choice
  if (inflight.has(target)) return { found: true, paints: [] };
  inflight.add(target);
  const waker = makeWaker();
  writers.set(id, waker);
  try {
    const body = mode === "labels" ? { eventLabelId: ctx.user.labelIds[label.key] } : { colorId: colorIdForLabel(label) };
    const event = await retryUntilStored(async () => {
      try {
        return await ctx.calendar.patchEventReturning(target, body, mode);
      } catch (err) {
        if (err instanceof GoogleApiError && (err.status === 404 || err.status === 410)) return undefined; // not stored yet
        throw err;
      }
    }, waker);
    if (!event) return { found: false, paints: [] };
    ctx.user.processed[target] = { t: new Date().toISOString(), h: contentHash(event), r: label.key };
    const paint = paintForLabel(target, label, mode);
    await persist(ctx.user);
    await addPaints([paint]);
    return { found: true, paints: [paint] };
  } finally {
    inflight.delete(target);
    writers.delete(id);
  }
}

let lastRunAt = 0;
/** A full sweep after a save, at most once a minute (the fast path and the polls do the real work). */
function runSoon() {
  if (Date.now() - lastRunAt < 60_000) return;
  lastRunAt = Date.now();
  void run();
}

async function predict(title: string): Promise<Prediction> {
  if (!normalizeTitle(title)) return { ok: false, confidence: 0 };
  const [settings, user] = await Promise.all([getSettings(), getUser()]);
  if (!settings.jevApiKey || !user) return { ok: false, confidence: 0 };
  const labels = effectiveLabels(user);
  const version = categoriesVersion(labels, user.labelMode);
  const hit = await cachedPrediction(version, title);
  if (hit) return hit;
  const p = await predictTitle(title, labels, jevFor(settings.jevApiKey), settings.minConfidence, (l) => paintForLabel("", l, user.labelMode === "colors" ? "colors" : "labels").color);
  await rememberPrediction(version, title, p);
  return p;
}

/* ---------- Scheduling ---------- */

async function scheduleSweep(settings?: Settings) {
  const s = settings ?? (await getSettings());
  await chrome.alarms.clear(SWEEP_ALARM);
  await chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: Math.max(1, s.sweepMinutes), delayInMinutes: 1 });
}

/** Renews the Google token five minutes before it expires, so no save waits for it. */
async function scheduleTokenRefresh() {
  const expires = await tokenExpiresAt();
  await chrome.alarms.clear(TOKEN_ALARM);
  if (!expires) return;
  await chrome.alarms.create(TOKEN_ALARM, { when: Math.max(Date.now() + 30_000, expires - 5 * 60_000) });
}

chrome.runtime.onInstalled.addListener(() => {
  void scheduleSweep();
  void scheduleTokenRefresh();
});
chrome.runtime.onStartup.addListener(() => {
  void scheduleSweep();
  void scheduleTokenRefresh();
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === SWEEP_ALARM) void run();
  if (alarm.name === TOKEN_ALARM) {
    void getAccessToken(true)
      .catch(() => undefined)
      .finally(() => void scheduleTokenRefresh());
  }
});
chrome.action.onClicked.addListener(() => {
  void chrome.runtime.openOptionsPage();
});

/* ---------- Messages ---------- */

type Message =
  | { type: "status" }
  | { type: "run" }
  | { type: "predict"; title: string }
  | { type: "warm" }
  | { type: "labelNow"; id: string; hint?: Hint; since?: number }
  | { type: "eventSaved"; ids?: string[]; hint?: Hint; since?: number }
  | { type: "paints"; since?: number }
  | { type: "signIn" }
  | { type: "signOut" }
  | { type: "saveSettings"; patch: Partial<Settings> }
  | { type: "saveCategories"; labels: UserLabel[] | undefined };

const REMAPS_KEY = "remaps";
interface Remap {
  from: string;
  to: string;
  at: number;
}

/** What the content script needs to paint: per-event colors, category recolors, and which calendar is ours. */
async function paintPayload(since: number) {
  const [paints, remapsRaw, email] = await Promise.all([paintsSince(since), chrome.storage.session.get(REMAPS_KEY), currentEmail()]);
  const remaps = ((remapsRaw[REMAPS_KEY] as Remap[] | undefined) ?? []).filter((r) => r.at >= since);
  const calendars = email ? [email, email.replace(/@gmail\.com$/, "@m")] : [];
  return { ok: true, paints, remaps, calendars };
}

async function addRemaps(list: Remap[]) {
  if (!list.length) return;
  const r = await chrome.storage.session.get(REMAPS_KEY);
  const now = Date.now();
  const all = [...((r[REMAPS_KEY] as Remap[] | undefined) ?? []), ...list].filter((x) => now - x.at < 6 * 3_600_000).slice(-50);
  await chrome.storage.session.set({ [REMAPS_KEY]: all });
}

async function status() {
  const [email, user, settings] = await Promise.all([currentEmail(), getUser(), getSettings()]);
  return {
    email,
    user: user ? { ...user, refreshTokenEnc: undefined, processed: undefined, processedCount: Object.keys(user.processed).length } : null,
    labels: effectiveLabels(user ?? {}),
    settings: { ...settings, jevApiKey: settings.jevApiKey ? `set (${settings.jevApiKey.slice(0, 10)}…)` : "" },
    hasJevKey: Boolean(settings.jevApiKey),
  };
}

async function handle(msg: Message): Promise<unknown> {
  switch (msg.type) {
    case "status":
      return status();
    case "run":
      return run();
    case "predict":
      return predict(msg.title);
    case "warm": {
      // Open the connections a save will need, while the user is still typing.
      void fetch("https://api.typesafe.ai/v1/systemone", { method: "HEAD" }).catch(() => undefined);
      void fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1", { method: "HEAD" }).catch(() => undefined);
      return { ok: true };
    }
    case "labelNow": {
      let found = true;
      try {
        if (msg.hint) found = (await writePrediction(msg.id, msg.hint)).found;
        else await labelIds([msg.id], null, true);
      } catch {
        // the toast path and the polls will try again
      }
      return { ...(await paintPayload(msg.since ?? 0)), found };
    }
    case "eventSaved": {
      const ids = msg.ids ?? [];
      // Kept for troubleshooting: which chips the page reported after the last save.
      await chrome.storage.session.set({ lastSaved: { ids, at: new Date().toISOString() } });
      // Google has stored the event now: send pending fast writes at once.
      for (const id of ids) writers.get(id)?.wake();
      const rest = ids.filter((id) => !writers.has(id) && !inflight.has(seriesOf(id)));
      try {
        await labelIds(rest, msg.hint ?? null, false);
      } catch {
        // fall through to the sweep and the polls
      }
      runSoon();
      return paintPayload(msg.since ?? 0);
    }
    case "paints": {
      try {
        await exclusive(serverCheck);
      } catch {
        // offline or signed out: answer with what is known
      }
      return paintPayload(msg.since ?? 0);
    }
    case "signIn": {
      const t = await signIn(true);
      const existing = await getUser();
      if (existing && existing.email !== t.email) await clearUser();
      await ensureUser();
      await scheduleSweep();
      await scheduleTokenRefresh();
      return run();
    }
    case "signOut":
      await signOut();
      await clearUser();
      await clearPaints();
      await chrome.alarms.clear(TOKEN_ALARM);
      return { ok: true };
    case "saveSettings": {
      const s = await saveSettings(msg.patch);
      if (msg.patch.sweepMinutes !== undefined) await scheduleSweep(s);
      return { ok: true };
    }
    case "saveCategories":
      return exclusive(async () => {
        const user = await getUser();
        if (!user) return { ok: false, message: "Sign in first." };
        const before = effectiveLabels(user);
        rememberLabelBaseline(user, before);
        user.customLabels = msg.labels;
        user.customColors = undefined;
        await putUser(user);
        const after = effectiveLabels(user);
        const prev = new Map(before.map((l) => [l.key, l]));
        const changed = after.filter((l) => !prev.has(l.key) || prev.get(l.key)!.name !== l.name || prev.get(l.key)!.color !== l.color).map((l) => l.key);
        try {
          const r = await applyLabelChanges(user, calendarFor(user.email), changed);
          await putUser(user);
          invalidateLabelColors();
          // Open Calendar tabs still show the old category colors; tell them to repaint.
          const now = Date.now();
          await addRemaps(after.filter((l) => prev.has(l.key) && prev.get(l.key)!.color.toLowerCase() !== l.color.toLowerCase()).map((l) => ({ from: prev.get(l.key)!.color, to: l.color, at: now })));
          return { ok: true, message: `Saved. ${r.updated} ${user.labelMode === "labels" ? "calendar labels" : "events"} updated.` };
        } catch (err) {
          await putUser(user);
          return { ok: false, message: `Saved, but Google Calendar was not updated. ${err instanceof Error ? err.message : String(err)}` };
        }
      });
    default:
      return { ok: false, message: "unknown message" };
  }
}

chrome.runtime.onMessage.addListener((msg: Message, _sender, sendResponse) => {
  handle(msg)
    .then((r) => sendResponse(r))
    .catch((err) => sendResponse({ ok: false, message: err instanceof Error ? err.message : String(err) }));
  return true; // async response
});

// A worker that starts cold (for example after Chrome restarts) also keeps its token fresh.
void scheduleTokenRefresh();
