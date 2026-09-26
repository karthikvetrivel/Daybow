import { describe, expect, it } from "vitest";
import { applyLabelChanges, ensureLabels, runForUser, syncLabels } from "../lib/labeler";
import { colorIdForLabel, criteriaFor, defaultUserLabels, effectiveLabels, nearestColorId, normalizeHex, parseLabelsForm, slugify } from "../lib/taxonomy";
import { FakeCalendar, FakeJev, user } from "./fakes";

const formOf = (rows: Record<string, string>[]) => {
  const map: Record<string, string> = {};
  rows.forEach((r, i) => Object.entries(r).forEach(([k, v]) => (map[`${k}_${i}`] = v)));
  return (f: string) => (f in map ? map[f] : null);
};

describe("helpers", () => {
  it("normalizes hex and snaps colors", () => {
    expect(normalizeHex(" #ABCDEF ")).toBe("#abcdef");
    expect(normalizeHex("red")).toBeNull();
    expect(nearestColorId("#ff0000")).toBe("11");
    expect(nearestColorId("#333333")).toBe("8");
    expect(slugify("Deep Work!")).toBe("deep_work");
    expect(colorIdForLabel({ key: "meeting", name: "Meeting", color: "#039be5", what: "", examples: [] })).toBe("7");
    expect(colorIdForLabel({ key: "meeting", name: "Meeting", color: "#ff0000", what: "", examples: [] })).toBe("11");
  });

  it("uses defaults, then custom sets, then legacy color overrides", () => {
    expect(effectiveLabels({}).map((l) => l.key)).toContain("meeting");
    expect(effectiveLabels({ customColors: { meeting: "#ff0000" } }).find((l) => l.key === "meeting")?.color).toBe("#ff0000");
    const custom = [{ key: "work", name: "Work", color: "#111111", what: "work stuff", examples: ["standup"] }];
    expect(effectiveLabels({ customLabels: custom }).map((l) => l.key)).toEqual(["work"]);
    const c = criteriaFor(custom);
    expect(Object.keys(c)).toEqual(["work", "other"]);
    expect((c.work as { what: string }).what).toBe("work stuff");
  });
});

describe("parseLabelsForm", () => {
  it("accepts edits, additions, and removals", () => {
    const r = parseLabelsForm(
      formOf([
        { key: "meeting", name: "Work call", color: "#ff0000", what: "calls", examples: "sync, 1:1" },
        { key: "focus", name: "Focus", color: "#3f51b5", what: "", examples: "", delete: "on" },
        { key: "", name: "Deep Work", color: "#00ff00", what: "solo", examples: "" },
        { key: "", name: "", color: "#9e9e9e", what: "", examples: "" },
      ]),
      4,
    );
    expect(r.error).toBeUndefined();
    expect(r.labels!.map((l) => [l.key, l.name])).toEqual([
      ["meeting", "Work call"],
      ["deep_work", "Deep Work"],
    ]);
    expect(r.labels![0].examples).toEqual(["sync", "1:1"]);
  });

  it("rejects duplicates, bad colors, and empty sets", () => {
    expect(parseLabelsForm(formOf([{ key: "a", name: "X", color: "#000000" }, { key: "b", name: "x", color: "#000000" }]), 2).error).toMatch(/named/);
    expect(parseLabelsForm(formOf([{ key: "a", name: "X", color: "blue" }]), 1).error).toMatch(/color/);
    expect(parseLabelsForm(formOf([{ key: "", name: "", color: "#000000" }]), 1).error).toMatch(/at least one/);
    expect(parseLabelsForm(formOf([{ key: "other", name: "Other", color: "#000000" }]), 1).labels![0].key).toBe("other_label");
  });
});

describe("categories on Google", () => {
  it("creates custom labels, then renames and recolors them in place", async () => {
    const cal = new FakeCalendar([]);
    const u = user();
    u.customLabels = [{ key: "work", name: "Work", color: "#111111", what: "", examples: [] }];
    expect(await ensureLabels(u, cal)).toBe("labels");
    expect(cal.labels.map((l) => l.name)).toEqual(["Work"]);
    const id = u.labelIds.work;

    u.customLabels = [
      { key: "work", name: "Work call", color: "#222222", what: "", examples: [] },
      { key: "play", name: "Play", color: "#333333", what: "", examples: [] },
    ];
    const r = await syncLabels(u, cal);
    expect(r.changed).toBe(3); // rename + recolor + create
    expect(u.labelIds.work).toBe(id);
    expect(cal.labels.find((l) => l.id === id)?.name).toBe("Work call");
    expect(cal.labels.find((l) => l.id === id)?.backgroundColor).toBe("#222222");
    expect(cal.labels.map((l) => l.name)).toEqual(["Work call", "Play"]);

    // removing a category keeps the Google label but forgets its id
    u.customLabels = [{ key: "play", name: "Play", color: "#333333", what: "", examples: [] }];
    await syncLabels(u, cal);
    expect(u.labelIds.work).toBeUndefined();
    expect(cal.labels.length).toBe(2);
  });

  it("classifies against the user's own categories", async () => {
    const cal = new FakeCalendar([{ id: "a", summary: "leg day", start: { dateTime: "2026-09-23T08:00:00-04:00" }, end: { dateTime: "2026-09-23T09:00:00-04:00" } }]);
    const jev = new FakeJev();
    jev.rules = [[/leg day/i, "gym", 0.9]];
    const u = user();
    u.customLabels = [{ key: "gym", name: "Gym", color: "#0b8043", what: "workouts", examples: ["leg day"] }];
    const s = await runForUser(u, { calendar: cal, jev, minConfidence: 0.3, windowPastDays: 7, windowFutureDays: 60, now: () => new Date("2026-09-25T12:00:00Z") });
    expect(Object.keys(jev.lastCriteria ?? {})).toEqual(["gym", "other"]);
    expect(s.labeled).toBe(1);
    expect(cal.patches[0].body.eventLabelId).toBe(u.labelIds.gym);
  });

  it("re-patches events in colors mode when a category color changes", async () => {
    const cal = new FakeCalendar([{ id: "a", summary: "Alex <> Jordan", start: { dateTime: "2026-09-22T11:00:00-04:00" }, end: { dateTime: "2026-09-22T12:00:00-04:00" } }]);
    cal.labelsSupported = false;
    const u = user();
    await runForUser(u, { calendar: cal, jev: new FakeJev(), minConfidence: 0.3, windowPastDays: 7, windowFutureDays: 60, now: () => new Date("2026-09-25T12:00:00Z") });
    cal.patches = [];
    u.customLabels = defaultUserLabels().map((l) => (l.key === "meeting" ? { ...l, color: "#d50000" } : l));
    const r = await applyLabelChanges(u, cal, ["meeting"]);
    expect(r.updated).toBe(1);
    expect(cal.patches).toEqual([{ id: "a", body: { colorId: "11" }, mode: "colors" }]);
  });
});
