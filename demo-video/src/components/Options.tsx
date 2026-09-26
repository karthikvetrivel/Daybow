import React from "react";
import { C, inter, roboto } from "../theme";
import { CATEGORIES, COLOR, SOCIAL_RECOLOR, type Key } from "../data";
import { T } from "../timeline";
import { inOut, mix, out, prog } from "../anim";
import { Mark } from "./Calendar";

/**
 * The extension's configuration page with the calendar-style categories editor:
 * a sample week built from each category's example titles, and an event-style
 * card with the pastel palette. Simplified to what the scene needs.
 */
export const PANEL = { x: 900, y: 110, w: 940, h: 860 };

const CARD = { x: 16, y: 80, w: 908, h: 452 };
const WEEK = { x: CARD.x + 32, y: CARD.y + 150, w: CARD.w - 64, head: 76, chipH: 46, gap: 6 };
const COL = WEEK.w / 7;
const DAYS: Array<[string, number]> = [["Mon", 5], ["Tue", 6], ["Wed", 7], ["Thu", 8], ["Fri", 9], ["Sat", 10], ["Sun", 11]];
const TODAY = 1;

type MiniEvent = { key: Key; title: string; time: string };
// The product lays out each category's example titles over the week, as here.
const WEEK_EVENTS: MiniEvent[][] = [
  [{ key: "fitness", title: "leg day", time: "7 – 8am" }, { key: "meeting", title: "Alex <> Jordan", time: "10 – 10:30am" }, { key: "focus", title: "work block", time: "11am – 1pm" }],
  [{ key: "health", title: "Dentist", time: "2 – 3pm" }, { key: "personal", title: "Haircut", time: "4 – 4:30pm" }, { key: "family", title: "Mom in town", time: "6 – 6:30pm" }],
  [{ key: "meeting", title: "Weekly team sync", time: "2 – 3pm" }, { key: "travel", title: "Flight to Lisbon", time: "5:45 – 7:15pm" }, { key: "social", title: "Potluck at Chris's", time: "7:30 – 9pm" }],
  [{ key: "health", title: "Pre-op checkup", time: "8:30 – 9:15am" }, { key: "focus", title: "work work work", time: "9 – 11am" }, { key: "meeting", title: "Review with Priya", time: "11 – 11:45am" }],
  [{ key: "focus", title: "coffee + work", time: "1:30 – 3pm" }, { key: "health", title: "Therapy", time: "4:30 – 5pm" }, { key: "social", title: "Dinner w/ Maya", time: "7 – 9pm" }],
  [{ key: "fitness", title: "5k run", time: "8 – 9:15am" }, { key: "personal", title: "Movers arrival", time: "10:30 – 11:30am" }, { key: "social", title: "Concert downtown", time: "8 – 10pm" }],
  [{ key: "routine", title: "morning routine", time: "7:30 – 8am" }, { key: "family", title: "Call with dad", time: "11am – 12:30pm" }, { key: "travel", title: "Train to New York", time: "3 – 5pm" }],
];

const chipX = (day: number) => WEEK.x + day * COL + 5;
const chipY = (row: number) => WEEK.y + WEEK.head + row * (WEEK.chipH + WEEK.gap);

/** The event that the cursor clicks: "Potluck at Chris's" on Wednesday. */
const TARGET = { day: 2, row: 2 };

// The card opens beside the clicked event, kept inside the page.
const POP = { w: 400, h: 468 };
const POP_X = chipX(TARGET.day) + COL - 10 + 10;
const POP_Y = Math.min(chipY(TARGET.row) - 8, PANEL.h - POP.h - 18);
const GRID = { x: 64, y: 124, size: 36, gap: 12 };

const PASTELS = [
  "#ffb7b2", "#ffc8a2", "#ffe08a", "#b5ead7", "#a8d1ff", "#c9c1ff",
  "#ffa6d6", "#ffd8b1", "#fff2a6", "#e2f0cb", "#a8e6ef", "#d7b8ff",
  "#ff9eaa", "#ffb38a", "#ffcf6e", "#c5e6a0", "#9fb8ff", "#efb8f5",
  "#f3d6dc", "#ecdcc6", "#f7ecc9", "#cfdcc8", "#d6e2e9", "#e2e0ea",
];
const PICK = PASTELS.indexOf(SOCIAL_RECOLOR); // Bubblegum: row 2, column 1
const swatchCenter = (i: number) => ({
  x: POP_X + GRID.x + (i % 6) * (GRID.size + GRID.gap) + GRID.size / 2,
  y: POP_Y + GRID.y + Math.floor(i / 6) * (GRID.size + GRID.gap) + GRID.size / 2,
});

/** Stage points for the cursor, in the same coordinates as PANEL. */
export const OPTIONS_POINTS = {
  chip: { x: PANEL.x + chipX(TARGET.day) + COL * 0.45, y: PANEL.y + chipY(TARGET.row) + WEEK.chipH / 2 },
  swatch: { x: PANEL.x + swatchCenter(PICK).x, y: PANEL.y + swatchCenter(PICK).y },
};

function Icon({ d, size = 22 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={C.ink2} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function OptionsPanel({ x, opacity, f }: { x: number; opacity: number; f: number }) {
  const popIn = prog(f, T.popIn[0], T.popIn[1], out);
  const pick = prog(f, T.swatchMorph[0], T.swatchMorph[1], inOut);
  const socialNow = mix(COLOR.social, SOCIAL_RECOLOR, pick);
  const snack = Math.min(prog(f, T.snack[0], 10, out), 1 - prog(f, T.snack[1] - 10, 10));
  const chipPressed = f >= T.chipClick && f < T.chipClick + 7;
  let socialIndex = 0;

  return (
    <div style={{ position: "absolute", left: x, top: PANEL.y, width: PANEL.w, height: PANEL.h, opacity, background: "#f8fafd", borderRadius: 24, boxShadow: "0 40px 90px rgba(20,30,70,0.28), 0 2px 8px rgba(20,30,70,0.12)", overflow: "hidden", fontFamily: roboto }}>
      {/* App bar */}
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 64, display: "flex", alignItems: "center", gap: 12, padding: "0 24px", borderBottom: `1px solid ${C.line}` }}>
        <Mark size={30} />
        <div style={{ fontSize: 21, color: C.ink2, fontWeight: 500 }}>Daybow</div>
        <div style={{ flex: 1 }} />
        <div style={{ width: 32, height: 32, borderRadius: 999, background: C.primary, color: "#fff", display: "grid", placeItems: "center", fontSize: 15, fontWeight: 500 }}>A</div>
      </div>

      {/* Categories card */}
      <div style={{ position: "absolute", left: CARD.x, top: CARD.y, width: CARD.w, height: CARD.h, background: "#fff", borderRadius: 16, boxShadow: "0 1px 2px rgba(60,64,67,.3), 0 1px 3px 1px rgba(60,64,67,.15)" }}>
        <div style={{ position: "absolute", left: 32, top: 22, fontFamily: inter, fontWeight: 650, fontSize: 24, color: C.ink }}>Categories</div>
        <div style={{ position: "absolute", right: 32, top: 22, background: "#f0f4f9", color: C.ink2, borderRadius: 999, padding: "5px 14px", fontSize: 14, fontWeight: 500 }}>9 of 30</div>
        <div style={{ position: "absolute", left: 32, top: 64, fontSize: 16, color: C.muted }}>Click an event to recolor its category or change what it catches.</div>
        <div style={{ position: "absolute", left: 32, top: 98, display: "flex", gap: 8 }}>
          {CATEGORIES.map((c) => {
            const on = c.key === "social";
            const color = on ? socialNow : c.color;
            return (
              <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px 0 10px", borderRadius: 8, border: `1px solid ${on && popIn > 0.5 ? C.ink2 : "#dadce0"}`, fontSize: 14, fontWeight: 500, color: C.ink, opacity: on ? 1 : 1 - 0.55 * popIn, background: "#fff" }}>
                <span style={{ width: 12, height: 12, borderRadius: 999, background: color }} />
                {c.name}
              </div>
            );
          })}
        </div>
      </div>

      {/* The week */}
      <div style={{ position: "absolute", left: WEEK.x, top: WEEK.y, width: WEEK.w, height: WEEK.head + 3 * (WEEK.chipH + WEEK.gap) + 8, border: "1px solid #dadce0", borderRadius: 12, boxSizing: "border-box" }}>
        {DAYS.map(([name, num], d) => (
          <div key={name} style={{ position: "absolute", left: d * COL, top: 0, width: COL, height: "100%", borderRight: d < 6 ? "1px solid #dadce0" : "none", boxSizing: "border-box", textAlign: "center" }}>
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 500, letterSpacing: 0.8, color: d === TODAY ? C.primary : C.muted }}>{name.toUpperCase()}</div>
            <div style={{ margin: "3px auto 0", width: 38, height: 38, borderRadius: 999, display: "grid", placeItems: "center", fontSize: 21, background: d === TODAY ? C.primary : "transparent", color: d === TODAY ? "#fff" : C.ink }}>{num}</div>
          </div>
        ))}
      </div>
      {WEEK_EVENTS.flatMap((day, d) =>
        day.map((ev, r) => {
          const social = ev.key === "social";
          const j = social ? socialIndex++ : 0;
          const wave = social ? prog(f, T.swatchMorph[0] + j * 5, 16, out) : 0;
          const color = social ? mix(COLOR.social, SOCIAL_RECOLOR, wave) : COLOR[ev.key];
          const target = d === TARGET.day && r === TARGET.row;
          return (
            <div key={`${d}-${r}`} style={{ position: "absolute", left: chipX(d), top: chipY(r), width: COL - 10, height: WEEK.chipH, borderRadius: 7, background: color, padding: "5px 8px", boxSizing: "border-box", opacity: social ? 1 : 1 - 0.7 * popIn, transform: target && chipPressed ? "scale(0.97)" : "none", boxShadow: target && popIn > 0 ? "0 2px 6px rgba(60,64,67,.35)" : "none" }}>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.ink, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.title}</div>
              <div style={{ fontSize: 12, color: "rgba(31,31,31,.78)", whiteSpace: "nowrap" }}>{ev.time}</div>
            </div>
          );
        }),
      )}
      <div style={{ position: "absolute", right: 48, top: CARD.y + CARD.h - 44, fontSize: 14, fontWeight: 500, color: C.primary }}>Reset to defaults</div>

      {/* The next cards on the page */}
      <div style={{ position: "absolute", left: CARD.x, top: CARD.y + CARD.h + 16, width: CARD.w, height: 120, background: "#fff", borderRadius: 16, boxShadow: "0 1px 2px rgba(60,64,67,.3)" }}>
        <div style={{ position: "absolute", left: 32, top: 22, fontSize: 17, fontWeight: 500, color: C.ink }}>Jev API key</div>
        <div style={{ position: "absolute", left: 32, right: 170, top: 58, height: 40, background: "#f0f4f9", borderBottom: "1px solid #747775", borderRadius: "4px 4px 0 0" }} />
        <div style={{ position: "absolute", right: 32, top: 58, height: 40, width: 120, border: "1px solid #747775", borderRadius: 999, color: C.primary, display: "grid", placeItems: "center", fontSize: 15, fontWeight: 500 }}>Save key</div>
      </div>
      <div style={{ position: "absolute", left: CARD.x, top: CARD.y + CARD.h + 152, width: CARD.w, height: 200, background: "#fff", borderRadius: 16, boxShadow: "0 1px 2px rgba(60,64,67,.3)" }}>
        <div style={{ position: "absolute", left: 32, top: 22, fontSize: 17, fontWeight: 500, color: C.ink }}>Tuning</div>
      </div>

      {/* The event-style card */}
      {popIn > 0 ? (
        <div style={{ position: "absolute", left: POP_X, top: POP_Y, width: POP.w, height: POP.h, background: "#fff", borderRadius: 20, boxShadow: "0 4px 8px 3px rgba(60,64,67,.15), 0 1px 3px rgba(60,64,67,.3)", opacity: popIn, transform: `translateY(${(1 - popIn) * 8}px) scale(${0.97 + 0.03 * popIn})`, transformOrigin: "0 0" }}>
          <div style={{ position: "absolute", right: 64, top: 14 }}><Icon d="M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5" /></div>
          <div style={{ position: "absolute", right: 22, top: 14 }}><Icon d="M6 6l12 12M18 6L6 18" /></div>
          <div style={{ position: "absolute", left: 26, top: 72, width: 18, height: 18, borderRadius: 4, background: socialNow }} />
          <div style={{ position: "absolute", left: GRID.x, right: 24, top: 56, height: 46, borderBottom: "1px solid #c4c7c5", fontSize: 28, color: C.ink }}>Social</div>
          <div style={{ position: "absolute", left: 24, top: GRID.y + 4 }}>
            <Icon d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1-.8-1.3-.8-2.2 0-1 .8-1.6 1.8-1.6H17a4 4 0 0 0 4-4C21 6.8 17 3 12 3z" />
          </div>
          {PASTELS.map((hex, i) => {
            const checked = pick < 0.5 ? hex === COLOR.social : i === PICK;
            const pressed = i === PICK && f >= T.swatchClick && f < T.swatchClick + 7;
            return (
              <div key={hex} style={{ position: "absolute", left: GRID.x + (i % 6) * (GRID.size + GRID.gap), top: GRID.y + Math.floor(i / 6) * (GRID.size + GRID.gap), width: GRID.size, height: GRID.size, borderRadius: 999, background: hex, boxShadow: checked ? "0 0 0 2px #fff, 0 0 0 4px #444746" : "none", transform: pressed ? "scale(0.9)" : "none", display: "grid", placeItems: "center" }}>
                {checked ? (
                  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#1f1f1f" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                ) : null}
              </div>
            );
          })}
          <div style={{ position: "absolute", left: GRID.x, top: GRID.y + 4 * (GRID.size + GRID.gap) + 2, display: "flex", alignItems: "center", gap: 12, fontSize: 15, color: C.ink2 }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, border: "1.5px dashed #747775", display: "grid", placeItems: "center" }}><Icon d="M12 5v14M5 12h14" size={18} /></div>
            Custom color
          </div>
          <div style={{ position: "absolute", left: 24, top: 364 }}>
            <Icon d="M3.5 12.2V4.5a1 1 0 0 1 1-1h7.7l8.3 8.3-8.7 8.7-8.3-8.3z" />
          </div>
          <div style={{ position: "absolute", left: GRID.x, top: 362, fontSize: 14, color: C.muted }}>Catches titles like</div>
          <div style={{ position: "absolute", left: GRID.x, right: 20, top: 388, display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["Dinner w/ Maya", "Potluck at Chris's", "Concert downtown"].map((t) => (
              <div key={t} style={{ height: 30, padding: "0 12px", borderRadius: 8, background: mix("#ffffff", pick < 1 ? COLOR.social : SOCIAL_RECOLOR, 0.55), display: "flex", alignItems: "center", fontSize: 14, color: C.ink }}>{t}</div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Snackbar, like the product's */}
      {snack > 0 ? (
        <div style={{ position: "absolute", left: 24, bottom: 24, background: "#313033", color: "#f4eff4", fontSize: 17, padding: "15px 20px", borderRadius: 6, opacity: snack, transform: `translateY(${(1 - snack) * 12}px)`, boxShadow: "0 6px 16px rgba(0,0,0,0.25)" }}>
          Social is now Bubblegum.
        </div>
      ) : null}
    </div>
  );
}
