import React from "react";
import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, inter } from "./theme";
import { CATEGORIES, CARD, COLOR, COL_W, EVENTS, GRID, NEW_EVENT, SOCIAL_RECOLOR, chipRect, type Ev } from "./data";
import { T } from "./timeline";
import { clamp01, inOut, keyframes, mix, out, prog, s } from "./anim";
import { CalendarFrame, Mark } from "./components/Calendar";
import { Chip } from "./components/Chip";
import { Cursor, Ripple } from "./components/Cursor";
import { DIALOG, QuickCreate } from "./components/QuickCreate";
import { Callout, Caption, Pill, Toast } from "./components/Overlays";
import { OPTIONS_POINTS, OptionsPanel, PANEL } from "./components/Options";

export type Layout = "wide" | "square";

const W = 1920;
const H = 1080;

// Where things sit on the stage.
const NEW_RECT = chipRect(NEW_EVENT);
const DLG = { x: NEW_RECT.x - 16 - DIALOG.w, y: NEW_RECT.y - 200 };
const SAVE_BTN = { x: DLG.x + DIALOG.w - 22 - 50, y: DLG.y + DIALOG.h - 20 - 20 };
const SLOT_PT = { x: NEW_RECT.x + COL_W * 0.42, y: NEW_RECT.y + 26 };
const CAT_CHIP = OPTIONS_POINTS.chip;
const SWATCH = OPTIONS_POINTS.swatch;
const TOAST_POS = { x: CARD.x + 36, y: CARD.y + CARD.h - 80 };

// Social events recolor in time order during the category recolor.
const SOCIAL_ORDER = [...EVENTS.filter((e) => e.key === "social"), NEW_EVENT].sort((a, b) => a.day - b.day || a.start - b.start);

function fade(f: number, [a, b]: readonly [number, number], d = 10) {
  return Math.min(prog(f, a, d), 1 - prog(f, b - d, d));
}

function remapColor(f: number, e: Ev): { color: string; pop: number } {
  const j = SOCIAL_ORDER.indexOf(e);
  if (j < 0) return { color: COLOR[e.key], pop: 0 };
  const p = prog(f, T.remapStart + j * T.remapStep, 14, out);
  return { color: mix(COLOR.social, SOCIAL_RECOLOR, p), pop: Math.sin(Math.PI * p) };
}

function Stage({ f, layout }: { f: number; layout: Layout }) {
  const afterSaveCx = layout === "square" ? 640 : 700;
  const { fps } = useVideoConfig();

  // Camera
  const cam = keyframes(f, [
    { at: 0, z: 1, cx: W / 2, cy: H / 2 },
    { at: T.zoomIn[0], z: 1, cx: W / 2, cy: H / 2 },
    { at: T.zoomIn[0] + T.zoomIn[1], z: 2.1, cx: 770, cy: 830 },
    { at: T.saved + s(0.35), z: 2.1, cx: 770, cy: 830 },
    { at: T.saved + s(1.1), z: 1.75, cx: afterSaveCx, cy: 800 },
    { at: T.zoomOut[0], z: 1.75, cx: afterSaveCx, cy: 800 },
    { at: T.zoomOut[0] + T.zoomOut[1], z: 1, cx: W / 2, cy: H / 2 },
    { at: T.optionsIn[0], z: 1, cx: W / 2, cy: H / 2 },
    { at: T.optionsIn[0] + T.optionsIn[1], z: 1.06, cx: PANEL.x + PANEL.w / 2, cy: 540 },
    { at: T.optionsOut[0], z: 1.06, cx: PANEL.x + PANEL.w / 2, cy: 540 },
    { at: T.optionsOut[0] + T.optionsOut[1], z: 1, cx: W / 2, cy: H / 2 },
  ]);

  // Card entrance
  const enter = spring({ frame: f - T.cardIn, fps, config: { damping: 18, stiffness: 90, mass: 0.9 } });
  const cardY = (1 - enter) * 260;
  const cardScale = 0.92 + 0.08 * enter;
  const exit = prog(f, T.outroIn, s(0.5), inOut);

  // Existing events: wave from the default color to their category
  const chips = EVENTS.map((e, i) => {
    const p = prog(f, T.waveStart + i * T.waveStep, T.waveDur, out);
    const remap = e.key === "social" ? remapColor(f, e) : { color: COLOR[e.key], pop: 0 };
    const bg = p < 1 ? mix(C.before, COLOR[e.key], p) : remap.color;
    const text = mix("#ffffff", C.ink, p);
    const scale = 1 + 0.07 * Math.sin(Math.PI * p) + 0.06 * remap.pop;
    return <Chip key={i} e={e} rect={chipRect(e)} bg={bg} text={text} scale={scale} />;
  });

  // The event created on camera
  let created: React.ReactNode = null;
  if (f >= T.dialogIn) {
    const n = f < T.typeStart ? 0 : Math.min(T.title.length, Math.floor((f - T.typeStart) / T.perChar) + 1);
    const typed = T.title.slice(0, n);
    if (f < T.saved) {
      const appear = prog(f, T.dialogIn, 8, out);
      created = <Chip e={NEW_EVENT} rect={NEW_RECT} bg={mix("#ffffff", C.before, 0.72)} text="#ffffff" title={typed || "(No title)"} opacity={appear} />;
    } else {
      const pop = prog(f, T.saved, 16, out);
      const remap = remapColor(f, NEW_EVENT);
      created = <Chip e={NEW_EVENT} rect={NEW_RECT} bg={remap.color} text={C.ink} scale={1.1 - 0.1 * pop + 0.06 * remap.pop} />;
    }
  }

  // Dialog
  const dlgIn = prog(f, T.dialogIn, 12, out);
  const dlgOut = prog(f, T.saved, 7, inOut);
  const dialogVisible = f >= T.dialogIn && dlgOut < 1;
  const typedCount = f < T.typeStart ? 0 : Math.min(T.title.length, Math.floor((f - T.typeStart) / T.perChar) + 1);
  const typing = f >= T.typeStart && f < T.typeEnd + 6;
  const caretOn = typing || Math.floor(f / 32) % 2 === 0;

  // Callout: Jev's decision, which arrives about 0.3 s after the last keystroke
  const callIn = prog(f, T.predictAt, 12, out);
  const callOut = prog(f, T.saved + s(1.3), 12, inOut);

  // Toast
  const savingOp = fade(f, T.toastSaving, 8);
  const savedOp = fade(f, T.toastSaved, 8);

  // Options panel
  const panelIn = prog(f, T.optionsIn[0], T.optionsIn[1], out);
  const panelOut = prog(f, T.optionsOut[0], T.optionsOut[1], inOut);
  const panelX = PANEL.x + (1 - panelIn) * 900 + panelOut * 900;
  const panelOpacity = Math.min(panelIn * 1.4, 1 - panelOut);

  // Cursor
  const park = { x: DLG.x + DIALOG.w + 170, y: DLG.y + DIALOG.h - 10 };
  const pos = keyframes(f, [
    { at: T.cursorShow, x: 1290, y: 1060 },
    { at: T.slotArrive, x: SLOT_PT.x, y: SLOT_PT.y },
    { at: T.typeStart + 4, x: SLOT_PT.x, y: SLOT_PT.y },
    { at: T.typeStart + s(0.45), x: SLOT_PT.x + 40, y: SLOT_PT.y + 60 },
    { at: T.saveMoveStart, x: SLOT_PT.x + 40, y: SLOT_PT.y + 60 },
    { at: T.saveClick - 4, x: SAVE_BTN.x, y: SAVE_BTN.y },
    { at: T.saved + s(0.5), x: SAVE_BTN.x, y: SAVE_BTN.y },
    { at: T.saved + s(1.3), x: park.x, y: park.y },
    { at: T.optionsIn[0] + T.optionsIn[1], x: park.x + 150, y: park.y - 120 },
    { at: T.chipArrive, x: CAT_CHIP.x, y: CAT_CHIP.y },
    { at: T.chipClick + s(0.2), x: CAT_CHIP.x, y: CAT_CHIP.y },
    { at: T.swatchArrive, x: SWATCH.x, y: SWATCH.y },
    { at: T.swatchClick + s(0.35), x: SWATCH.x, y: SWATCH.y },
    { at: T.cursorHide + s(0.4), x: SWATCH.x + 140, y: SWATCH.y + 60 },
  ]);
  const clicks = [T.slotClick, T.saveClick, T.chipClick, T.swatchClick];
  const pressed = clicks.some((c) => f >= c && f < c + 7);
  const cursorOpacity = Math.min(prog(f, T.cursorShow, 10), 1 - prog(f, T.cursorHide, 18));
  const ripplePts = [SLOT_PT, SAVE_BTN, CAT_CHIP, SWATCH];

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: W,
        height: H,
        transformOrigin: "0 0",
        transform: `translate(${W / 2}px, ${H / 2}px) scale(${cam.z}) translate(${-cam.cx}px, ${-cam.cy}px)`,
        opacity: 1 - exit,
      }}
    >
      <div style={{ position: "absolute", inset: 0, transform: `translateY(${cardY}px) scale(${cardScale * (1 - 0.04 * exit)})`, transformOrigin: "50% 50%", opacity: clamp01(enter * 1.5) }}>
        <CalendarFrame legend={prog(f, T.legendIn, s(0.5), out)} socialColor={mix(COLOR.social, SOCIAL_RECOLOR, prog(f, T.remapStart, T.remapStep * SOCIAL_ORDER.length + 14, out))}>
          {chips}
          {created}
          {dialogVisible ? <QuickCreate x={DLG.x} y={DLG.y} typed={T.title.slice(0, typedCount)} caretOn={caretOn} scale={(0.94 + 0.06 * dlgIn) * (1 - 0.03 * dlgOut)} opacity={dlgIn * (1 - dlgOut)} savePressed={f >= T.saveClick && f < T.saveClick + 7} /> : null}
          {callIn > 0 && callOut < 1 ? <Callout x={NEW_RECT.x + 4} y={NEW_RECT.y + NEW_RECT.h + 12} color={COLOR.social} label="Jev: Social" opacity={callIn * (1 - callOut)} dy={(1 - callIn) * 12} /> : null}
          {savingOp > 0 ? <Toast x={TOAST_POS.x} y={TOAST_POS.y} text="Saving…" opacity={savingOp} /> : null}
          {savedOp > 0 ? <Toast x={TOAST_POS.x} y={TOAST_POS.y} text="Event saved" opacity={savedOp} /> : null}
        </CalendarFrame>
      </div>
      {panelOpacity > 0 ? <OptionsPanel x={panelX} opacity={panelOpacity} f={f} /> : null}
      {clicks.map((c, i) => (
        <Ripple key={i} x={ripplePts[i].x} y={ripplePts[i].y} t={(f - c) / 20} />
      ))}
      {cursorOpacity > 0 ? <Cursor x={pos.x} y={pos.y} pressed={pressed} opacity={cursorOpacity} /> : null}
    </div>
  );
}

function Intro({ f, layout }: { f: number; layout: Layout }) {
  const { fps } = useVideoConfig();
  const wide = layout === "wide";
  const leave = prog(f, T.introOut, s(0.45), inOut);
  if (leave >= 1) return null;
  const lines = [["Your", "calendar,"], ["color-coded", "by", "itself."]];
  let k = 0;
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: 1 - leave, transform: `translateY(${-leave * 60}px)` }}>
      <div style={{ fontFamily: inter, fontWeight: 800, fontSize: wide ? 104 : 88, letterSpacing: -3, color: C.ink, textAlign: "center", lineHeight: 1.04 }}>
        {lines.map((words, li) => (
          <div key={li}>
            {words.map((w) => {
              const sp = spring({ frame: f - (k++) * 3, fps, config: { damping: 18, stiffness: 110 } });
              return (
                <span key={w} style={{ display: "inline-block", marginRight: "0.26em", opacity: 1, transform: `translateY(${(1 - sp) * 14}px)` }}>
                  {w}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 46, flexWrap: "wrap", justifyContent: "center", maxWidth: wide ? 1300 : 900 }}>
        {CATEGORIES.map((c, i) => {
          const sp = spring({ frame: f - s(0.55) - i * 3, fps, config: { damping: 14, stiffness: 140 } });
          return <Pill key={c.key} color={c.color} name={c.name} size={wide ? 26 : 24} opacity={sp} dy={(1 - sp) * 24} />;
        })}
      </div>
    </AbsoluteFill>
  );
}

function Outro({ f, layout }: { f: number; layout: Layout }) {
  const { fps } = useVideoConfig();
  const wide = layout === "wide";
  if (f < T.outroIn) return null;
  const a = spring({ frame: f - T.outroIn - s(0.2), fps, config: { damping: 18, stiffness: 100 } });
  const b = spring({ frame: f - T.outroIn - s(0.45), fps, config: { damping: 18, stiffness: 100 } });
  const c = spring({ frame: f - T.outroIn - s(0.75), fps, config: { damping: 18, stiffness: 100 } });
  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", padding: 60 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 26, opacity: a, transform: `translateY(${(1 - a) * 30}px)` }}>
        <Mark size={wide ? 96 : 80} />
        <div style={{ fontFamily: inter, fontWeight: 800, fontSize: wide ? 88 : 70, letterSpacing: -2.5, color: C.ink }}>Daybow</div>
      </div>
      <div style={{ fontFamily: inter, fontWeight: 500, fontSize: wide ? 36 : 32, color: C.ink2, marginTop: 22, opacity: b, transform: `translateY(${(1 - b) * 24}px)`, textAlign: "center", maxWidth: wide ? 1400 : 900, lineHeight: 1.25 }}>
        Every Google Calendar event, color-coded by category as you create it.
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 40, flexWrap: "wrap", justifyContent: "center", maxWidth: wide ? 1300 : 900, opacity: b }}>
        {CATEGORIES.map((cat) => (
          <Pill key={cat.key} color={cat.key === "social" ? SOCIAL_RECOLOR : cat.color} name={cat.name} size={wide ? 22 : 22} />
        ))}
      </div>
      <div style={{ fontFamily: inter, fontWeight: 600, fontSize: wide ? 26 : 24, color: C.muted, marginTop: 44, opacity: c, textAlign: "center" }}>
        Open-source Chrome extension · Categories by Jev from TypeSafe
      </div>
    </AbsoluteFill>
  );
}

function WaveLegend({ f, y, size }: { f: number; y: number; size: number }) {
  const { fps } = useVideoConfig();
  const leave = prog(f, T.zoomIn[0] - s(0.1), s(0.35), inOut);
  if (f < T.legendIn || leave >= 1) return null;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: y, display: "flex", justifyContent: "center", gap: 10, opacity: 1 - leave }}>
      {CATEGORIES.map((c, i) => {
        const sp = spring({ frame: f - T.legendIn - i * 3, fps, config: { damping: 15, stiffness: 150 } });
        return <Pill key={c.key} color={c.color} name={c.name} size={size} opacity={sp} dy={(1 - sp) * 16} />;
      })}
    </div>
  );
}

export function Demo({ layout }: { layout: Layout }) {
  const f = useCurrentFrame();
  const wide = layout === "wide";
  const stageScale = wide ? 1 : 0.6;
  const stageLeft = wide ? 0 : (1080 - W * stageScale) / 2;
  const stageTop = wide ? 0 : 150;
  const capY = wide ? 968 : 868;
  const capSize = wide ? 34 : 38;
  const captions: { text: string; at: readonly [number, number] }[] = [
    { text: "A normal week: every event, one color.", at: T.beforeCap },
    { text: "Jev reads each event and picks its category.", at: T.waveCap },
    { text: "Type a title. Jev predicts its category as you type.", at: T.typeCap },
    { text: "It appears already colored, before Google even finishes saving.", at: T.savedCap },
    { text: "Recolor a category. Your open calendar updates in place.", at: T.recolorCap },
  ];
  return (
    <AbsoluteFill style={{ background: C.canvas }}>
      <div style={{ position: "absolute", left: stageLeft, top: stageTop, width: W, height: H, transform: `scale(${stageScale})`, transformOrigin: "0 0" }}>
        <Stage f={f} layout={layout} />
      </div>
      {captions.map((c) => {
        const op = fade(f, c.at, 12);
        return op > 0 ? <Caption key={c.text} text={c.text} opacity={op} y={capY} size={capSize} maxWidth={wide ? 1500 : 960} /> : null;
      })}
      <Intro f={f} layout={layout} />
      <Outro f={f} layout={layout} />
    </AbsoluteFill>
  );
}
