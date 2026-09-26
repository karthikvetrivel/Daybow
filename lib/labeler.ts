import { buildState, contentHash, isLabelable, type GEvent } from "./features";
import { GoogleApiError, type CalendarApi, type GLabel } from "./google";
import type { JevClient } from "./jev";
import type { RunSummary, UserRecord } from "./store";
import { colorIdForLabel, criteriaFor, effectiveLabels, type UserLabel } from "./taxonomy";

export interface LabelerOptions {
  calendar: CalendarApi;
  jev: JevClient;
  minConfidence: number;
  windowPastDays: number;
  windowFutureDays: number;
  now?: () => Date;
  concurrency?: number;
  /** Upper bound on Jev calls per run, soonest events first. */
  maxClassifications?: number;
  log?: (line: string) => void;
  /** Called after a label lands on an event (target is the event id, or the series id for a recurring event). */
  onApplied?: (target: string, label: UserLabel, mode: "labels" | "colors") => void;
  /** Events another worker is labeling right now; they are left alone. */
  shouldSkip?: (target: string) => boolean;
}

const MAX_LABELS_PER_CALENDAR = 200;
const PROCESSED_TTL_DAYS = 120;

/**
 * Records the categories as they are before a local edit, so the next sync
 * can tell a local edit (push it to Google) from an edit made in Google
 * Calendar (adopt it). Call it before replacing the categories.
 */
export function rememberLabelBaseline(user: UserRecord, before: UserLabel[]): void {
  const synced = (user.labelSynced ??= {});
  for (const l of before) synced[l.key] ??= { name: l.name, color: l.color.toLowerCase() };
}

export async function ensureLabels(user: UserRecord, calendar: CalendarApi): Promise<"labels" | "colors"> {
  const r = await syncLabels(user, calendar);
  return r.mode;
}

/**
 * Makes the calendar's named labels and the user's categories agree.
 * - A category without a Google label gets one.
 * - A label edited in Google Calendar (name or color differs from the last
 *   agreed state while the category did not change) is adopted into the
 *   category.
 * - A category edited here is pushed to its Google label.
 * Labels the user removed from the categories stay on the calendar untouched.
 * Falls back to legacy colors when the account cannot use named labels.
 */
export async function syncLabels(user: UserRecord, calendar: CalendarApi): Promise<{ mode: "labels" | "colors"; changed: number; adopted: number }> {
  if (user.labelMode === "colors") return { mode: "colors", changed: 0, adopted: 0 };
  const wanted = effectiveLabels(user).map((l) => ({ ...l, color: l.color.toLowerCase() }));
  try {
    const cal = await calendar.getCalendar();
    const existing: GLabel[] = (cal.labelProperties?.eventLabels ?? []).map((l) => ({ ...l }));
    const byId = new Map(existing.filter((l) => l.id).map((l) => [l.id!, l]));
    const byName = new Map(existing.filter((l) => l.name).map((l) => [l.name!.trim().toLowerCase(), l]));
    const synced = user.labelSynced ?? {};
    const nextSynced: Record<string, { name: string; color: string }> = {};
    let changed = 0;
    let adopted = 0;
    const claimed = new Set<string>();
    for (const w of wanted) {
      let g = byId.get(user.labelIds[w.key] ?? "");
      if (!g || claimed.has(g.id!)) g = byName.get(w.name.toLowerCase());
      if (g && claimed.has(g.id!)) g = undefined;
      if (!g) {
        g = { id: globalThis.crypto.randomUUID(), name: w.name, backgroundColor: w.color };
        existing.push(g);
        changed++;
      } else {
        const gName = (g.name ?? "").trim();
        const gColor = (g.backgroundColor ?? "").toLowerCase();
        const s = synced[w.key];
        const remoteDiffers = gName !== w.name || gColor !== w.color;
        const localEdited = s ? s.name !== w.name || s.color !== w.color : false;
        const remoteEdited = s ? gName !== s.name || gColor !== s.color : remoteDiffers;
        if (remoteDiffers && remoteEdited && !localEdited) {
          // Edited in Google Calendar: take the edit.
          if (gName) w.name = gName;
          if (/^#[0-9a-f]{6}$/.test(gColor)) w.color = gColor;
          adopted++;
        }
        if ((g.name ?? "") !== w.name) {
          g.name = w.name;
          changed++;
        }
        if ((g.backgroundColor ?? "").toLowerCase() !== w.color) {
          g.backgroundColor = w.color;
          changed++;
        }
      }
      claimed.add(g.id!);
      user.labelIds[w.key] = g.id!;
      nextSynced[w.key] = { name: w.name, color: w.color };
    }
    if (existing.length > MAX_LABELS_PER_CALENDAR) {
      user.labelMode = "colors";
      user.labelModeReason = `calendar already has ${existing.length} labels (limit ${MAX_LABELS_PER_CALENDAR})`;
      return { mode: "colors", changed: 0, adopted: 0 };
    }
    if (changed) {
      await calendar.setLabels(existing);
      const after = (await calendar.getCalendar()).labelProperties?.eventLabels ?? existing;
      const afterByName = new Map(after.filter((l) => l.name).map((l) => [l.name!.trim().toLowerCase(), l]));
      for (const w of wanted) {
        const id = afterByName.get(w.name.toLowerCase())?.id ?? user.labelIds[w.key];
        if (!id) throw new GoogleApiError(500, `label "${w.name}" missing after patch`, "labels");
        user.labelIds[w.key] = id;
      }
    }
    if (adopted) {
      user.customLabels = wanted.map((w) => ({ ...w }));
      user.customColors = undefined;
    }
    // Forget ids of categories the user removed so they are not reused by accident.
    for (const key of Object.keys(user.labelIds)) if (!wanted.some((w) => w.key === key)) delete user.labelIds[key];
    user.labelSynced = nextSynced;
    user.labelMode = "labels";
    user.labelModeReason = undefined;
    return { mode: "labels", changed, adopted };
  } catch (err) {
    if (err instanceof GoogleApiError && (err.status === 400 || err.status === 403 || err.status === 404)) {
      user.labelMode = "colors";
      user.labelModeReason = `${err.status} from Google: ${err.body.replace(/\s+/g, " ").slice(0, 160)}`;
      return { mode: "colors", changed: 0, adopted: 0 };
    }
    throw err;
  }
}

interface Candidate {
  target: string;
  event: GEvent;
  hash: string;
}

/** Groups instances by their recurring master so a series is labeled once. */
export function pickCandidates(events: GEvent[]): Candidate[] {
  const seen = new Set<string>();
  const out: Candidate[] = [];
  for (const e of events) {
    if (!isLabelable(e)) continue;
    const target = e.recurringEventId ?? e.id;
    if (seen.has(target)) continue;
    seen.add(target);
    out.push({ target, event: e, hash: contentHash(e) });
  }
  return out;
}

export async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

function patchBodyFor(label: UserLabel, user: UserRecord, mode: "labels" | "colors") {
  return mode === "labels" ? { eventLabelId: user.labelIds[label.key] } : { colorId: colorIdForLabel(label) };
}

function emptySummary(now: Date, mode: "labels" | "colors"): RunSummary {
  return {
    at: now.toISOString(),
    durationMs: 0,
    mode,
    scanned: 0,
    candidates: 0,
    classified: 0,
    labeled: 0,
    lowConfidence: 0,
    alreadyLabeled: 0,
    labeledByKey: {},
    errors: [],
  };
}

/**
 * Decides which candidates still need a label, applying the rules that
 * respect manual changes. Updates `processed` for the ones it skips.
 */
function triage(user: UserRecord, candidates: Candidate[], mode: "labels" | "colors", nowIso: string, summary: RunSummary): Candidate[] {
  const out: Candidate[] = [];
  for (const c of candidates) {
    summary.candidates++;
    const e = c.event;
    const hasLabel = mode === "labels" ? Boolean(e.eventLabelId) : Boolean(e.colorId);
    const prev = user.processed[c.target];
    if (hasLabel) {
      summary.alreadyLabeled++;
      if (!prev) user.processed[c.target] = { t: nowIso, h: c.hash, r: "manual" };
      continue;
    }
    if (prev && prev.h === c.hash) {
      // Same content as when we last decided. Only act if we never labeled it.
      if (prev.r === "skip" || prev.r === "cleared" || prev.r === "manual") continue;
      // We labeled it and the label is gone: the user removed it. Respect that.
      user.processed[c.target] = { ...prev, r: "cleared" };
      continue;
    }
    out.push(c);
  }
  return out;
}

/** Classifies each candidate with Jev and applies the chosen label. */
async function classifyAndApply(user: UserRecord, opts: LabelerOptions, mode: "labels" | "colors", batch: Candidate[], nowIso: string, summary: RunSummary): Promise<void> {
  const log = opts.log ?? (() => {});
  const labels = effectiveLabels(user);
  const byKey = new Map(labels.map((l) => [l.key, l]));
  const criteria = criteriaFor(labels);
  await pool(batch, opts.concurrency ?? 6, async (c) => {
    const state = buildState(c.event, { userEmail: user.email, timeZone: user.timeZone });
    let answer;
    try {
      answer = await opts.jev.classify(state, criteria);
    } catch (err) {
      summary.errors.push(`classify ${c.target}: ${err instanceof Error ? err.message : String(err)}`);
      return;
    }
    summary.classified++;
    const label = byKey.get(answer.label);
    if (!label || answer.confidence < opts.minConfidence) {
      summary.lowConfidence++;
      user.processed[c.target] = { t: nowIso, h: c.hash, r: "skip" };
      log(`skip  ${c.event.summary ?? c.target} -> ${answer.label} (${answer.confidence.toFixed(2)})`);
      return;
    }
    try {
      await opts.calendar.patchEvent(c.target, patchBodyFor(label, user, mode), mode);
      user.processed[c.target] = { t: nowIso, h: c.hash, r: label.key };
      summary.labeled++;
      summary.labeledByKey[label.key] = (summary.labeledByKey[label.key] ?? 0) + 1;
      log(`label ${c.event.summary ?? c.target} -> ${label.name} (${answer.confidence.toFixed(2)})`);
      opts.onApplied?.(c.target, label, mode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`patch ${c.target}: ${msg}`);
      if (err instanceof GoogleApiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
        user.processed[c.target] = { t: nowIso, h: c.hash, r: "skip" };
      }
    }
  });
}

export async function runForUser(user: UserRecord, opts: LabelerOptions): Promise<RunSummary> {
  const now = (opts.now ?? (() => new Date()))();
  const started = Date.now();
  const log = opts.log ?? (() => {});
  const sync = await syncLabels(user, opts.calendar);
  const mode = sync.mode;
  const summary = emptySummary(now, mode);
  if (sync.adopted) summary.adopted = sync.adopted;

  const timeMin = new Date(now.getTime() - opts.windowPastDays * 86_400_000).toISOString();
  const timeMax = new Date(now.getTime() + opts.windowFutureDays * 86_400_000).toISOString();
  const events = await opts.calendar.listEvents(timeMin, timeMax, mode === "labels");
  summary.scanned = events.length;

  const nowIso = now.toISOString();
  const candidates = pickCandidates(events).filter((c) => !opts.shouldSkip?.(c.target));
  const toClassify = triage(user, candidates, mode, nowIso, summary);
  const limit = opts.maxClassifications ?? 400;
  const batch = toClassify.slice(0, limit);
  if (toClassify.length > limit) log(`deferring ${toClassify.length - limit} events to the next run`);
  await classifyAndApply(user, opts, mode, batch, nowIso, summary);

  pruneProcessed(user, now);
  summary.durationMs = Date.now() - started;
  user.lastRun = summary;
  return summary;
}

/**
 * Labels specific events that were just created or changed, without listing
 * the whole date window. Used when the page reports a save, so the label
 * lands about a second later. Does not replace `lastRun`.
 */
export async function labelEvents(user: UserRecord, opts: LabelerOptions, events: GEvent[]): Promise<RunSummary> {
  const now = (opts.now ?? (() => new Date()))();
  const started = Date.now();
  const mode = user.labelMode === "labels" && Object.keys(user.labelIds).length ? "labels" : (await syncLabels(user, opts.calendar)).mode;
  const summary = emptySummary(now, mode);
  summary.scanned = events.length;
  const nowIso = now.toISOString();
  const candidates = pickCandidates(events).filter((c) => !opts.shouldSkip?.(c.target));
  const batch = triage(user, candidates, mode, nowIso, summary);
  await classifyAndApply(user, opts, mode, batch, nowIso, summary);
  summary.durationMs = Date.now() - started;
  return summary;
}

export function pruneProcessed(user: UserRecord, now: Date): void {
  const cutoff = now.getTime() - PROCESSED_TTL_DAYS * 86_400_000;
  for (const [id, entry] of Object.entries(user.processed)) {
    if (new Date(entry.t).getTime() < cutoff) delete user.processed[id];
  }
}

/**
 * Pushes category edits to Google. In labels mode the labels themselves are
 * renamed, recolored, or created, so every event carrying them updates at
 * once. In colors mode every event this app colored with a changed category
 * is patched again.
 */
export async function applyLabelChanges(user: UserRecord, calendar: CalendarApi, changedKeys: string[]): Promise<{ updated: number; errors: string[] }> {
  const errors: string[] = [];
  if (user.labelMode !== "colors") {
    const r = await syncLabels(user, calendar);
    if (r.mode === "labels") return { updated: r.changed, errors };
  }
  const byKey = new Map(effectiveLabels(user).map((l) => [l.key, l]));
  const targets = Object.entries(user.processed).filter(([, p]) => changedKeys.includes(p.r) && byKey.has(p.r));
  let updated = 0;
  await pool(targets, 6, async ([id, p]) => {
    try {
      await calendar.patchEvent(id, { colorId: colorIdForLabel(byKey.get(p.r)!) }, "colors");
      updated++;
    } catch (err) {
      errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  });
  return { updated, errors };
}
