/**
 * Recolors Google Calendar event chips in place.
 *
 * Google Calendar's page keeps its own copy of every event and does not pick
 * up a label that another client (this extension, the web app, a phone)
 * applied until the page reloads. This module paints the chip with the new
 * color right away and keeps it painted while the page re-renders, until
 * Google's own copy catches up or someone changes the color by hand.
 *
 * DOM facts it relies on (checked on calendar.google.com, September 2026):
 * - A chip root has `data-eventchip`. Its `data-eventid` is base64 of
 *   "<event id> <calendar>", where recurring instances use "<series>_<time>".
 * - The event color is in inline styles. Week view: `background-color` and
 *   `border-color` on the chip. All-day chips: `background-color` on the
 *   inner button and a border color on an arrow element. Month view timed
 *   events: no background, just a dot drawn with `border-color`.
 * - Past events are drawn as a tint: the fill is 30% color and 70% white,
 *   and the chip's own border is 50% color. Future chips keep the full color.
 * - Text color comes from a class, white on dark colors.
 */

export interface Paint {
  /** event id, or series id for every instance of a recurring event */
  key: string;
  color: string;
  name?: string;
  /** when the color changed on the server (ms since epoch) */
  at: number;
}

type RGBA = [number, number, number, number];

const COLOR_PROPS = ["background-color", "border-color", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color"] as const;
const MARK = "gjlPaint"; // dataset key: the color we painted
const FROM = "gjlFrom"; // dataset key: the color we replaced

export function parseColor(value: string | null | undefined): RGBA | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  let m = v.match(/^#([0-9a-f]{6})$/);
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  m = v.match(/^#([0-9a-f]{3})$/);
  if (m) return [parseInt(m[1][0] + m[1][0], 16), parseInt(m[1][1] + m[1][1], 16), parseInt(m[1][2] + m[1][2], 16), 1];
  m = v.match(/^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [Math.round(+m[1]), Math.round(+m[2]), Math.round(+m[3]), a];
  }
  return null;
}

export function sameColor(a: string | null | undefined, b: string | null | undefined, tolerance = 3): boolean {
  const x = parseColor(a);
  const y = parseColor(b);
  if (!x || !y) return false;
  if (x[3] === 0 || y[3] === 0) return x[3] === y[3];
  return Math.abs(x[0] - y[0]) <= tolerance && Math.abs(x[1] - y[1]) <= tolerance && Math.abs(x[2] - y[2]) <= tolerance;
}

function isVisibleColor(value: string): boolean {
  const c = parseColor(value);
  return Boolean(c && c[3] > 0);
}

/** Dark text on light colors, white text on dark ones. */
export function textColorFor(bg: string): string {
  const c = parseColor(bg);
  if (!c) return "#1f1f1f";
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  return lum > 0.4 ? "#1f1f1f" : "#ffffff";
}

function b64decode(s: string): string | null {
  try {
    const b = s.replace(/-/g, "+").replace(/_/g, "/");
    return atob(b + "=".repeat((4 - (b.length % 4)) % 4));
  } catch {
    return null;
  }
}

/** The event id behind a chip, or null. */
export function chipEventId(chip: Element): string | null {
  const raw = chip.getAttribute("data-eventid");
  if (raw) {
    const decoded = b64decode(raw);
    const id = decoded?.split(" ")[0];
    if (id && /^[A-Za-z0-9_-]+$/.test(id)) return id;
  }
  const log = chip.getAttribute("jslog") ?? "";
  const m = log.match(/2:\["([A-Za-z0-9_-]+)"/);
  return m ? m[1] : null;
}

export const CHIP_SELECTOR = "[data-eventchip]";

export function findChips(root: ParentNode): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(CHIP_SELECTOR)) out.push(root);
  out.push(...Array.from(root.querySelectorAll<HTMLElement>(CHIP_SELECTOR)));
  return out;
}

function chipElements(chip: HTMLElement): HTMLElement[] {
  return [chip, ...Array.from(chip.querySelectorAll<HTMLElement>("*"))];
}

/** Mixes a color with white: `f` is the share of the color (0.3 = light tint). */
export function tint(color: string, f: number): string {
  const c = parseColor(color);
  if (!c) return color;
  const mix = (v: number) => Math.round(255 - (255 - v) * f);
  return `rgb(${mix(c[0])}, ${mix(c[1])}, ${mix(c[2])})`;
}

/** Undoes `tint`, or returns null when the color cannot be a tint of that strength. */
function untint(color: string, f: number): string | null {
  const c = parseColor(color);
  if (!c) return null;
  const out = [0, 1, 2].map((i) => 255 - (255 - c[i]) / f);
  if (out.some((v) => v < -2 || v > 257)) return null;
  const [r, g, b] = out.map((v) => Math.min(255, Math.max(0, Math.round(v))));
  return `rgb(${r}, ${g}, ${b})`;
}

interface Primary {
  el: HTMLElement;
  prop: string;
  value: string;
}

/**
 * The element that carries the event color: the first inline background, or
 * for month-view dots the first inline border color below the chip root.
 */
function findPrimary(chip: HTMLElement): Primary | null {
  const els = chipElements(chip);
  for (const el of els) {
    const v = el.style.getPropertyValue("background-color");
    if (v && isVisibleColor(v)) return { el, prop: "background-color", value: v };
  }
  for (const el of els.slice(1)) {
    for (const prop of ["border-color", "border-top-color", "border-left-color"]) {
      const v = el.style.getPropertyValue(prop);
      if (v && isVisibleColor(v)) return { el, prop, value: v };
    }
  }
  return null;
}

function rootBorder(chip: HTMLElement): string {
  return chip.style.getPropertyValue("border-color") || chip.style.getPropertyValue("border-top-color");
}

/** The untinted color when the chip is drawn as a past event, else null. */
function pastBase(primaryColor: string, border: string): string | null {
  if (!border || sameColor(primaryColor, border)) return null;
  const base = untint(primaryColor, 0.3);
  return base && sameColor(tint(base, 0.5), border, 4) ? base : null;
}

function isOurs(p: Primary): boolean {
  const painted = p.el.dataset[MARK];
  return Boolean(painted) && p.el.style.getPropertyPriority(p.prop) === "important" && sameColor(p.value, painted);
}

/**
 * Recolors a chip. `from` is the color Google drew (possibly a past tint),
 * `to` is the full event color; past chips get the same tint Google uses.
 */
function paintChip(chip: HTMLElement, from: string, fromBorder: string, past: boolean, to: string): void {
  const els = chipElements(chip);
  const fill = past ? tint(to, 0.3) : to;
  const edge = past ? tint(to, 0.5) : to;
  const text = textColorFor(fill);
  const filled: HTMLElement[] = [];
  for (const el of els) {
    for (const prop of COLOR_PROPS) {
      const v = el.style.getPropertyValue(prop);
      if (!v) continue;
      const wasOurs = Boolean(el.dataset[MARK]) && el.style.getPropertyPriority(prop) === "important";
      const original = wasOurs ? (el === chip && prop.startsWith("border") && el.dataset.gjlEdgeFrom ? el.dataset.gjlEdgeFrom : el.dataset[FROM]) : v;
      let next: string | null = null;
      if (sameColor(original, from)) next = fill;
      else if (past && el === chip && prop.startsWith("border") && sameColor(original, fromBorder)) next = edge;
      if (!next) continue;
      el.style.setProperty(prop, next, "important");
      const isEdge = past && el === chip && prop.startsWith("border");
      if (isEdge) el.dataset.gjlEdgeFrom = fromBorder;
      el.dataset[FROM] = from;
      // MARK records the fill we painted; an edge never overwrites a fill mark.
      if (!isEdge || !el.dataset[MARK]) el.dataset[MARK] = next;
      if (prop === "background-color") filled.push(el);
    }
  }
  // Text that sits on a recolored background gets a readable color.
  for (const el of els) {
    if (filled.some((f) => f === el || f.contains(el))) {
      if (!el.dataset.gjlText) el.dataset.gjlTextFrom = `${el.style.getPropertyValue("color")}|${el.style.getPropertyPriority("color")}`;
      el.style.setProperty("color", text, "important");
      el.dataset.gjlText = "1";
    }
  }
  chip.dataset.gjlBase = to;
  chip.dataset.gjlPast = past ? "1" : "";
}

/** Removes our paint from a chip. */
function unpaintChip(chip: HTMLElement): void {
  for (const el of chipElements(chip)) {
    if (el.dataset.gjlText) {
      const [value, priority] = (el.dataset.gjlTextFrom ?? "|").split("|");
      if (value) el.style.setProperty("color", value, priority);
      else el.style.removeProperty("color");
      delete el.dataset.gjlText;
      delete el.dataset.gjlTextFrom;
    }
    const from = el.dataset[FROM];
    if (!from) continue;
    for (const prop of COLOR_PROPS) {
      if (el.style.getPropertyPriority(prop) !== "important") continue;
      const original = el === chip && prop.startsWith("border") && el.dataset.gjlEdgeFrom ? el.dataset.gjlEdgeFrom : from;
      el.style.setProperty(prop, original);
    }
    delete el.dataset[MARK];
    delete el.dataset[FROM];
    delete el.dataset.gjlEdgeFrom;
  }
  delete chip.dataset.gjlBase;
  delete chip.dataset.gjlPast;
}

/** The calendar part of a chip's id: "name@m" for Gmail, the full id otherwise. */
export function chipCalendar(chip: Element): string | null {
  const raw = chip.getAttribute("data-eventid");
  const decoded = raw ? b64decode(raw) : null;
  const token = decoded?.split(" ")[1];
  return token && token.includes("@") ? token : null;
}

export interface Remap {
  from: string;
  to: string;
  at: number;
}

export class Painter {
  private paints = new Map<string, Paint>();
  private remaps: Remap[] = [];
  private calendars: string[] = [];
  /** instance id -> the color Google's page showed when we first painted it */
  private stale = new Map<string, string>();
  /** paint key -> the paint version we stopped applying */
  private done = new Map<string, number>();

  /** Adds paints and remaps. Returns true when something new arrived. */
  update(list: Paint[], remaps: Remap[] = [], calendars?: string[]): boolean {
    let changed = false;
    if (calendars) this.calendars = calendars.map((c) => c.toLowerCase());
    for (const p of list) {
      const prev = this.paints.get(p.key);
      if (prev && prev.at >= p.at && prev.color === p.color) continue;
      this.paints.set(p.key, p);
      changed = true;
    }
    for (const r of remaps) {
      if (this.remaps.some((x) => x.at === r.at && sameColor(x.from, r.from) && sameColor(x.to, r.to))) continue;
      this.remaps.push(r);
      changed = true;
    }
    return changed;
  }

  get size(): number {
    return this.paints.size + this.remaps.length;
  }

  paintFor(id: string): Paint | undefined {
    const exact = this.paints.get(id);
    if (exact) return exact;
    // A recurring instance is "<series id>_<date>" or "<series id>_<date>T<time>Z".
    const m = id.match(/^(.+)_\d{8}(?:T\d{6}Z)?$/);
    return m ? this.paints.get(m[1]) : undefined;
  }

  /** Follows category recolors made after `after`: A to B, then B to C. */
  private follow(color: string, after: number): { color: string; at: number } | null {
    let result: { color: string; at: number } | null = null;
    let cur = color;
    let t = after;
    for (let i = 0; i < 8; i++) {
      const next = this.remaps.filter((r) => r.at > t && sameColor(r.from, cur)).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      cur = next.to;
      t = next.at;
      result = { color: cur, at: t };
    }
    return result;
  }

  private ownCalendar(chip: Element): boolean {
    const token = chipCalendar(chip)?.toLowerCase();
    return Boolean(token && this.calendars.includes(token));
  }

  /** Brings one chip in line with its paint. */
  apply(chip: HTMLElement): "painted" | "kept" | "skipped" | "native" | "released" {
    const id = chipEventId(chip);
    if (!id) return "skipped";
    const primary = findPrimary(chip);
    if (!primary) return "skipped";
    const ours = isOurs(primary);
    // What Google drew: read from our notes when the chip carries our paint.
    const drawn = ours ? (primary.el.dataset[FROM] ?? "") : primary.value;
    const drawnBorder = ours ? (chip.dataset.gjlEdgeFrom ?? rootBorder(chip)) : rootBorder(chip);
    const base = pastBase(drawn, drawnBorder);
    const past = base !== null;
    const native = base ?? drawn; // the full color Google has for the event

    let key: string;
    let color: string;
    let at: number;
    const p = this.paintFor(id);
    if (p) {
      key = p.key;
      color = p.color;
      at = p.at;
      const later = this.follow(color, at); // the category was recolored after the label landed
      if (later) ({ color, at } = later);
    } else {
      if (!this.remaps.length || !this.ownCalendar(chip)) return "skipped";
      const r = this.follow(native, 0);
      if (!r) return "skipped";
      key = `remap:${id}`;
      ({ color, at } = r);
    }

    if ((this.done.get(key) ?? -1) >= at) return "released";
    if (ours) {
      if (sameColor(chip.dataset.gjlBase, color)) return "kept";
      paintChip(chip, drawn, drawnBorder, past, color);
      return "painted";
    }
    if (sameColor(native, color)) {
      // Google's page shows the color itself now.
      this.done.set(key, at);
      return "native";
    }
    const recorded = this.stale.get(id);
    if (recorded && !sameColor(recorded, native)) {
      // The color changed to something else since we painted: someone chose
      // a color by hand. Stop painting this event.
      this.done.set(key, at);
      unpaintChip(chip);
      return "released";
    }
    if (!recorded) this.stale.set(id, native);
    paintChip(chip, drawn, drawnBorder, past, color);
    return "painted";
  }

  /** Drops a paint and restores the chips that carry it (used when a write turns out impossible). */
  forget(key: string, root: ParentNode = document): void {
    this.paints.delete(key);
    this.done.delete(key);
    for (const chip of findChips(root)) {
      const id = chipEventId(chip);
      if (id === key || (id && id.startsWith(`${key}_`))) unpaintChip(chip);
    }
  }

  applyAll(root: ParentNode = document): number {
    if (!this.size) return 0;
    let n = 0;
    for (const chip of findChips(root)) if (this.apply(chip) === "painted") n++;
    return n;
  }

  /**
   * Applies paints as a quick wave across the week (day by day, top to
   * bottom) when many chips change at once, so the change is easy to follow.
   * A single chip is painted at once. The whole wave takes at most `capMs`.
   */
  applyAllStaggered(root: ParentNode = document, stepMs = 28, capMs = 700): void {
    if (!this.size) return;
    const chips = findChips(root).filter((c) => {
      const id = chipEventId(c);
      return Boolean(id && (this.paintFor(id) || this.remaps.length));
    });
    if (chips.length <= 2) {
      for (const c of chips) this.apply(c);
      return;
    }
    const pos = new Map(chips.map((c) => [c, c.getBoundingClientRect()]));
    chips.sort((a, b) => Math.round(pos.get(a)!.left / 40) - Math.round(pos.get(b)!.left / 40) || pos.get(a)!.top - pos.get(b)!.top);
    const step = Math.min(stepMs, capMs / chips.length);
    chips.forEach((c, i) => {
      if (i === 0) this.apply(c);
      else setTimeout(() => c.isConnected && this.apply(c), Math.round(i * step));
    });
  }
}
