import React from "react";
import { C, inter, roboto } from "../theme";
import { CARD, BAR_H, HEAD_H, GUTTER, GRID, COL_W, HOUR_H, HOUR_START, HOUR_END, DAYS, TODAY, CATEGORIES } from "../data";

/** The static calendar frame: app bar, day headers, time gutter, grid lines. Chips are drawn on top by the caller. */
export function CalendarFrame({ children, legend = 0, socialColor }: { children?: React.ReactNode; legend?: number; socialColor?: string }) {
  const hours = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) hours.push(h);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div
        style={{
          position: "absolute",
          left: CARD.x,
          top: CARD.y,
          width: CARD.w,
          height: CARD.h,
          background: C.card,
          borderRadius: CARD.r,
          boxShadow: "0 30px 80px rgba(30, 40, 90, 0.16), 0 2px 6px rgba(30, 40, 90, 0.08)",
          overflow: "hidden",
        }}
      >
        {/* app bar */}
        <div style={{ position: "absolute", left: 0, top: 0, width: CARD.w, height: BAR_H, display: "flex", alignItems: "center", gap: 18, padding: "0 26px", boxSizing: "border-box", borderBottom: `1px solid ${C.line}`, fontFamily: roboto }}>
          <svg width="22" height="16" viewBox="0 0 22 16"><rect y="0" width="22" height="2.4" rx="1.2" fill={C.muted} /><rect y="6.8" width="22" height="2.4" rx="1.2" fill={C.muted} /><rect y="13.6" width="22" height="2.4" rx="1.2" fill={C.muted} /></svg>
          <Mark />
          <div style={{ fontSize: 23, color: C.ink2, marginRight: 14 }}>Calendar</div>
          <div style={{ border: `1px solid #c4c7c5`, borderRadius: 999, padding: "7px 18px", fontSize: 15, color: C.ink, fontWeight: 500 }}>Today</div>
          <Chevron dir={-1} />
          <Chevron dir={1} />
          <div style={{ fontSize: 23, color: C.ink, marginLeft: 6 }}>October 2026</div>
          <div style={{ flex: 1 }} />
          <div style={{ display: "flex", gap: 14, marginRight: 10, opacity: legend }}>
            {CATEGORIES.map((c, i) => (
              <div key={c.key} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14, color: C.ink2, opacity: Math.max(0, Math.min(1, legend * 9 - i)), transform: `translateY(${(1 - Math.max(0, Math.min(1, legend * 9 - i))) * 6}px)` }}>
                <span style={{ width: 12, height: 12, borderRadius: 999, background: c.key === "social" && socialColor ? socialColor : c.color, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.08)" }} />
                {c.name}
              </div>
            ))}
          </div>
          <div style={{ border: `1px solid #c4c7c5`, borderRadius: 999, padding: "7px 16px", fontSize: 15, color: C.ink, fontWeight: 500 }}>Week ▾</div>
          <div style={{ width: 34, height: 34, borderRadius: 999, background: "#c9c1ff", color: "#1f1f1f", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: inter, fontWeight: 700, fontSize: 15 }}>A</div>
        </div>
        {/* day headers */}
        {DAYS.map((d, i) => (
          <div key={d.short} style={{ position: "absolute", left: GUTTER + i * COL_W, top: BAR_H, width: COL_W, height: HEAD_H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: roboto }}>
            <div style={{ fontSize: 12, letterSpacing: 1.2, color: i === TODAY ? C.primary : C.muted, fontWeight: 500 }}>{d.short}</div>
            <div style={{ marginTop: 4, width: 42, height: 42, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, background: i === TODAY ? C.primary : "transparent", color: i === TODAY ? "#fff" : C.ink }}>{d.num}</div>
          </div>
        ))}
        {/* hour lines and labels */}
        {hours.map((h) => (
          <React.Fragment key={h}>
            <div style={{ position: "absolute", left: GUTTER - 8, top: BAR_H + HEAD_H + (h - HOUR_START) * HOUR_H, width: CARD.w - GUTTER - 16, height: 1, background: C.lineSoft }} />
            {h > HOUR_START && h < HOUR_END ? (
              <div style={{ position: "absolute", left: 0, width: GUTTER - 16, top: BAR_H + HEAD_H + (h - HOUR_START) * HOUR_H - 8, textAlign: "right", fontSize: 12, color: C.muted, fontFamily: roboto }}>{`${((h + 11) % 12) + 1} ${h >= 12 ? "PM" : "AM"}`}</div>
            ) : null}
          </React.Fragment>
        ))}
        {/* day separators */}
        {DAYS.map((_, i) => (
          <div key={i} style={{ position: "absolute", left: GUTTER + i * COL_W, top: BAR_H + HEAD_H - 14, width: 1, height: CARD.h - BAR_H - HEAD_H, background: C.lineSoft }} />
        ))}
        {/* current time on today */}
        <div style={{ position: "absolute", left: GUTTER + TODAY * COL_W - 6, top: BAR_H + HEAD_H + (12.67 - HOUR_START) * HOUR_H - 6, width: 12, height: 12, borderRadius: 999, background: "#ea4335" }} />
        <div style={{ position: "absolute", left: GUTTER + TODAY * COL_W, top: BAR_H + HEAD_H + (12.67 - HOUR_START) * HOUR_H - 1, width: COL_W, height: 2, background: "#ea4335" }} />
      </div>
      {children}
    </div>
  );
}

function Chevron({ dir }: { dir: 1 | -1 }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" style={{ transform: dir < 0 ? "scaleX(-1)" : undefined }}>
      <path d="M9 6l6 6-6 6" stroke={C.ink2} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The product's own mark: a small calendar with pastel bars. */
export function Mark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36">
      <rect x="2" y="4" width="32" height="30" rx="7" fill="#fff" stroke="#747775" />
      <rect x="2" y="4" width="32" height="9" rx="7" fill="#0b57d0" />
      <rect x="2" y="9" width="32" height="4" fill="#0b57d0" />
      <rect x="7" y="17" width="10" height="4" rx="2" fill="#ffe08a" />
      <rect x="19" y="17" width="10" height="4" rx="2" fill="#b5ead7" />
      <rect x="7" y="24" width="14" height="4" rx="2" fill="#ffb7b2" />
      <rect x="23" y="24" width="6" height="4" rx="2" fill="#d7b8ff" />
    </svg>
  );
}

export { GRID };
