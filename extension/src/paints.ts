/**
 * Colors that changed on the server recently, for the content script to paint.
 * Kept in chrome.storage.session so they survive service worker restarts but
 * not a browser restart (a fresh page load already shows server colors).
 */
import type { GEvent } from "../../lib/features";
import type { CalendarApi } from "../../lib/google";
import { GOOGLE_EVENT_COLORS, colorIdForLabel, type UserLabel } from "../../lib/taxonomy";
import type { Paint } from "./paint";

const KEY = "paints";
const TTL_MS = 6 * 3_600_000;

// Read from session storage every time: it is in memory, and it stays right
// across service worker restarts.
async function load(): Promise<Map<string, Paint>> {
  const r = await chrome.storage.session.get(KEY);
  return new Map(Object.entries((r[KEY] as Record<string, Paint> | undefined) ?? {}));
}

export async function addPaints(list: Paint[]): Promise<void> {
  if (!list.length) return;
  const m = await load();
  for (const p of list) {
    const prev = m.get(p.key);
    if (!prev || prev.at <= p.at) m.set(p.key, p);
  }
  const now = Date.now();
  for (const [k, p] of m) if (now - p.at > TTL_MS) m.delete(k);
  await chrome.storage.session.set({ [KEY]: Object.fromEntries(m) });
}

export async function paintsSince(since: number): Promise<Paint[]> {
  const m = await load();
  return [...m.values()].filter((p) => p.at >= since);
}

export async function clearPaints(): Promise<void> {
  await chrome.storage.session.remove(KEY);
}

/** The color an applied category shows as on the calendar. */
export function paintForLabel(target: string, label: UserLabel, mode: "labels" | "colors"): Paint {
  const color = mode === "labels" ? label.color : GOOGLE_EVENT_COLORS[colorIdForLabel(label)].hex;
  return { key: target, color, name: label.name, at: Date.now() };
}

let labelCache: { at: number; map: Map<string, { color: string; name?: string }> } | null = null;

/** Forgets the cached label list, after a category edit. */
export function invalidateLabelColors(): void {
  labelCache = null;
}

/** Label id -> color, from the calendar's label list (cached for ten minutes). */
export async function labelColors(calendar: CalendarApi, force = false): Promise<Map<string, { color: string; name?: string }>> {
  if (!force && labelCache && Date.now() - labelCache.at < 600_000) return labelCache.map;
  const cal = await calendar.getCalendar();
  const map = new Map<string, { color: string; name?: string }>();
  for (const l of cal.labelProperties?.eventLabels ?? []) if (l.id && l.backgroundColor) map.set(l.id, { color: l.backgroundColor, name: l.name });
  labelCache = { at: Date.now(), map };
  return map;
}

/** The server's color for an event, when it has a label or a color. */
export async function paintFromEvent(e: GEvent, calendar: CalendarApi): Promise<Paint | null> {
  if (e.status === "cancelled") return null;
  const at = Date.parse(e.updated ?? "") || Date.now();
  if (e.eventLabelId) {
    let map = await labelColors(calendar);
    if (!map.has(e.eventLabelId)) map = await labelColors(calendar, true);
    const l = map.get(e.eventLabelId);
    return l ? { key: e.id, color: l.color, name: l.name, at } : null;
  }
  if (e.colorId && GOOGLE_EVENT_COLORS[e.colorId]) return { key: e.id, color: GOOGLE_EVENT_COLORS[e.colorId].hex, name: GOOGLE_EVENT_COLORS[e.colorId].name, at };
  return null;
}
