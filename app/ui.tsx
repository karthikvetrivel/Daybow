import type { UserLabel } from "@/lib/taxonomy";

/** A calendar glyph in the app's own style. */
export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 36 36" aria-hidden="true">
      <rect x="2" y="4" width="32" height="30" rx="7" fill="var(--surface)" stroke="var(--outline-strong)" />
      <rect x="2" y="4" width="32" height="9" rx="7" fill="#0b57d0" />
      <rect x="2" y="9" width="32" height="4" fill="#0b57d0" />
      <rect x="7" y="17" width="10" height="4" rx="2" fill="#f6bf26" />
      <rect x="19" y="17" width="10" height="4" rx="2" fill="#0b8043" />
      <rect x="7" y="24" width="14" height="4" rx="2" fill="#e67c73" />
      <rect x="23" y="24" width="6" height="4" rx="2" fill="#8e24aa" />
    </svg>
  );
}

export function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.4 5.7c4.3-4 7.1-9.9 7.1-17.4z" />
      <path fill="#FBBC05" d="M10.4 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.8-6.1C.9 16.6 0 20.2 0 24s.9 7.4 2.6 10.7l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.4-5.6l-7.4-5.7c-2.1 1.4-4.8 2.3-8 2.3-6.3 0-11.7-4.1-13.6-9.9l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function AppBar({ email }: { email?: string | null }) {
  return (
    <header className="appbar">
      <a className="brand" href="/" style={{ textDecoration: "none" }}>
        <Mark />
        <span><b>Daybow</b></span>
      </a>
      <div className="acct">
        {email ? (
          <>
            <span className="muted small">{email}</span>
            <span className="avatar" aria-hidden="true">{email[0]?.toUpperCase()}</span>
          </>
        ) : null}
      </div>
    </header>
  );
}

const SAMPLE: Array<[string, string, string]> = [
  // [category key, title, time]
  ["meeting", "Weekly sync", "10 – 10:30am"],
  ["focus", "Deep work", "11am – 1pm"],
  ["social", "Dinner w/ Sam", "7 – 9pm"],
  ["fitness", "Gym", "7 – 8am"],
  ["health", "Dentist", "2 – 3pm"],
  ["travel", "Flight to SFO", "5:45pm"],
  ["family", "Call with mom", "6 – 6:30pm"],
  ["routine", "Read + bed", "10pm"],
  ["personal", "Haircut", "4 – 4:30pm"],
];

/** A three-day strip that shows the categories the way Google Calendar shows events. */
export function WeekPreview({ labels }: { labels: UserLabel[] }) {
  const byKey = new Map(labels.map((l) => [l.key, l]));
  const fallback = labels[0];
  const days = [
    { name: "Mon", num: 28, items: [SAMPLE[3], SAMPLE[0], SAMPLE[1], SAMPLE[7]] },
    { name: "Tue", num: 29, items: [SAMPLE[4], SAMPLE[8], SAMPLE[6]], today: true },
    { name: "Wed", num: 30, items: [SAMPLE[5], SAMPLE[2]] },
  ];
  return (
    <div className="preview" aria-hidden="true">
      <div className="days">
        {days.map((d) => (
          <div className="day" key={d.name}>
            <div className="dayname">{d.name}</div>
            <div className={`daynum${d.today ? " today" : ""}`}>{d.num}</div>
            {d.items.map(([key, title, time]) => {
              const l = byKey.get(key) ?? labels[Math.abs(hash(key)) % Math.max(1, labels.length)] ?? fallback;
              return (
                <span className="chip" key={title} style={{ background: l?.color ?? "#5f6368" }}>
                  {title}
                  <small>{time}</small>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
