import React from "react";
import { C, roboto } from "../theme";

export const DIALOG = { w: 450, h: 300 };

/** Google Calendar's small "create event" dialog, as it looks in the week view. */
export function QuickCreate({ x, y, typed, caretOn, scale, opacity, savePressed }: { x: number; y: number; typed: string; caretOn: boolean; scale: number; opacity: number; savePressed: boolean }) {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: DIALOG.w,
        height: DIALOG.h,
        background: "#fff",
        borderRadius: 16,
        boxShadow: "0 24px 48px rgba(20,30,60,0.22), 0 2px 6px rgba(20,30,60,0.12)",
        transform: `scale(${scale})`,
        transformOrigin: "right center",
        opacity,
        fontFamily: roboto,
        boxSizing: "border-box",
        padding: "18px 22px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "flex-end", color: C.muted, fontSize: 22, lineHeight: 1 }}>×</div>
      <div style={{ marginTop: 6, marginLeft: 38, borderBottom: `2px solid ${C.primary}`, paddingBottom: 8, fontSize: 24, color: typed ? C.ink : "#80868b", whiteSpace: "nowrap" }}>
        {typed || "Add title"}
        <span style={{ display: "inline-block", width: 2, height: 26, marginLeft: 1, verticalAlign: "-4px", background: caretOn ? C.ink : "transparent" }} />
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, marginLeft: 38 }}>
        {["Event", "Task", "Appointment schedule"].map((t, i) => (
          <div key={t} style={{ padding: "6px 12px", borderRadius: 8, fontSize: 14, fontWeight: 500, background: i === 0 ? "#d3e3fd" : "transparent", color: i === 0 ? "#041e49" : C.ink2 }}>{t}</div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20, color: C.ink2, fontSize: 16 }}>
        <svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke={C.muted} strokeWidth="2" fill="none" /><path d="M12 7v5l3 2" stroke={C.muted} strokeWidth="2" fill="none" strokeLinecap="round" /></svg>
        <div>
          <div style={{ color: C.ink }}>Thursday, October 8</div>
          <div style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>7:00 – 8:30pm · Does not repeat</div>
        </div>
      </div>
      <div style={{ position: "absolute", right: 22, bottom: 20, display: "flex", gap: 10, alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: C.primary, padding: "10px 14px" }}>More options</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: "#fff", background: savePressed ? "#0842a0" : C.primary, borderRadius: 999, padding: "10px 24px" }}>Save</div>
      </div>
    </div>
  );
}
