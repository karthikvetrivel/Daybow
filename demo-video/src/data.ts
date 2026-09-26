/** The demo week, the categories, and the calendar's geometry. Everything is fictional. */

export type Key = "meeting" | "focus" | "fitness" | "health" | "social" | "travel" | "family" | "personal" | "routine";

export const CATEGORIES: { key: Key; name: string; color: string }[] = [
  { key: "meeting", name: "Meeting", color: "#a8d1ff" },
  { key: "focus", name: "Focus", color: "#c9c1ff" },
  { key: "fitness", name: "Fitness", color: "#b5ead7" },
  { key: "health", name: "Health", color: "#ffb7b2" },
  { key: "social", name: "Social", color: "#ffe08a" },
  { key: "travel", name: "Travel", color: "#d7b8ff" },
  { key: "family", name: "Family", color: "#ffc8a2" },
  { key: "personal", name: "Personal", color: "#d6e2e9" },
  { key: "routine", name: "Routine", color: "#e2f0cb" },
];
export const COLOR: Record<Key, string> = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.color])) as Record<Key, string>;
export const SOCIAL_RECOLOR = "#ffa6d6"; // the new Social color picked in the options scene: pink, unlike any other category

export interface Ev {
  day: number; // 0 = Monday
  start: number; // hours, 24h clock
  end: number;
  title: string;
  key: Key;
}

export const EVENTS: Ev[] = [
  { day: 0, start: 9.5, end: 10, title: "Team standup", key: "meeting" },
  { day: 0, start: 10.5, end: 12.5, title: "Deep work: roadmap", key: "focus" },
  { day: 0, start: 13, end: 14, title: "Lunch with Maya", key: "social" },
  { day: 0, start: 18, end: 19, title: "Gym", key: "fitness" },
  { day: 1, start: 8.5, end: 9.5, title: "Dentist", key: "health" },
  { day: 1, start: 11, end: 11.75, title: "1:1 with Alex", key: "meeting" },
  { day: 1, start: 14, end: 15, title: "Design review", key: "meeting" },
  { day: 1, start: 19, end: 19.75, title: "Call with mom", key: "family" },
  { day: 2, start: 8, end: 11, title: "Flight to SFO", key: "travel" },
  { day: 2, start: 15, end: 16, title: "Customer call", key: "meeting" },
  { day: 2, start: 18, end: 19, title: "Yoga", key: "fitness" },
  { day: 3, start: 9, end: 11, title: "Focus block", key: "focus" },
  { day: 3, start: 13, end: 13.75, title: "Haircut", key: "personal" },
  { day: 3, start: 16, end: 17, title: "Board prep", key: "meeting" },
  { day: 4, start: 10, end: 10.75, title: "Coffee with Jordan", key: "social" },
  { day: 4, start: 14, end: 15, title: "Sprint demo", key: "meeting" },
  { day: 4, start: 17, end: 17.75, title: "Grocery run", key: "personal" },
  { day: 5, start: 8, end: 9.25, title: "Long run", key: "fitness" },
  { day: 5, start: 11, end: 12, title: "Farmers market", key: "personal" },
  { day: 5, start: 18.5, end: 20.5, title: "Birthday party", key: "social" },
  { day: 6, start: 11, end: 12.5, title: "Brunch with family", key: "family" },
  { day: 6, start: 19, end: 19.75, title: "Plan the week", key: "routine" },
];

/** The event created on camera. */
export const NEW_EVENT: Ev = { day: 3, start: 19, end: 20.5, title: "Dinner with Sam", key: "social" };

export const DAYS = [
  { short: "MON", num: 5 },
  { short: "TUE", num: 6 },
  { short: "WED", num: 7 },
  { short: "THU", num: 8 },
  { short: "FRI", num: 9 },
  { short: "SAT", num: 10 },
  { short: "SUN", num: 11 },
];
export const TODAY = 1; // Tuesday gets the "today" circle

/* Geometry, in stage pixels (the stage is 1920 x 1080). */
export const CARD = { x: 150, y: 70, w: 1620, h: 940, r: 26 };
export const BAR_H = 70;
export const HEAD_H = 78;
export const GUTTER = 78;
export const HOUR_START = 8;
export const HOUR_END = 21;
export const GRID = {
  x: CARD.x + GUTTER,
  y: CARD.y + BAR_H + HEAD_H,
  w: CARD.w - GUTTER - 24,
  h: CARD.h - BAR_H - HEAD_H - 18,
};
export const COL_W = GRID.w / 7;
export const HOUR_H = GRID.h / (HOUR_END - HOUR_START);

export function chipRect(e: Pick<Ev, "day" | "start" | "end">) {
  return {
    x: GRID.x + e.day * COL_W + 4,
    y: GRID.y + (e.start - HOUR_START) * HOUR_H + 1.5,
    w: COL_W - 9,
    h: (e.end - e.start) * HOUR_H - 3,
  };
}

export function fmtTime(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const h12 = ((hh + 11) % 12) + 1;
  return mm ? `${h12}:${String(mm).padStart(2, "0")}` : `${h12}`;
}
export function ampm(h: number): string {
  return h >= 12 ? "pm" : "am";
}
export function range(e: Pick<Ev, "start" | "end">): string {
  const sameHalf = ampm(e.start) === ampm(e.end);
  return `${fmtTime(e.start)}${sameHalf ? "" : ampm(e.start)} – ${fmtTime(e.end)}${ampm(e.end)}`;
}
