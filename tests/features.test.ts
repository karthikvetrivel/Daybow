import { describe, expect, it } from "vitest";
import { buildState, contentHash, isLabelable, stripHtml } from "../lib/features";

const me = "me@example.com";

describe("buildState", () => {
  it("describes a timed meeting with other attendees", () => {
    const s = buildState(
      {
        id: "1",
        summary: "Alex <> Jordan",
        start: { dateTime: "2026-09-22T11:00:00-04:00" },
        end: { dateTime: "2026-09-22T11:30:00-04:00" },
        attendees: [
          { email: me, self: true, organizer: true },
          { email: "jordan@acme.com" },
          { email: "room@resource.calendar.google.com", resource: true },
        ],
        organizer: { email: me, self: true },
        hangoutLink: "https://meet.google.com/abc",
        recurringEventId: "master",
      },
      { userEmail: me, timeZone: "America/New_York" },
    );
    expect(s.title).toBe("Alex <> Jordan");
    expect(s.other_attendee_count).toBe(1);
    expect(s.other_attendee_domains).toEqual(["acme.com"]);
    expect(s.organizer_is_me).toBe(true);
    expect(s.has_video_call).toBe(true);
    expect(s.is_recurring).toBe(true);
    expect(s.duration_minutes).toBe(30);
    expect(s.start_hour_local).toBe(11);
    expect(s.weekday).toBe("Tuesday");
    expect(s.all_day).toBe(false);
    expect(s.source).toBe("user");
  });

  it("describes an all-day gmail event", () => {
    const s = buildState(
      {
        id: "2",
        summary: "Stay at Hampton Inn",
        start: { date: "2026-09-10" },
        end: { date: "2026-09-12" },
        eventType: "fromGmail",
        description: "<b>Check-in</b> 3pm &amp; more",
      },
      { userEmail: me, timeZone: "America/New_York" },
    );
    expect(s.all_day).toBe(true);
    expect(s.source).toBe("gmail");
    expect(s.duration_minutes).toBe(2 * 24 * 60);
    expect(s.start_hour_local).toBeNull();
    expect(s.description).toBe("Check-in 3pm & more");
  });

  it("strips html", () => {
    expect(stripHtml("a<br>b <a href='x'>c</a>&nbsp;d")).toBe("a b c d");
  });

  it("hash changes when the title changes", () => {
    const a = { id: "1", summary: "gym" };
    const b = { id: "1", summary: "gym + shower" };
    expect(contentHash(a)).not.toBe(contentHash(b));
    expect(contentHash(a)).toBe(contentHash({ ...a }));
  });

  it("only labels default and gmail events", () => {
    expect(isLabelable({ id: "1" })).toBe(true);
    expect(isLabelable({ id: "1", eventType: "fromGmail" })).toBe(true);
    expect(isLabelable({ id: "1", eventType: "workingLocation" })).toBe(false);
    expect(isLabelable({ id: "1", eventType: "birthday" })).toBe(false);
    expect(isLabelable({ id: "1", status: "cancelled" })).toBe(false);
  });
});

describe("date parsing", () => {
  it("accepts full timestamps in the all-day date field and never throws on junk", () => {
    const me = "me@example.com";
    const s = buildState({ id: "3", summary: "Stay", start: { date: "2026-09-10T00:00:00Z" }, end: { date: "2026-09-12T00:00:00Z" } }, { userEmail: me, timeZone: "UTC" });
    expect(s.all_day).toBe(true);
    expect(s.duration_minutes).toBe(2880);
    const junk = buildState({ id: "4", summary: "x", start: { dateTime: "not a date" } }, { userEmail: me, timeZone: "UTC" });
    expect(junk.start_local).toBe("");
    expect(junk.duration_minutes).toBeNull();
  });
});
