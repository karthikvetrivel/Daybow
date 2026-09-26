import React from "react";
import { C, inter, roboto } from "../theme";

/** Google's toast at the bottom left of the calendar. */
export function Toast({ x, y, text, opacity }: { x: number; y: number; text: string; opacity: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y, opacity, background: C.toast, color: "#e8eaed", fontFamily: roboto, fontSize: 16, padding: "13px 20px", borderRadius: 8, boxShadow: "0 8px 20px rgba(0,0,0,0.25)", whiteSpace: "nowrap" }}>
      {text}
    </div>
  );
}

/** A video annotation (not part of any product UI): what Jev decided. */
export function Callout({ x, y, color, label, opacity, dy }: { x: number; y: number; color: string; label: string; opacity: number; dy: number }) {
  return (
    <div style={{ position: "absolute", left: x, top: y + dy, opacity, display: "flex", alignItems: "center", gap: 10, background: "#1f1f1f", color: "#fff", fontFamily: inter, fontWeight: 600, fontSize: 18, padding: "9px 16px 9px 12px", borderRadius: 999, boxShadow: "0 10px 24px rgba(0,0,0,0.22)", whiteSpace: "nowrap" }}>
      <span style={{ width: 16, height: 16, borderRadius: 999, background: color, display: "inline-block" }} />
      {label}
    </div>
  );
}

/** A caption pill at the bottom of the frame. */
export function Caption({ text, opacity, y, size = 36, maxWidth = 1500 }: { text: string; opacity: number; y: number; size?: number; maxWidth?: number }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", opacity, transform: `translateY(${(1 - opacity) * 14}px)` }}>
      <div style={{ maxWidth, background: "#ffffff", color: C.ink, fontFamily: inter, fontWeight: 650, fontSize: size, letterSpacing: -0.4, padding: "16px 30px", borderRadius: 999, boxShadow: "0 12px 30px rgba(30,40,90,0.16)", textAlign: "center", lineHeight: 1.2 }}>
        {text}
      </div>
    </div>
  );
}

/** Category pills, used in the legend, the intro, and the end card. */
export function Pill({ color, name, size = 18, opacity = 1, dy = 0 }: { color: string; name: string; size?: number; opacity?: number; dy?: number }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: size * 0.5, background: color, color: C.ink, borderRadius: 999, padding: `${size * 0.35}px ${size * 0.8}px`, fontFamily: inter, fontWeight: 600, fontSize: size, opacity, transform: `translateY(${dy}px)` }}>
      {name}
    </div>
  );
}
