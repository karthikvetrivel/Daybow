/**
 * The label set every connected user gets. The keys are the option names
 * that Jev picks from. The descriptions are the criteria Jev reads.
 *
 * `color` is the hex used when Google named labels are available.
 * `colorId` is the closest of Google's 11 legacy event colors, used when
 * the account cannot use named labels.
 */
export type LabelKey =
  | "meeting"
  | "focus"
  | "fitness"
  | "health"
  | "social"
  | "travel"
  | "family"
  | "personal"
  | "routine";

export interface LabelCriteria {
  what: string;
  examples: string[];
  not_for?: string;
}

export interface LabelDef {
  key: LabelKey;
  name: string;
  color: string;
  colorId: string;
  criteria: LabelCriteria;
}

export const OTHER_KEY = "other";

export const LABELS: LabelDef[] = [
  {
    key: "meeting",
    name: "Meeting",
    color: "#a8d1ff",
    colorId: "7",
    criteria: {
      what: "Work or professional time with other people: syncs, 1:1s, standups, reviews, interviews, investor, customer, or recruiter calls, video calls, office hours. A meeting has other attendees, a video link, or names another person in the title.",
      examples: ["Alex <> Jordan", "Weekly team sync", "Review with Priya", "30 min with Sam", "Intro call", "Board meeting", "Candidate interview", "Chat w/ Taylor"],
      not_for: "working alone (zero other attendees and no other person named in the title), meals with friends, family calls",
    },
  },
  {
    key: "focus",
    name: "Focus",
    color: "#c9c1ff",
    colorId: "9",
    criteria: {
      what: "The owner works alone: deep work, writing, coding, studying, planning, admin at a desk, working from a cafe, library, or gym lounge. Any title about 'work' or 'working' with zero other attendees and no other person named is focus, even when it also mentions coffee, lunch, or a place.",
      examples: ["work block", "work work work", "coffee + work", "lunch + work", "Working from the gym cafe", "Deep work: Q3 plan", "Study for exam", "Write investor update"],
      not_for: "calls or meetings with other people, workouts",
    },
  },
  {
    key: "fitness",
    name: "Fitness",
    color: "#b5ead7",
    colorId: "2",
    criteria: {
      what: "Exercise and training: gym sessions, runs, walks for exercise, yoga, cycling, swimming, sports, fitness classes.",
      examples: ["leg day", "gym + shower", "5k run", "Yoga class", "Tennis with Sam", "Pull day @ the gym"],
      not_for: "medical appointments, physical therapy",
    },
  },
  {
    key: "health",
    name: "Health",
    color: "#ffb7b2",
    colorId: "4",
    criteria: {
      what: "Medical and wellness appointments: doctor, dentist, therapy, surgery and pre-surgical visits, physical therapy, pharmacy, lab tests, vaccinations.",
      examples: ["Dentist", "Pre-op checkup", "Therapy", "Physical therapy", "Annual physical", "Eye exam"],
      not_for: "gym workouts and sports",
    },
  },
  {
    key: "social",
    name: "Social",
    color: "#ffe08a",
    colorId: "5",
    criteria: {
      what: "Leisure with friends or out in public: dinners and drinks with friends, parties, concerts, shows, movies, restaurant reservations, dates, game nights.",
      examples: ["Dinner w/ Maya", "Potluck at Chris's", "Concert downtown", "Dinner reservation", "Movie night", "Drinks with Alex"],
      not_for: "family visits, work dinners with colleagues or clients",
    },
  },
  {
    key: "travel",
    name: "Travel",
    color: "#d7b8ff",
    colorId: "3",
    criteria: {
      what: "Getting somewhere or staying somewhere: flights, trains, buses, ferries, hotel stays, airport transfers, road trips, check-in and check-out times.",
      examples: ["Flight to Lisbon (TP 204)", "Train to New York", "Stay at Hampton Inn", "Drive to Boston", "Uber to JFK"],
      not_for: "a restaurant reservation at the destination, a meeting held in another city",
    },
  },
  {
    key: "family",
    name: "Family",
    color: "#ffc8a2",
    colorId: "6",
    criteria: {
      what: "Time with family members or family obligations: visits, calls with parents or siblings, kids' school and sports events, family celebrations, caring for relatives.",
      examples: ["Mom in town", "Call with dad", "Sis visiting", "Kids soccer game", "Grandma's birthday", "Parent-teacher conference"],
      not_for: "friends, colleagues",
    },
  },
  {
    key: "personal",
    name: "Personal",
    color: "#d6e2e9",
    colorId: "8",
    criteria: {
      what: "Personal errands and life admin with a fixed time: haircut, deliveries, movers, repairs, bank, DMV, shopping, apartment viewings, chores.",
      examples: ["Haircut", "Movers arrival window", "Car service", "Pick up package", "Apartment tour", "Passport renewal"],
      not_for: "daily routines like meals and sleep, medical appointments",
    },
  },
  {
    key: "routine",
    name: "Routine",
    color: "#e2f0cb",
    colorId: "10",
    criteria: {
      what: "Daily routine blocks with nobody else invited: meals alone, sleep and bedtime, morning routine, shower, reading before bed, commute, wind-down.",
      examples: ["read + bed", "lunch", "morning routine", "breakfast + shower", "Wind down", "Commute home"],
      not_for: "meals with other people, exercise",
    },
  },
];

export const LABEL_BY_KEY: Record<string, LabelDef> = Object.fromEntries(
  LABELS.map((l) => [l.key, l]),
);

export function isLabelKey(value: string): value is LabelKey {
  return value in LABEL_BY_KEY;
}

/** Jev options: every label plus a "none of the above" escape hatch. */
export function jevCriteria(): Record<string, LabelCriteria | string> {
  const criteria: Record<string, LabelCriteria | string> = {};
  for (const l of LABELS) criteria[l.key] = l.criteria;
  criteria[OTHER_KEY] = "None of the labels above fits this event well, or the event is too vague to tell.";
  return criteria;
}

/* ---------- Per-user colors ---------- */

/** Google's 11 legacy event colors (colorId -> background hex), used in fallback mode. */
export const GOOGLE_EVENT_COLORS: Record<string, { name: string; hex: string }> = {
  "1": { name: "Lavender", hex: "#7986cb" },
  "2": { name: "Sage", hex: "#33b679" },
  "3": { name: "Grape", hex: "#8e24aa" },
  "4": { name: "Flamingo", hex: "#e67c73" },
  "5": { name: "Banana", hex: "#f6bf26" },
  "6": { name: "Tangerine", hex: "#f4511e" },
  "7": { name: "Peacock", hex: "#039be5" },
  "8": { name: "Graphite", hex: "#616161" },
  "9": { name: "Blueberry", hex: "#3f51b5" },
  "10": { name: "Basil", hex: "#0b8043" },
  "11": { name: "Tomato", hex: "#d50000" },
};

export const HEX_RE = /^#[0-9a-f]{6}$/i;

export function normalizeHex(value: string | undefined | null): string | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return HEX_RE.test(v) ? v : null;
}

function rgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

/** The Google palette entry closest to a hex color (plain RGB distance). */
export function nearestColorId(hex: string): string {
  const [r, g, b] = rgb(hex);
  let best = "8";
  let bestDist = Infinity;
  for (const [id, c] of Object.entries(GOOGLE_EVENT_COLORS)) {
    const [cr, cg, cb] = rgb(c.hex);
    const d = (r - cr) ** 2 + (g - cg) ** 2 + (b - cb) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}

export type ColorOverrides = Record<string, string> | undefined;

/** The hex a label uses for this user: their pick, or the default. */
export function colorFor(key: LabelKey, overrides: ColorOverrides): string {
  return normalizeHex(overrides?.[key]) ?? LABEL_BY_KEY[key].color;
}

/** The Google colorId a label uses for this user in fallback mode. */
export function colorIdFor(key: LabelKey, overrides: ColorOverrides): string {
  const custom = normalizeHex(overrides?.[key]);
  return custom ? nearestColorId(custom) : LABEL_BY_KEY[key].colorId;
}

/* ---------- Per-user categories ---------- */

/** One category as the user sees and edits it. */
export interface UserLabel {
  key: string;
  name: string;
  color: string;
  what: string;
  examples: string[];
  not_for?: string;
}

export const MAX_USER_LABELS = 30;
export const MAX_NAME_LEN = 30;
export const MAX_TEXT_LEN = 300;
const RESERVED_KEYS = new Set([OTHER_KEY]);

export function defaultUserLabels(): UserLabel[] {
  return LABELS.map((l) => ({
    key: l.key,
    name: l.name,
    color: l.color,
    what: l.criteria.what,
    examples: [...l.criteria.examples],
    not_for: l.criteria.not_for,
  }));
}

/** The user's categories, or the defaults, with any older per-color overrides applied. */
export function effectiveLabels(user: { customLabels?: UserLabel[]; customColors?: Record<string, string> }): UserLabel[] {
  const base = user.customLabels?.length ? user.customLabels : defaultUserLabels();
  if (!user.customColors) return base;
  return base.map((l) => ({ ...l, color: normalizeHex(user.customColors?.[l.key]) ?? l.color }));
}

/** Jev options for a category set: every category plus "other". */
export function criteriaFor(labels: UserLabel[]): Record<string, LabelCriteria | string> {
  const criteria: Record<string, LabelCriteria | string> = {};
  for (const l of labels) {
    criteria[l.key] = { what: l.what || l.name, examples: l.examples, ...(l.not_for ? { not_for: l.not_for } : {}) };
  }
  criteria[OTHER_KEY] = "None of the labels above fits this event well, or the event is too vague to tell.";
  return criteria;
}

/**
 * Checks a category list from the editor or from an API call, with the same
 * rules as the categories form. Keeps each category's key and its `not_for`
 * hint. New categories get a key made from their name.
 */
export function validateLabels(input: unknown): { labels?: UserLabel[]; error?: string } {
  if (!Array.isArray(input)) return { error: "Categories must be a list." };
  if (input.length > MAX_USER_LABELS) return { error: `At most ${MAX_USER_LABELS} categories.` };
  const rows = input.map((r) => (r && typeof r === "object" ? (r as Partial<UserLabel>) : {}));
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const get = (field: string): string | null => {
    const m = /^([a-z]+)_(\d+)$/.exec(field);
    const row = m ? rows[Number(m[2])] : undefined;
    if (!m || !row) return null;
    switch (m[1]) {
      case "key": return text(row.key);
      case "name": return text(row.name);
      case "color": return text(row.color);
      case "what": return text(row.what);
      case "examples": return Array.isArray(row.examples) ? row.examples.map(text).filter(Boolean).join(", ") : "";
      default: return null;
    }
  };
  const parsed = parseLabelsForm(get, rows.length);
  if (!parsed.labels) return parsed;
  const notFor = new Map(rows.filter((r) => text(r.key) && text(r.not_for)).map((r) => [text(r.key), text(r.not_for).slice(0, MAX_TEXT_LEN)]));
  return { labels: parsed.labels.map((l) => (notFor.has(l.key) ? { ...l, not_for: notFor.get(l.key) } : l)) };
}

/** Google legacy color for a category in fallback mode. */
export function colorIdForLabel(l: UserLabel): string {
  const def = LABEL_BY_KEY[l.key];
  if (def && def.color === l.color.toLowerCase()) return def.colorId;
  return nearestColorId(l.color);
}

export function slugify(name: string): string {
  const s = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return s || "label";
}

function splitExamples(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 12);
}

/**
 * Parses the categories form. Row i has key_i (existing key or empty),
 * name_i, color_i, what_i, examples_i and delete_i. Returns the new set or
 * a message that explains what to fix.
 */
export function parseLabelsForm(get: (field: string) => string | null, rowCount: number): { labels?: UserLabel[]; error?: string } {
  const labels: UserLabel[] = [];
  const usedKeys = new Set<string>();
  const usedNames = new Set<string>();
  for (let i = 0; i < rowCount; i++) {
    if (get(`delete_${i}`)) continue;
    const name = (get(`name_${i}`) ?? "").trim();
    const existingKey = (get(`key_${i}`) ?? "").trim();
    if (!name) {
      if (existingKey) return { error: "Every category needs a name." };
      continue; // the blank "add" row
    }
    if (name.length > MAX_NAME_LEN) return { error: `Category names must be ${MAX_NAME_LEN} characters or fewer.` };
    const color = normalizeHex(get(`color_${i}`));
    if (!color) return { error: `"${name}" needs a valid color.` };
    const what = (get(`what_${i}`) ?? "").trim().slice(0, MAX_TEXT_LEN);
    const examples = splitExamples((get(`examples_${i}`) ?? "").slice(0, MAX_TEXT_LEN));
    let key = existingKey || slugify(name);
    if (RESERVED_KEYS.has(key)) key = `${key}_label`;
    let unique = key;
    let n = 2;
    while (usedKeys.has(unique)) unique = `${key}_${n++}`;
    key = unique;
    if (usedNames.has(name.toLowerCase())) return { error: `Two categories are named "${name}". Names must differ.` };
    usedKeys.add(key);
    usedNames.add(name.toLowerCase());
    labels.push({ key, name, color, what, examples });
  }
  if (labels.length === 0) return { error: "Keep at least one category." };
  if (labels.length > MAX_USER_LABELS) return { error: `At most ${MAX_USER_LABELS} categories.` };
  return { labels };
}
