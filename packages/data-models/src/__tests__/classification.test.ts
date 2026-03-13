import { describe, it, expect } from "vitest";
import { classify } from "../classification";

describe("classify", () => {
  it("returns empty breaks for empty array", () => {
    const result = classify([], "quantile", 5);
    expect(result).toEqual({
      method: "quantile",
      breaks: [],
      min: 0,
      max: 0,
    });
  });

  it("returns empty breaks for single value", () => {
    const result = classify([42], "quantile", 5);
    expect(result).toEqual({
      method: "quantile",
      breaks: [],
      min: 42,
      max: 42,
    });
  });

  it("returns empty breaks for all identical values", () => {
    const result = classify([7, 7, 7, 7], "quantile", 3);
    expect(result).toEqual({
      method: "quantile",
      breaks: [],
      min: 7,
      max: 7,
    });
  });

  it("returns empty breaks when classes <= 1", () => {
    const result = classify([1, 2, 3], "quantile", 1);
    expect(result).toEqual({
      method: "quantile",
      breaks: [],
      min: 1,
      max: 3,
    });
  });

  it("calculates equal-interval with 3 classes", () => {
    const result = classify([0, 30, 60, 90], "equal-interval", 3);
    expect(result.method).toBe("equal-interval");
    expect(result.breaks).toEqual([30, 60]);
    expect(result.min).toBe(0);
    expect(result.max).toBe(90);
  });

  it("calculates equal-interval with 2 classes", () => {
    const result = classify([10, 20], "equal-interval", 2);
    expect(result.method).toBe("equal-interval");
    expect(result.breaks).toEqual([15]);
    expect(result.min).toBe(10);
    expect(result.max).toBe(20);
  });

  it("calculates quantile with 3 classes", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const result = classify(values, "quantile", 3);
    expect(result.method).toBe("quantile");
    expect(result.breaks.length).toBe(2);
    expect(result.breaks[0]).toBe(values[Math.floor((1 / 3) * 9)]);
    expect(result.breaks[1]).toBe(values[Math.floor((2 / 3) * 9)]);
  });

  it("produces correct break count for quantile", () => {
    const result = classify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], "quantile", 5);
    expect(result.breaks.length).toBe(4);
  });

  it("separates clear clusters with natural-breaks", () => {
    const values = [1, 2, 3, 10, 11, 12, 20, 21, 22];
    const result = classify(values, "natural-breaks", 3);
    expect(result.method).toBe("natural-breaks");
    expect(result.breaks.length).toBe(2);
    // Breaks should separate the three clusters
    expect(result.breaks[0]).toBeGreaterThan(3);
    expect(result.breaks[0]).toBeLessThanOrEqual(10);
    expect(result.breaks[1]).toBeGreaterThan(12);
    expect(result.breaks[1]).toBeLessThanOrEqual(20);
  });

  it("handles large dataset with natural-breaks (sampling)", () => {
    const values = Array.from({ length: 2000 }, (_, i) => i);
    const result = classify(values, "natural-breaks", 5);
    expect(result.breaks.length).toBe(4);
    expect(result.min).toBe(0);
    expect(result.max).toBe(1999);
  });

  it("passes through manual breaks", () => {
    const result = classify([1, 5, 10], "manual", 3, [3, 7]);
    expect(result.method).toBe("manual");
    expect(result.breaks).toEqual([3, 7]);
  });

  it("returns empty breaks for manual without provided breaks", () => {
    const result = classify([1, 5, 10], "manual", 3);
    expect(result.method).toBe("manual");
    expect(result.breaks).toEqual([]);
  });

  it("handles negative values", () => {
    const result = classify([-10, -5, 0, 5, 10], "equal-interval", 5);
    expect(result.min).toBe(-10);
    expect(result.max).toBe(10);
    expect(result.breaks.length).toBe(4);
    expect(result.breaks).toEqual([-6, -2, 2, 6]);
  });

  it("ensures break count equals classes - 1 for equal-interval", () => {
    for (const classes of [2, 3, 4, 5, 6, 7]) {
      const result = classify([0, 10, 20, 30], "equal-interval", classes);
      expect(result.breaks.length).toBe(classes - 1);
    }
  });

  it("ensures break count equals classes - 1 for quantile", () => {
    const values = Array.from({ length: 100 }, (_, i) => i);
    for (const classes of [2, 3, 4, 5, 6, 7]) {
      const result = classify(values, "quantile", classes);
      expect(result.breaks.length).toBe(classes - 1);
    }
  });

  it("ensures break count equals classes - 1 for natural-breaks", () => {
    const values = Array.from({ length: 50 }, (_, i) => i);
    for (const classes of [2, 3, 4, 5, 6, 7]) {
      const result = classify(values, "natural-breaks", classes);
      expect(result.breaks.length).toBe(classes - 1);
    }
  });
});
