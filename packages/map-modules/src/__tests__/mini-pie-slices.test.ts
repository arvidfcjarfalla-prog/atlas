import { describe, expect, it } from "vitest";
import { computePieSlices } from "../chart-overlay/pie-slices";

const SIZE = 40;
const EXPECTED_R = SIZE / 2 - 2; // 18
const EXPECTED_CX = SIZE / 2;    // 20
const EXPECTED_CY = SIZE / 2;    // 20

describe("computePieSlices", () => {
  it("returns [] for empty input", () => {
    expect(computePieSlices([], SIZE)).toEqual([]);
  });

  it("returns [] when total is zero", () => {
    expect(computePieSlices([0, 0, 0], SIZE)).toEqual([]);
  });

  it("returns [] when all values are negative (clamped to zero)", () => {
    expect(computePieSlices([-1, -2], SIZE)).toEqual([]);
  });

  it("single non-zero value → one slice, path starts and ends at center", () => {
    const slices = computePieSlices([5], SIZE);
    expect(slices).toHaveLength(1);
    expect(slices[0].index).toBe(0);
    expect(slices[0].value).toBe(5);
    // Full-circle slice with one value: angle = 2π, which is NOT > π in the
    // strict sense? 2π > π so largeArc should be 1.
    expect(slices[0].largeArc).toBe(1);
    expect(slices[0].path.startsWith(`M ${EXPECTED_CX} ${EXPECTED_CY}`)).toBe(true);
    expect(slices[0].path.endsWith("Z")).toBe(true);
  });

  it("four equal values → four slices, each with angle exactly π/2 (largeArc=0)", () => {
    const slices = computePieSlices([1, 1, 1, 1], SIZE);
    expect(slices).toHaveLength(4);
    for (const s of slices) {
      expect(s.largeArc).toBe(0); // π/2 is not > π
      expect(s.value).toBe(1);
    }
    expect(slices.map((s) => s.index)).toEqual([0, 1, 2, 3]);
  });

  it("values [3, 1] → first slice has largeArc=1, second has largeArc=0", () => {
    // total 4 → first slice 3/4 * 2π = 1.5π which is > π → largeArc 1
    // second slice π/2 < π → largeArc 0
    const slices = computePieSlices([3, 1], SIZE);
    expect(slices).toHaveLength(2);
    expect(slices[0].largeArc).toBe(1);
    expect(slices[1].largeArc).toBe(0);
  });

  it("slices of a half/half split both have largeArc=0 (angle = π, not strictly > π)", () => {
    const slices = computePieSlices([1, 1], SIZE);
    expect(slices).toHaveLength(2);
    expect(slices[0].largeArc).toBe(0);
    expect(slices[1].largeArc).toBe(0);
  });

  it("preserves input index on zero-value slices (matches legacy inline rendering)", () => {
    // Original implementation pushes a slice for every value, including 0.
    // We keep that for backwards-compat so color index lookup in the component stays aligned.
    const slices = computePieSlices([2, 0, 2], SIZE);
    expect(slices).toHaveLength(3);
    expect(slices.map((s) => s.index)).toEqual([0, 1, 2]);
    expect(slices[1].value).toBe(0);
  });

  it("negative values are clamped to 0 in returned value, but still produce a slice entry", () => {
    const slices = computePieSlices([2, -5, 2], SIZE);
    expect(slices).toHaveLength(3);
    expect(slices[1].value).toBe(0);
  });

  it("first slice starts at 12 o'clock (angle -π/2) — path's L point is directly above center", () => {
    const slices = computePieSlices([1, 1, 1, 1], SIZE);
    // path format: "M cx cy L x1 y1 A r r 0 largeArc 1 x2 y2 Z"
    const match = slices[0].path.match(/M (\S+) (\S+) L (\S+) (\S+)/);
    expect(match).not.toBeNull();
    const [, cxStr, cyStr, x1Str, y1Str] = match!;
    expect(Number(cxStr)).toBe(EXPECTED_CX);
    expect(Number(cyStr)).toBe(EXPECTED_CY);
    // cos(-π/2) ≈ 0, sin(-π/2) = -1 → (cx + r*0, cy + r*-1) = (20, 2)
    expect(Number(x1Str)).toBeCloseTo(EXPECTED_CX, 5);
    expect(Number(y1Str)).toBeCloseTo(EXPECTED_CY - EXPECTED_R, 5);
  });

  it("SVG path radius matches size/2 - 2", () => {
    const slices = computePieSlices([1, 1], SIZE);
    const match = slices[0].path.match(/A (\S+) (\S+) 0/);
    expect(match).not.toBeNull();
    expect(Number(match![1])).toBe(EXPECTED_R);
    expect(Number(match![2])).toBe(EXPECTED_R);
  });

  it("respects custom size for cx/cy/r", () => {
    const slices = computePieSlices([1, 1], 100);
    expect(slices[0].path.startsWith("M 50 50")).toBe(true);
    const aMatch = slices[0].path.match(/A (\S+) \S+ 0/);
    expect(Number(aMatch![1])).toBe(48);
  });
});
