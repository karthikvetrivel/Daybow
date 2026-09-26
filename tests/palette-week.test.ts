import { describe, expect, it } from "vitest";
import { PASTELS, inkFor, nextPastel, pastelName } from "../lib/palette";
import { defaultUserLabels, validateLabels, type UserLabel } from "../lib/taxonomy";
import { eventsPerCategory, formatRange, sampleWeek, weekStart } from "../lib/week";

describe("pastel palette", () => {
  it("has 24 distinct valid colors that include every default category color", () => {
    expect(PASTELS).toHaveLength(24);
    expect(new Set(PASTELS.map((p) => p.hex)).size).toBe(24);
    for (const p of PASTELS) expect(p.hex).toMatch(/^#[0-9a-f]{6}$/);
    for (const l of defaultUserLabels()) expect(pastelName(l.color), l.key).not.toBeNull();
  });

  it("offers the first unused color for a new category", () => {
    expect(nextPastel([])).toBe(PASTELS[0].hex);
    expect(nextPastel(defaultUserLabels().map((l) => l.color))).toBe("#ffa6d6");
    expect(nextPastel(PASTELS.map((p) => p.hex))).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("keeps text readable: dark on pastels, white on deep colors", () => {
    for (const p of PASTELS) expect(inkFor(p.hex), p.name).toBe("#1f1f1f");
    expect(inkFor("#0b57d0")).toBe("#ffffff");
    expect(inkFor("#d50000")).toBe("#ffffff");
    expect(pastelName("#FFB7B2")).toBe("Coral");
    expect(pastelName("#123456")).toBeNull();
  });
});

describe("sample week", () => {
  const wed = new Date(2026, 8, 30, 15, 0);

  it("runs Monday to Sunday and marks today", () => {
    const days = sampleWeek(defaultUserLabels(), wed);
    expect(days).toHaveLength(7);
    expect(days[0].date.getDay()).toBe(1);
    expect(days[0].date.getDate()).toBe(28);
    expect(days.map((d) => d.today)).toEqual([false, false, true, false, false, false, false]);
    expect(weekStart(new Date(2026, 9, 4)).getDate()).toBe(28); // Sunday belongs to the week before
  });

  it("shows every category, up to three examples each, in time order", () => {
    const labels = defaultUserLabels();
    const events = sampleWeek(labels, wed).flatMap((d) => d.events);
    for (const l of labels) {
      const mine = events.filter((e) => e.key === l.key);
      expect(mine.length, l.key).toBe(3);
      expect(l.examples).toEqual(expect.arrayContaining(mine.map((e) => e.title)));
    }
    for (const d of sampleWeek(labels, wed)) {
      const starts = d.events.map((e) => e.start);
      expect(starts).toEqual([...starts].sort((a, b) => a - b));
    }
  });

  it("uses the name when a category has no examples, and pins new categories to the clicked day", () => {
    const custom: UserLabel = { key: "book_club", name: "Book club", color: "#ffa6d6", what: "", examples: [] };
    const days = sampleWeek([...defaultUserLabels(), custom], wed, new Map([["book_club", 4]]));
    expect(days[4].events.some((e) => e.key === "book_club" && e.title === "Book club")).toBe(true);
  });

  it("puts titles at the times they suggest", () => {
    const routine: UserLabel = { key: "routine", name: "Routine", color: "#e2f0cb", what: "", examples: ["lunch", "morning routine", "read + bed"] };
    const events = sampleWeek([routine], wed).flatMap((d) => d.events);
    const start = (t: string) => events.find((e) => e.title === t)?.start;
    expect([start("lunch"), start("morning routine"), start("read + bed")]).toEqual([720, 450, 1320]);
  });

  it("gives each category fewer events when there are many", () => {
    expect(eventsPerCategory(9)).toBe(3);
    expect(eventsPerCategory(15)).toBe(2);
    expect(eventsPerCategory(30)).toBe(1);
    const many = Array.from({ length: 30 }, (_, i) => ({ key: `c${i}`, name: `C${i}`, color: "#ffb7b2", what: "", examples: ["a", "b", "c"] }));
    expect(sampleWeek(many, wed).flatMap((d) => d.events)).toHaveLength(30);
  });

  it("formats times the way Google Calendar does", () => {
    expect(formatRange(600, 630)).toBe("10 – 10:30am");
    expect(formatRange(660, 780)).toBe("11am – 1pm");
    expect(formatRange(720, 780)).toBe("12 – 1pm");
    expect(formatRange(690, 750)).toBe("11:30am – 12:30pm");
    expect(formatRange(1320, 1350)).toBe("10 – 10:30pm");
  });
});

describe("validateLabels", () => {
  it("keeps keys and hints, and makes keys for new categories", () => {
    const labels = defaultUserLabels();
    const withNew = [...labels, { key: "", name: "Book club", color: "#FFA6D6", what: " Reading ", examples: ["Book club", "Library"] }];
    const v = validateLabels(withNew);
    expect(v.error).toBeUndefined();
    expect(v.labels!.map((l) => l.key)).toEqual([...labels.map((l) => l.key), "book_club"]);
    expect(v.labels!.at(-1)).toMatchObject({ color: "#ffa6d6", what: "Reading", examples: ["Book club", "Library"] });
    const withHint = labels.find((l) => l.not_for);
    if (withHint) expect(v.labels!.find((l) => l.key === withHint.key)?.not_for).toBe(withHint.not_for);
  });

  it("rejects what the form rejects", () => {
    const labels = defaultUserLabels();
    expect(validateLabels("nope").error).toBeDefined();
    expect(validateLabels([]).error).toMatch(/at least one/);
    expect(validateLabels([{ ...labels[0] }, { ...labels[1], name: labels[0].name }]).error).toMatch(/named/);
    expect(validateLabels([{ ...labels[0], name: " " }]).error).toMatch(/needs a name/);
    expect(validateLabels([{ ...labels[0], color: "pink" }]).error).toMatch(/valid color/);
    expect(validateLabels(Array.from({ length: 31 }, (_, i) => ({ ...labels[0], key: `k${i}`, name: `N${i}` }))).error).toMatch(/At most/);
  });
});
