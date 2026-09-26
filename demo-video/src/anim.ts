import { Easing, interpolate } from "remotion";

export const FPS = 60;
export const s = (sec: number) => Math.round(sec * FPS);

export const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** 0..1 progress of `frame` through [start, start + dur), eased. */
export function prog(frame: number, start: number, dur: number, ease: (t: number) => number = Easing.bezier(0.33, 0, 0.2, 1)): number {
  return ease(clamp01((frame - start) / Math.max(1, dur)));
}

export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const out = Easing.bezier(0.16, 1, 0.3, 1);

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  const m = (i: number) => Math.round(lerp(x[i], y[i], clamp01(t)));
  return `rgb(${m(0)}, ${m(1)}, ${m(2)})`;
}

/** Piecewise camera/position interpolation through keyframes { at, ...values }. */
export function keyframes<T extends Record<string, number>>(frame: number, keys: ({ at: number } & T)[], ease = inOut): T {
  if (frame <= keys[0].at) return strip(keys[0]);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (frame <= b.at) {
      const t = ease(clamp01((frame - a.at) / Math.max(1, b.at - a.at)));
      const outv = {} as Record<string, number>;
      for (const k of Object.keys(a)) if (k !== "at") outv[k] = lerp(a[k as keyof typeof a] as number, b[k as keyof typeof b] as number, t);
      return outv as T;
    }
  }
  return strip(keys[keys.length - 1]);
}
function strip<T>(k: { at: number } & T): T {
  const { at: _at, ...rest } = k;
  return rest as unknown as T;
}

export { interpolate };
