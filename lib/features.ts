/** The subset of a Google Calendar event that the labeler reads. */
export interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  attendees?: Array<{
    email?: string;
    displayName?: string;
    self?: boolean;
    organizer?: boolean;
    resource?: boolean;
    responseStatus?: string;
  }>;
  organizer?: { email?: string; self?: boolean; displayName?: string };
  creator?: { email?: string; self?: boolean };
  recurringEventId?: string;
  recurrence?: string[];
  eventType?: string;
  eventLabelId?: string;
  colorId?: string;
  updated?: string;
  hangoutLink?: string;
  conferenceData?: unknown;
  transparency?: string;
  visibility?: string;
}

/** What Jev sees. Plain JSON, no free text generation needed. */
export interface EventState {
  title: string;
  description: string;
  location: string;
  source: "gmail" | "user";
  all_day: boolean;
  start_local: string;
  weekday: string;
  start_hour_local: number | null;
  duration_minutes: number | null;
  is_recurring: boolean;
  other_attendee_count: number;
  other_attendee_domains: string[];
  organizer_is_me: boolean;
  organizer_domain: string;
  my_email_domain: string;
  has_video_call: boolean;
  marked_free: boolean;
}

export interface BuildStateOptions {
  userEmail: string;
  timeZone: string;
}

const VIDEO_RE = /zoom\.us|meet\.google\.com|teams\.microsoft\.com|webex\.com|whereby\.com|around\.co/i;

export function stripHtml(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function domainOf(email?: string): string {
  if (!email || !email.includes("@")) return "";
  return email.split("@")[1].toLowerCase();
}

/** Accepts "2026-09-10" (REST API) and full timestamps (some exports). Invalid input yields null. */
function parseDateOnly(value: string): Date | null {
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseDateTime(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseStart(e: GEvent): { at: Date | null; allDay: boolean } {
  if (e.start?.dateTime) return { at: parseDateTime(e.start.dateTime), allDay: false };
  if (e.start?.date) return { at: parseDateOnly(e.start.date), allDay: true };
  return { at: null, allDay: false };
}

function parseEnd(e: GEvent): Date | null {
  if (e.end?.dateTime) return parseDateTime(e.end.dateTime);
  if (e.end?.date) return parseDateOnly(e.end.date);
  return null;
}

export function buildState(e: GEvent, opts: BuildStateOptions): EventState {
  const { at, allDay } = parseStart(e);
  const end = parseEnd(e);
  const me = opts.userEmail.toLowerCase();
  const others = (e.attendees ?? []).filter(
    (a) => !a.self && !a.resource && (a.email ?? "").toLowerCase() !== me,
  );
  const domains = Array.from(new Set(others.map((a) => domainOf(a.email)).filter(Boolean))).slice(0, 5);

  let startLocal = "";
  let weekday = "";
  let hour: number | null = null;
  if (at) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: allDay ? "UTC" : opts.timeZone,
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: allDay ? undefined : "numeric",
      minute: allDay ? undefined : "2-digit",
      hour12: false,
    });
    startLocal = fmt.format(at);
    weekday = new Intl.DateTimeFormat("en-US", { timeZone: allDay ? "UTC" : opts.timeZone, weekday: "long" }).format(at);
    if (!allDay) {
      const h = new Intl.DateTimeFormat("en-US", { timeZone: opts.timeZone, hour: "numeric", hour12: false }).format(at);
      hour = Number.parseInt(h, 10) % 24;
    }
  }

  const duration = at && end ? Math.round((end.getTime() - at.getTime()) / 60000) : null;
  const description = stripHtml(e.description ?? "").slice(0, 400);
  const location = (e.location ?? "").trim().slice(0, 160);
  const hasVideo = Boolean(e.hangoutLink) || Boolean(e.conferenceData) || VIDEO_RE.test(`${location} ${description}`);

  return {
    title: (e.summary ?? "").trim() || "(no title)",
    description,
    location,
    source: e.eventType === "fromGmail" ? "gmail" : "user",
    all_day: allDay,
    start_local: startLocal,
    weekday,
    start_hour_local: hour,
    duration_minutes: duration,
    is_recurring: Boolean(e.recurringEventId) || Boolean(e.recurrence?.length),
    other_attendee_count: others.length,
    other_attendee_domains: domains,
    organizer_is_me: Boolean(e.organizer?.self) || (e.organizer?.email ?? "").toLowerCase() === me,
    organizer_domain: domainOf(e.organizer?.email),
    my_email_domain: domainOf(me),
    has_video_call: hasVideo,
    marked_free: e.transparency === "transparent",
  };
}

/** Changes when the parts of an event that matter for labeling change. */
export function contentHash(e: GEvent): string {
  const parts = [
    e.summary ?? "",
    stripHtml(e.description ?? "").slice(0, 400),
    e.location ?? "",
    String((e.attendees ?? []).length),
    e.eventType ?? "",
  ];
  return fnv1a(parts.join("\u0000"));
}

/** Only ordinary events and Gmail-derived events can carry a label. */
export function isLabelable(e: GEvent): boolean {
  if (e.status === "cancelled") return false;
  const t = e.eventType ?? "default";
  return t === "default" || t === "fromGmail";
}

/** FNV-1a, 64-bit as hex. Runs in Node and in the browser. */
export function fnv1a(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x27d4eb2f) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}
