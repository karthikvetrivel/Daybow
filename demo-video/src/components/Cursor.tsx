import React from "react";

/** A macOS-style arrow cursor. (x, y) is the tip. */
export function Cursor({ x, y, pressed, opacity }: { x: number; y: number; pressed: boolean; opacity: number }) {
  return (
    <svg
      width="30"
      height="40"
      viewBox="0 0 15 20"
      style={{ position: "absolute", left: x - 1.5, top: y - 1.5, opacity, transform: `scale(${pressed ? 0.88 : 1})`, transformOrigin: "2px 2px", filter: "drop-shadow(0 3px 5px rgba(0,0,0,0.28))" }}
    >
      <path d="M1 1 L1 16.2 L4.9 12.6 L7.6 18.7 L10.1 17.6 L7.5 11.7 L12.8 11.7 Z" fill="#fff" stroke="#111" strokeWidth="1.1" strokeLinejoin="round" />
    </svg>
  );
}

/** An expanding ring where a click happened. */
export function Ripple({ x, y, t }: { x: number; y: number; t: number }) {
  if (t <= 0 || t >= 1) return null;
  const r = 10 + 34 * t;
  return <div style={{ position: "absolute", left: x - r, top: y - r, width: r * 2, height: r * 2, borderRadius: 999, border: "3px solid rgba(11,87,208,0.55)", opacity: 1 - t, boxSizing: "border-box" }} />;
}
