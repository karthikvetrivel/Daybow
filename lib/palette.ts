/**
 * Preset pastel colors for categories, laid out like Google Calendar's color
 * menu: 6 columns of hue families (pink, orange, yellow, green, blue, purple)
 * and 4 rows (the default category colors, lighter, deeper, soft neutrals).
 * Every default category color is in the palette.
 */
export interface Pastel {
  name: string;
  hex: string;
}

export const PASTEL_COLUMNS = 6;

export const PASTELS: Pastel[] = [
  { name: "Coral", hex: "#ffb7b2" },
  { name: "Peach", hex: "#ffc8a2" },
  { name: "Butter", hex: "#ffe08a" },
  { name: "Mint", hex: "#b5ead7" },
  { name: "Sky", hex: "#a8d1ff" },
  { name: "Periwinkle", hex: "#c9c1ff" },

  { name: "Bubblegum", hex: "#ffa6d6" },
  { name: "Apricot", hex: "#ffd8b1" },
  { name: "Lemon", hex: "#fff2a6" },
  { name: "Pistachio", hex: "#e2f0cb" },
  { name: "Aqua", hex: "#a8e6ef" },
  { name: "Lilac", hex: "#d7b8ff" },

  { name: "Watermelon", hex: "#ff9eaa" },
  { name: "Cantaloupe", hex: "#ffb38a" },
  { name: "Marigold", hex: "#ffcf6e" },
  { name: "Matcha", hex: "#c5e6a0" },
  { name: "Cornflower", hex: "#9fb8ff" },
  { name: "Orchid", hex: "#efb8f5" },

  { name: "Blush", hex: "#f3d6dc" },
  { name: "Sand", hex: "#ecdcc6" },
  { name: "Vanilla", hex: "#f7ecc9" },
  { name: "Sage", hex: "#cfdcc8" },
  { name: "Mist", hex: "#d6e2e9" },
  { name: "Cloud", hex: "#e2e0ea" },
];

const BY_HEX = new Map(PASTELS.map((p) => [p.hex, p.name]));

/** The palette name of a color, or null for a custom color. */
export function pastelName(hex: string): string | null {
  return BY_HEX.get(hex.trim().toLowerCase()) ?? null;
}

/** The first palette color that no category uses yet. */
export function nextPastel(used: string[]): string {
  const taken = new Set(used.map((c) => c.trim().toLowerCase()));
  return (PASTELS.find((p) => !taken.has(p.hex)) ?? PASTELS[used.length % PASTELS.length]).hex;
}

/** Text color that stays readable on a background: dark on pastels, white on deep colors. */
export function inkFor(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#1f1f1f";
  const channel = (i: number) => {
    const c = parseInt(m[1].slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.36 ? "#1f1f1f" : "#ffffff";
}
