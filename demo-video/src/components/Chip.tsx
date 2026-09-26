import React from "react";
import { C, roboto } from "../theme";
import { range, type Ev } from "../data";

export function Chip({ e, rect, bg, text, scale = 1, opacity = 1, title, outline }: { e: Ev; rect: { x: number; y: number; w: number; h: number }; bg: string; text: string; scale?: number; opacity?: number; title?: string; outline?: string }) {
  const tall = rect.h > 40;
  return (
    <div
      style={{
        position: "absolute",
        left: rect.x,
        top: rect.y,
        width: rect.w,
        height: rect.h,
        background: bg,
        color: text,
        borderRadius: 7,
        padding: tall ? "5px 9px" : "2px 9px",
        boxSizing: "border-box",
        fontFamily: roboto,
        overflow: "hidden",
        transform: `scale(${scale})`,
        transformOrigin: "center",
        opacity,
        boxShadow: outline ? `0 0 0 2px ${outline}` : scale > 1.001 ? "0 6px 18px rgba(20,30,60,0.18)" : "none",
        lineHeight: 1.25,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title ?? e.title}</div>
      {tall ? <div style={{ fontSize: 13, opacity: 0.85, marginTop: 1, whiteSpace: "nowrap" }}>{range(e)}</div> : null}
    </div>
  );
}

export const WHITE = "#ffffff";
export { C };
