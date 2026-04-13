import { describe, expect, it } from "vitest";
import { TIME_WINDOW_MS } from "../timeline/use-time-window";

describe("TIME_WINDOW_MS", () => {
  it("1h is exactly one hour of milliseconds", () => {
    expect(TIME_WINDOW_MS["1h"]).toBe(60 * 60 * 1000);
  });

  it("6h is exactly six times 1h", () => {
    expect(TIME_WINDOW_MS["6h"]).toBe(6 * TIME_WINDOW_MS["1h"]);
  });

  it("24h is exactly twenty-four times 1h", () => {
    expect(TIME_WINDOW_MS["24h"]).toBe(24 * TIME_WINDOW_MS["1h"]);
  });

  it("all is 72h (three days)", () => {
    expect(TIME_WINDOW_MS.all).toBe(72 * TIME_WINDOW_MS["1h"]);
  });

  it("windows are monotonically increasing 1h < 6h < 24h < all", () => {
    expect(TIME_WINDOW_MS["1h"]).toBeLessThan(TIME_WINDOW_MS["6h"]);
    expect(TIME_WINDOW_MS["6h"]).toBeLessThan(TIME_WINDOW_MS["24h"]);
    expect(TIME_WINDOW_MS["24h"]).toBeLessThan(TIME_WINDOW_MS.all);
  });
});
