import { describe, expect, it } from "vitest";
import type { GEvent } from "../lib/features";
import { ensureLabels, pickCandidates, runForUser } from "../lib/labeler";
import { LABELS } from "../lib/taxonomy";
import { FakeCalendar, FakeJev, labelNames, user } from "./fakes";

const at = (day: number, hour: number): GEvent["start"] => ({ dateTime: `2026-09-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:00:00-04:00` });

function sampleEvents(): GEvent[] {
  return [
    { id: "a", summary: "Alex <> Jordan", start: at(22, 11), end: at(22, 12), attendees: [{ email: "jon@x.com" }] },
    { id: "r1", summary: "Team sync", recurringEventId: "master", start: at(22, 15), end: at(22, 16) },
    { id: "r2", summary: "Team sync", recurringEventId: "master", start: at(23, 15), end: at(23, 16) },
    { id: "b", summary: "leg day", start: at(23, 8), end: at(23, 9) },
    { id: "c", summary: "Flight to SFO", eventType: "fromGmail", start: at(24, 8), end: at(24, 14) },
    { id: "d", summary: "vague thing", start: at(24, 18), end: at(24, 19) },
    { id: "e", summary: "???", start: at(25, 18), end: at(25, 19) },
    { id: "f", summary: "Already colored", start: at(25, 9), end: at(25, 10), eventLabelId: "manual-id" },
    { id: "g", summary: "Office day", eventType: "workingLocation", start: at(25, 9), end: at(25, 10) },
  ];
}

const opts = (calendar: FakeCalendar, jev: FakeJev) => ({
  calendar,
  jev,
  minConfidence: 0.5,
  windowPastDays: 7,
  windowFutureDays: 60,
  now: () => new Date("2026-09-25T12:00:00Z"),
});

describe("pickCandidates", () => {
  it("collapses recurring instances and drops non-labelable events", () => {
    const c = pickCandidates(sampleEvents());
    expect(c.map((x) => x.target)).toEqual(["a", "master", "b", "c", "d", "e", "f"]);
  });
});

describe("ensureLabels", () => {
  it("creates the full label set once and reuses existing names", async () => {
    const cal = new FakeCalendar([]);
    cal.labels = [{ id: "keep", name: "Meeting", backgroundColor: "#000000" }, { id: "mine", name: "Piano" }];
    const u = user();
    expect(await ensureLabels(u, cal)).toBe("labels");
    expect(cal.labels.map((l) => l.name)).toEqual(["Meeting", "Piano", ...labelNames.filter((n) => n !== "Meeting")]);
    expect(u.labelIds.meeting).toBe("keep");
    expect(Object.keys(u.labelIds).sort()).toEqual(LABELS.map((l) => l.key).sort());
    const before = cal.labels.length;
    await ensureLabels(u, cal);
    expect(cal.labels.length).toBe(before);
  });

  it("falls back to colors when the account cannot use labels", async () => {
    const cal = new FakeCalendar([]);
    cal.labelsSupported = false;
    const u = user();
    expect(await ensureLabels(u, cal)).toBe("colors");
    expect(u.labelMode).toBe("colors");
  });
});

describe("runForUser", () => {
  it("labels unlabeled events, skips unsure ones, patches a series once", async () => {
    const cal = new FakeCalendar(sampleEvents());
    const jev = new FakeJev();
    const u = user();
    const s = await runForUser(u, opts(cal, jev));

    expect(s.mode).toBe("labels");
    expect(s.scanned).toBe(9);
    expect(s.candidates).toBe(7);
    expect(s.alreadyLabeled).toBe(1);
    expect(s.classified).toBe(6);
    expect(s.labeled).toBe(4);
    expect(s.lowConfidence).toBe(2);
    expect(s.errors).toEqual([]);
    expect(jev.calls).toBe(6);

    const patched = cal.patches.map((p) => p.id).sort();
    expect(patched).toEqual(["a", "b", "c", "master"]);
    expect(cal.patches.find((p) => p.id === "master")?.body.eventLabelId).toBe(cal.labelIdByName("Meeting"));
    expect(cal.patches.find((p) => p.id === "c")?.body.eventLabelId).toBe(cal.labelIdByName("Travel"));
    expect(u.processed.a.r).toBe("meeting");
    expect(u.processed.d.r).toBe("skip");
    expect(u.processed.e.r).toBe("skip");
    expect(u.processed.f.r).toBe("manual");
    expect(s.labeledByKey).toEqual({ meeting: 2, fitness: 1, travel: 1 });
  });

  it("does nothing on a second run with the same events", async () => {
    const cal = new FakeCalendar(sampleEvents());
    const jev = new FakeJev();
    const u = user();
    await runForUser(u, opts(cal, jev));
    const s2 = await runForUser(u, opts(cal, jev));
    expect(s2.labeled).toBe(0);
    expect(s2.classified).toBe(0);
    expect(jev.calls).toBe(6);
  });

  it("respects a label the user removed, and re-decides when the title changes", async () => {
    const cal = new FakeCalendar(sampleEvents());
    const jev = new FakeJev();
    const u = user();
    await runForUser(u, opts(cal, jev));

    // user clears our label on "a"
    cal.events.find((e) => e.id === "a")!.eventLabelId = undefined;
    const s2 = await runForUser(u, opts(cal, jev));
    expect(s2.labeled).toBe(0);
    expect(u.processed.a.r).toBe("cleared");

    // user renames "a": it is a new decision
    const a = cal.events.find((e) => e.id === "a")!;
    a.summary = "Dinner with Sam";
    const s3 = await runForUser(u, opts(cal, jev));
    expect(s3.labeled).toBe(1);
    expect(u.processed.a.r).toBe("social");
  });

  it("uses legacy colors when labels are unavailable", async () => {
    const cal = new FakeCalendar(sampleEvents());
    cal.labelsSupported = false;
    const jev = new FakeJev();
    const u = user();
    const s = await runForUser(u, opts(cal, jev));
    expect(s.mode).toBe("colors");
    expect(cal.patches.every((p) => p.mode === "colors" && p.body.colorId)).toBe(true);
    expect(cal.patches.find((p) => p.id === "c")?.body.colorId).toBe("3");
  });

  it("caps classifications per run and continues next time", async () => {
    const cal = new FakeCalendar(sampleEvents());
    const jev = new FakeJev();
    const u = user();
    const s1 = await runForUser(u, { ...opts(cal, jev), maxClassifications: 2 });
    expect(s1.classified).toBe(2);
    const s2 = await runForUser(u, { ...opts(cal, jev), maxClassifications: 10 });
    expect(s2.classified).toBe(4);
  });

  it("records a Jev failure without aborting the run", async () => {
    const cal = new FakeCalendar(sampleEvents());
    const jev = new FakeJev();
    let n = 0;
    jev.classify = async () => {
      n++;
      if (n === 1) throw new Error("boom");
      return { label: "meeting", confidence: 0.9, probabilities: {}, model: "fake", inputTokens: 1 };
    };
    const u = user();
    const s = await runForUser(u, opts(cal, jev));
    expect(s.errors.length).toBe(1);
    expect(s.labeled).toBe(5);
  });
});
