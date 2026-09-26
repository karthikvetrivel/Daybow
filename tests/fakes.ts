import type { GEvent } from "../lib/features";
import { GoogleApiError, type CalendarApi, type GCalendar, type GLabel } from "../lib/google";
import type { JevAnswer, JevClient } from "../lib/jev";
import { newUser, type UserRecord } from "../lib/store";
import { LABELS } from "../lib/taxonomy";

export class FakeCalendar implements CalendarApi {
  events: GEvent[];
  labels: GLabel[] = [];
  patches: Array<{ id: string; body: Record<string, string | undefined>; mode: string }> = [];
  labelsSupported = true;
  timeZone = "America/New_York";

  constructor(events: GEvent[]) {
    this.events = events;
  }
  async listEvents(_min?: string, _max?: string, _v?: boolean, opts: { updatedMin?: string } = {}) {
    const since = opts.updatedMin ? Date.parse(opts.updatedMin) : null;
    return this.events.filter((e) => since === null || Date.parse(e.updated ?? "1970-01-01T00:00:00Z") >= since).map((e) => ({ ...e }));
  }
  async getEvent(id: string) {
    const e = this.events.find((x) => x.id === id);
    return e ? { ...e } : null;
  }
  async getCalendar(): Promise<GCalendar> {
    if (!this.labelsSupported) throw new GoogleApiError(403, "labels not enabled", "calendars.get");
    return { id: "primary", timeZone: this.timeZone, labelProperties: { eventLabels: this.labels.map((l) => ({ ...l })) } };
  }
  async setLabels(labels: GLabel[]) {
    if (!this.labelsSupported) throw new GoogleApiError(403, "labels not enabled", "calendars.patch");
    this.labels = labels.map((l) => ({ ...l }));
  }
  async patchEvent(id: string, body: { eventLabelId?: string; colorId?: string }, mode: "labels" | "colors") {
    this.patches.push({ id, body, mode });
    for (const e of this.events) {
      if (e.id === id || e.recurringEventId === id) {
        if (body.eventLabelId !== undefined) e.eventLabelId = body.eventLabelId;
        if (body.colorId !== undefined) e.colorId = body.colorId;
      }
    }
  }
  labelIdByName(name: string) {
    return this.labels.find((l) => l.name === name)?.id;
  }
}

/** Decides by keyword so tests are deterministic. */
export class FakeJev implements JevClient {
  calls = 0;
  lastCriteria: Record<string, unknown> | undefined;
  rules: Array<[RegExp, string, number]> = [
    [/<>|sync|review/i, "meeting", 0.95],
    [/gym|leg day/i, "fitness", 0.9],
    [/flight|train/i, "travel", 0.99],
    [/dinner/i, "social", 0.8],
    [/vague/i, "personal", 0.3],
  ];
  async classify(state: unknown, criteria?: Record<string, unknown>): Promise<JevAnswer> {
    this.calls++;
    this.lastCriteria = criteria;
    const title = (state as { title: string }).title;
    for (const [re, label, confidence] of this.rules) {
      if (re.test(title)) return { label, confidence, probabilities: { [label]: confidence }, model: "fake", inputTokens: 1 };
    }
    return { label: "other", confidence: 0.6, probabilities: { other: 0.6 }, model: "fake", inputTokens: 1 };
  }
}

export function user(): UserRecord {
  return newUser({ id: "u1", email: "me@example.com", refreshTokenEnc: "x", timeZone: "America/New_York" });
}

export const labelNames = LABELS.map((l) => l.name);
