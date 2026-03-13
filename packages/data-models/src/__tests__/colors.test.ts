import { describe, it, expect } from "vitest";
import { getColors, COLOR_PALETTES } from "../palettes";
import type { ColorScheme } from "../manifest";

describe("COLOR_PALETTES", () => {
  const allSchemes: ColorScheme[] = [
    "blues",
    "greens",
    "reds",
    "oranges",
    "purples",
    "greys",
    "viridis",
    "magma",
    "plasma",
    "inferno",
    "cividis",
    "blue-red",
    "blue-yellow-red",
    "spectral",
    "set1",
    "set2",
    "paired",
  ];

  it("has exactly 17 schemes with 7 colors each", () => {
    expect(Object.keys(COLOR_PALETTES)).toHaveLength(17);
    allSchemes.forEach((scheme) => {
      expect(COLOR_PALETTES[scheme]).toHaveLength(7);
    });
  });

  it("contains valid hex color strings", () => {
    const hexPattern = /^#[0-9a-f]{6}$/i;
    allSchemes.forEach((scheme) => {
      COLOR_PALETTES[scheme].forEach((color) => {
        expect(color).toMatch(hexPattern);
      });
    });
  });
});

describe("getColors", () => {
  it("returns empty array for count 0", () => {
    expect(getColors("blues", 0)).toEqual([]);
  });

  it("returns middle color for count 1", () => {
    const result = getColors("blues", 1);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(COLOR_PALETTES.blues[3]);
  });

  it("returns evenly sampled colors for sequential scheme with count 3", () => {
    const result = getColors("blues", 3);
    expect(result).toHaveLength(3);
    // Should sample at indices 0, 3, 6
    expect(result[0]).toBe(COLOR_PALETTES.blues[0]);
    expect(result[1]).toBe(COLOR_PALETTES.blues[3]);
    expect(result[2]).toBe(COLOR_PALETTES.blues[6]);
  });

  it("returns full palette for count 7", () => {
    const result = getColors("blues", 7);
    expect(result).toEqual(COLOR_PALETTES.blues);
  });

  it("caps at palette length for count > 7", () => {
    const result = getColors("blues", 10);
    expect(result).toHaveLength(7);
    expect(result).toEqual(COLOR_PALETTES.blues);
  });

  it("returns first N colors for categorical scheme", () => {
    const result = getColors("set1", 3);
    expect(result).toHaveLength(3);
    expect(result).toEqual(COLOR_PALETTES.set1.slice(0, 3));
  });

  it("produces valid hex colors for all schemes", () => {
    const hexPattern = /^#[0-9a-f]{6}$/i;
    const allSchemes: ColorScheme[] = [
      "blues",
      "greens",
      "reds",
      "oranges",
      "purples",
      "greys",
      "viridis",
      "magma",
      "plasma",
      "inferno",
      "cividis",
      "blue-red",
      "blue-yellow-red",
      "spectral",
      "set1",
      "set2",
      "paired",
    ];

    allSchemes.forEach((scheme) => {
      const colors = getColors(scheme, 5);
      expect(colors).toHaveLength(5);
      colors.forEach((color) => {
        expect(color).toMatch(hexPattern);
      });
    });
  });

  it("evenly samples sequential scheme at correct indices", () => {
    const result = getColors("viridis", 3);
    expect(result).toHaveLength(3);
    // For count=3: indices should be 0, 3, 6
    // i=0: round((0/(3-1)) * 6) = round(0) = 0
    // i=1: round((1/(3-1)) * 6) = round(3) = 3
    // i=2: round((2/(3-1)) * 6) = round(6) = 6
    expect(result[0]).toBe(COLOR_PALETTES.viridis[0]);
    expect(result[1]).toBe(COLOR_PALETTES.viridis[3]);
    expect(result[2]).toBe(COLOR_PALETTES.viridis[6]);
  });

  it("returns first N colors for categorical paired scheme", () => {
    const result = getColors("paired", 4);
    expect(result).toHaveLength(4);
    expect(result).toEqual(COLOR_PALETTES.paired.slice(0, 4));
  });

  it("returns first N colors for categorical set2 scheme", () => {
    const result = getColors("set2", 5);
    expect(result).toHaveLength(5);
    expect(result).toEqual(COLOR_PALETTES.set2.slice(0, 5));
  });
});
