import { describe, expect, it } from "vitest";
import { labelEvents, rememberLabelBaseline, runForUser, syncLabels } from "../lib/labeler";
import { defaultUserLabels, effectiveLabels } from "../lib/taxonomy";
import { FakeCalendar, FakeJev, user } from "./fakes";

const opts = (calendar: FakeCalendar, jev: FakeJev, applied: string[] = []) => ({
  calendar,
  jev,
  minConfidence: 0.3,
  windowPastDays: 7,
  windowFutureDays: 60,
  now: () => new Date("2026-09-25T12:00:00Z"),
  onApplied: (target: string) => applied.push(target),
});

const ev = (id: string, summary: string, extra: Record<string, unknown> = {}) => ({
  id,
  summary,
  start: { dateTime: "2026-09-28T15:00:00-04:00" },
  end: { dateTime: "2026-09-28T16:00:00-04:00" },
  ...extra,
});

describe("labelEvents (fast path)", () => {
  it("labels only the events it is given and reports each one", async () => {
    const cal = new FakeCalendar([ev("a", "leg day"), ev("b", "Alex <> Jordan")]);
    const jev = new FakeJev();
    const u = user();
    const applied: string[] = [];
    const s = await labelEvents(u, opts(cal, jev, applied), [ev("a", "leg day")]);
    expect(s.labeled).toBe(1);
    expect(applied).toEqual(["a"]);
    expect(cal.patches.map((p) => p.id)).toEqual(["a"]);
    expect(u.processed.a.r).toBe("fitness");
    expect(u.processed.b).toBeUndefined();
  });

  it("labels a recurring instance at its series and skips labeled events", async () => {
    const cal = new FakeCalendar([]);
    const jev = new FakeJev();
    const u = user();
    const applied: string[] = [];
    await syncLabels(u, cal);
    const s = await labelEvents(u, opts(cal, jev, applied), [
      ev("series_20260928T190000Z", "Weekly sync", { recurringEventId: "series" }),
      ev("c", "gym", { eventLabelId: "someone-elses" }),
    ]);
    expect(s.labeled).toBe(1);
    expect(s.alreadyLabeled).toBe(1);
    expect(applied).toEqual(["series"]);
    expect(cal.patches[0].id).toBe("series");
  });

  it("does not relabel on a second call", async () => {
    const cal = new FakeCalendar([ev("a", "leg day")]);
    const jev = new FakeJev();
    const u = user();
    await labelEvents(u, opts(cal, jev), [ev("a", "leg day")]);
    const again = await labelEvents(u, opts(cal, jev), [ev("a", "leg day")]);
    expect(again.classified).toBe(0);
    expect(jev.calls).toBe(1);
  });
});

describe("label edits made in Google Calendar", () => {
  it("adopts a color or name changed in Google instead of reverting it", async () => {
    const cal = new FakeCalendar([ev("a", "leg day")]);
    const u = user();
    await syncLabels(u, cal);
    const social = cal.labels.find((l) => l.name === "Social")!;
    social.backgroundColor = "#123456"; // edited in Google Calendar
    social.name = "Friends";
    const r = await syncLabels(u, cal);
    expect(r.adopted).toBe(1);
    expect(r.changed).toBe(0);
    expect(social.backgroundColor).toBe("#123456");
    const mine = effectiveLabels(u).find((l) => l.key === "social")!;
    expect(mine.name).toBe("Friends");
    expect(mine.color).toBe("#123456");
    // a normal run keeps the adopted state
    await runForUser(u, opts(cal, new FakeJev()));
    expect(cal.labels.find((l) => l.id === social.id)?.backgroundColor).toBe("#123456");
  });

  it("pushes an edit made here", async () => {
    const cal = new FakeCalendar([]);
    const u = user();
    await syncLabels(u, cal);
    rememberLabelBaseline(u, effectiveLabels(u));
    u.customLabels = defaultUserLabels().map((l) => (l.key === "meeting" ? { ...l, color: "#abcdef" } : l));
    const r = await syncLabels(u, cal);
    expect(r.adopted).toBe(0);
    expect(r.changed).toBe(1);
    expect(cal.labels.find((l) => l.name === "Meeting")?.backgroundColor).toBe("#abcdef");
  });

  it("an edit here wins even for an old record without a baseline", async () => {
    const cal = new FakeCalendar([]);
    const u = user();
    await syncLabels(u, cal);
    u.labelSynced = undefined; // record from before this feature
    const before = effectiveLabels(u);
    rememberLabelBaseline(u, before);
    u.customLabels = before.map((l) => (l.key === "travel" ? { ...l, name: "Trips" } : l));
    await syncLabels(u, cal);
    expect(cal.labels.some((l) => l.name === "Trips")).toBe(true);
    expect(cal.labels.some((l) => l.name === "Travel")).toBe(false);
  });

  it("a new connection takes existing label colors from the calendar", async () => {
    const cal = new FakeCalendar([]);
    cal.labels = [{ id: "x", name: "Meeting", backgroundColor: "#ff0000" }];
    const u = user();
    await syncLabels(u, cal);
    expect(cal.labels.find((l) => l.id === "x")?.backgroundColor).toBe("#ff0000");
    expect(effectiveLabels(u).find((l) => l.key === "meeting")?.color).toBe("#ff0000");
  });
});
