import { describe, expect, it } from "vitest";
import { createJevClient } from "../lib/jev";
import { buildState } from "../lib/features";

const key = process.env.TYPESAFE_API_KEY;

describe.skipIf(!key)("Jev live", () => {
  it("labels a few clear events correctly", async () => {
    const jev = createJevClient({ apiKey: key! });
    const me = "me@example.com";
    const tz = "America/New_York";
    const cases: Array<[Parameters<typeof buildState>[0], string]> = [
      [{ id: "1", summary: "Flight to Lisbon (TP 204)", eventType: "fromGmail", start: { dateTime: "2026-07-30T20:35:00-04:00" }, end: { dateTime: "2026-07-31T13:00:00+03:00" }, location: "New York JFK" }, "travel"],
      [{ id: "2", summary: "leg day at the gym", start: { dateTime: "2026-09-25T15:30:00-04:00" }, end: { dateTime: "2026-09-25T17:00:00-04:00" } }, "fitness"],
      [{ id: "3", summary: "Pre-op checkup", start: { dateTime: "2026-09-23T15:30:00-04:00" }, end: { dateTime: "2026-09-23T16:00:00-04:00" } }, "health"],
      [{ id: "4", summary: "Alex <> Jordan", start: { dateTime: "2026-09-22T11:00:00-04:00" }, end: { dateTime: "2026-09-22T11:30:00-04:00" }, attendees: [{ email: me, self: true }, { email: "jordan@acme.com" }], hangoutLink: "https://meet.google.com/x" }, "meeting"],
    ];
    for (const [event, expected] of cases) {
      const a = await jev.classify(buildState(event, { userEmail: me, timeZone: tz }));
      expect(a.label, event.summary).toBe(expected);
      expect(a.confidence).toBeGreaterThan(0.5);
    }
  });
});
