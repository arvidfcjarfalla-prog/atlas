import type { ColorScheme } from "./manifest";

/**
 * Canonical 7-class hex arrays for all supported color schemes.
 * Source: ColorBrewer 2.0 (Cynthia Brewer, Penn State).
 * All sequential/diverging palettes are colorblind-safe variants.
 */
export const COLOR_PALETTES: Record<ColorScheme, string[]> = {
  // Sequential — single-hue
  blues: [
    "#eff3ff",
    "#c6dbef",
    "#9ecae1",
    "#6baed6",
    "#4292c6",
    "#2171b5",
    "#084594",
  ],
  greens: [
    "#edf8e9",
    "#c7e9c0",
    "#a1d99b",
    "#74c476",
    "#41ab5d",
    "#238b45",
    "#005a32",
  ],
  reds: [
    "#fee5d9",
    "#fcbba1",
    "#fc9272",
    "#fb6a4a",
    "#ef3b2c",
    "#cb181d",
    "#99000d",
  ],
  oranges: [
    "#feedde",
    "#fdd0a2",
    "#fdae6b",
    "#fd8d3c",
    "#f16913",
    "#d94801",
    "#8c2d04",
  ],
  purples: [
    "#f2f0f7",
    "#dadaeb",
    "#bcbddc",
    "#9e9ac8",
    "#807dba",
    "#6a51a3",
    "#4a1486",
  ],
  greys: [
    "#f7f7f7",
    "#d9d9d9",
    "#bdbdbd",
    "#969696",
    "#737373",
    "#525252",
    "#252525",
  ],

  // Sequential — multi-hue (matplotlib/d3)
  viridis: [
    "#440154",
    "#443983",
    "#31688e",
    "#21918c",
    "#35b779",
    "#90d743",
    "#fde725",
  ],
  magma: [
    "#000004",
    "#221150",
    "#5f187f",
    "#b63679",
    "#e8751a",
    "#fcb519",
    "#fcfdbf",
  ],
  plasma: [
    "#0d0887",
    "#5b02a3",
    "#9a179b",
    "#cb4679",
    "#eb7852",
    "#fbb32b",
    "#f0f921",
  ],
  inferno: [
    "#000004",
    "#210c4a",
    "#57106e",
    "#a12c5a",
    "#e25033",
    "#fbb61a",
    "#fcffa4",
  ],
  cividis: [
    "#00224e",
    "#123570",
    "#3b496c",
    "#575d6d",
    "#707173",
    "#a5a98b",
    "#fdea45",
  ],

  // Diverging
  "blue-red": [
    "#2166ac",
    "#67a9cf",
    "#d1e5f0",
    "#f7f7f7",
    "#fddbc7",
    "#ef8a62",
    "#b2182b",
  ],
  "blue-yellow-red": [
    "#4575b4",
    "#91bfdb",
    "#e0f3f8",
    "#ffffbf",
    "#fee090",
    "#fc8d59",
    "#d73027",
  ],
  spectral: [
    "#3288bd",
    "#99d594",
    "#e6f598",
    "#ffffbf",
    "#fee08b",
    "#fc8d59",
    "#d53e4f",
  ],

  // Categorical
  set1: [
    "#e41a1c",
    "#377eb8",
    "#4daf4a",
    "#984ea3",
    "#ff7f00",
    "#ffff33",
    "#a65628",
  ],
  set2: [
    "#66c2a5",
    "#fc8d62",
    "#8da0cb",
    "#e78ac3",
    "#a6d854",
    "#ffd92f",
    "#e5c494",
  ],
  paired: [
    "#a6cee3",
    "#1f78b4",
    "#b2df8a",
    "#33a02c",
    "#fb9a99",
    "#e31a1c",
    "#fdbf6f",
  ],
};

const CATEGORICAL_SCHEMES = new Set<ColorScheme>(["set1", "set2", "paired"]);

/**
 * Get N evenly-spaced colors from a palette.
 *
 * - Categorical schemes: returns the first `count` colors.
 * - Sequential/diverging schemes: samples evenly across the ramp.
 */
export function getColors(scheme: ColorScheme, count: number): string[] {
  const palette = COLOR_PALETTES[scheme];
  if (!palette || count <= 0) return [];

  if (count >= palette.length) return palette.slice(0, count);
  if (count === 1) return [palette[Math.floor(palette.length / 2)]];

  if (CATEGORICAL_SCHEMES.has(scheme)) {
    return palette.slice(0, count);
  }

  // Evenly sample from sequential/diverging ramp
  return Array.from({ length: count }, (_, i) => {
    const idx = Math.round((i / (count - 1)) * (palette.length - 1));
    return palette[idx];
  });
}
