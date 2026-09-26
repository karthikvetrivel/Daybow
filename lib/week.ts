/**
 * The sample week that the categories editor draws. Every category shows up
 * as events titled with its example titles, at times that suit it, so the
 * week reads like a real calendar and shows what each category catches.
 */
import type { UserLabel } from "./taxonomy";

export interface WeekEvent {
  key: string;
  title: string;
  /** Minutes after midnight. */
  start: number;
  end: number;
}

export interface WeekDay {
  date: Date;
  today: boolean;
  events: WeekEvent[];
}

interface Slot {
  /** 0 is Monday. */
  day: number;
  start: number;
  mins: number;
}

const at = (h: number, m = 0) => h * 60 + m;

/** Believable days and times for the default categories. */
const SLOTS: Record<string, Slot[]> = {
  meeting: [{ day: 0, start: at(10), mins: 30 }, { day: 2, start: at(14), mins: 60 }, { day: 3, start: at(11), mins: 45 }],
  focus: [{ day: 0, start: at(11), mins: 120 }, { day: 3, start: at(9), mins: 120 }, { day: 4, start: at(13, 30), mins: 90 }],
  fitness: [{ day: 0, start: at(7), mins: 60 }, { day: 2, start: at(18), mins: 60 }, { day: 5, start: at(8), mins: 75 }],
  health: [{ day: 1, start: at(14), mins: 60 }, { day: 3, start: at(8, 30), mins: 45 }, { day: 4, start: at(16, 30), mins: 30 }],
  social: [{ day: 4, start: at(19), mins: 120 }, { day: 2, start: at(19, 30), mins: 90 }, { day: 5, start: at(20), mins: 120 }],
  travel: [{ day: 2, start: at(17, 45), mins: 90 }, { day: 6, start: at(15), mins: 120 }, { day: 3, start: at(6, 15), mins: 150 }],
  family: [{ day: 1, start: at(18), mins: 30 }, { day: 6, start: at(11), mins: 90 }, { day: 5, start: at(17), mins: 60 }],
  personal: [{ day: 1, start: at(16), mins: 30 }, { day: 5, start: at(10, 30), mins: 60 }, { day: 3, start: at(12, 30), mins: 30 }],
  routine: [{ day: 0, start: at(22), mins: 30 }, { day: 2, start: at(7, 30), mins: 30 }, { day: 6, start: at(21, 30), mins: 30 }],
};

/** Times that a title suggests, so that "lunch" does not land at 7:30am. The first match wins. */
const TIME_HINTS: Array<[RegExp, number]> = [
  [/\b(breakfast|morning|wake|sunrise)\b/i, at(7, 30)],
  [/\bbrunch\b/i, at(11)],
  [/\blunch\b/i, at(12)],
  [/\b(dinner|supper)\b/i, at(19)],
  [/\b(drinks|concert|party|movie)\b/i, at(20)],
  [/\b(bed|bedtime|sleep)\b/i, at(22)],
  [/\b(night|evening)\b/i, at(20)],
  [/\b(stay|hotel|inn|check-?in)\b/i, at(15)],
];

function hintedStart(title: string, fallback: number): number {
  return TIME_HINTS.find(([re]) => re.test(title))?.[1] ?? fallback;
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Days and times for a category that has no preset: working hours, spread over the week. */
function genericSlots(key: string, index: number, home?: number): Slot[] {
  const base = hash(key);
  return [0, 1, 2].map((j) => ({
    day: j === 0 && home !== undefined ? home : (index * 3 + j * 2 + (home ?? 0)) % 7,
    start: at(9 + ((base + j * 4) % 9), (base >> 3) % 2 ? 30 : 0),
    mins: 60,
  }));
}

/** How many events each category gets, so a long list of categories still fits. */
export function eventsPerCategory(count: number): number {
  return count > 20 ? 1 : count > 12 ? 2 : 3;
}

/** Monday of the week that contains `now`, at local midnight. */
export function weekStart(now: Date): Date {
  const offset = (now.getDay() + 6) % 7;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
}

/**
 * Lays out the categories as a Monday-to-Sunday week. `home` pins a category's
 * first event to a day, for example the day the user clicked to create it.
 */
export function sampleWeek(labels: UserLabel[], now: Date, home: ReadonlyMap<string, number> = new Map()): WeekDay[] {
  const monday = weekStart(now);
  const todayIndex = (now.getDay() + 6) % 7;
  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => ({
    date: new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i),
    today: i === todayIndex,
    events: [],
  }));
  const per = eventsPerCategory(labels.length);
  labels.forEach((l, index) => {
    const titles = (l.examples.length ? l.examples : [l.name]).slice(0, per);
    const pinned = home.get(l.key);
    const preset = SLOTS[l.key];
    const slots = preset && pinned === undefined ? preset : genericSlots(l.key, index, pinned);
    titles.forEach((title, j) => {
      const s = slots[j % slots.length];
      const start = hintedStart(title, s.start);
      days[s.day].events.push({ key: l.key, title, start, end: Math.min(start + s.mins, at(23, 59)) });
    });
  });
  for (const d of days) d.events.sort((a, b) => a.start - b.start || a.key.localeCompare(b.key));
  return days;
}

function clock(mins: number, suffix: boolean): string {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, "0")}` : ""}${suffix ? (h < 12 ? "am" : "pm") : ""}`;
}

/** A time range in Google Calendar's style: "10 – 10:30am", "11am – 1pm". */
export function formatRange(start: number, end: number): string {
  const sameHalf = start < 720 === end < 720;
  return `${clock(start, !sameHalf)} – ${clock(end, true)}`;
}
