import { describe, expect, it, vi } from "vitest";
import { computeVisiblePositions, type MapLike, type ProjectableFeature } from "../chart-overlay/positions";

function mockMap(opts: {
  zoom: number;
  /** Which [lng,lat] pairs are considered inside bounds. If omitted, all are inside. */
  insideBounds?: (lnglat: [number, number]) => boolean;
  /** Screen-pixel projection. Defaults to identity ([lng,lat] → { x: lng, y: lat }). */
  project?: (lnglat: [number, number]) => { x: number; y: number };
}): Pick<MapLike, "getZoom" | "getBounds" | "project"> {
  return {
    getZoom: () => opts.zoom,
    getBounds: () => ({
      contains: opts.insideBounds ?? (() => true),
    }),
    project: opts.project ?? (([lng, lat]) => ({ x: lng, y: lat })),
  };
}

function feat(lng: number, lat: number): ProjectableFeature {
  return { centroid: [lng, lat] };
}

describe("computeVisiblePositions", () => {
  it("returns [] when zoom is below minZoom", () => {
    const map = mockMap({ zoom: 2 });
    const result = computeVisiblePositions(map, [feat(0, 0), feat(1, 1)], 3, 50);
    expect(result).toEqual([]);
  });

  it("returns [] at exactly minZoom - 0.01 (strict less-than)", () => {
    const map = mockMap({ zoom: 2.99 });
    expect(computeVisiblePositions(map, [feat(0, 0)], 3, 50)).toEqual([]);
  });

  it("passes at exactly minZoom (>= not <)", () => {
    const map = mockMap({ zoom: 3 });
    const result = computeVisiblePositions(map, [feat(0, 0)], 3, 50);
    expect(result).toHaveLength(1);
  });

  it("drops features outside bounds", () => {
    const map = mockMap({
      zoom: 5,
      insideBounds: ([lng]) => lng >= 0, // only non-negative lng is inside
    });
    const result = computeVisiblePositions(
      map,
      [feat(-5, 0), feat(1, 1), feat(-1, 0), feat(2, 2)],
      3,
      50,
    );
    expect(result).toHaveLength(2);
    expect(result.map((p) => p.idx)).toEqual([1, 3]);
  });

  it("caps output at maxVisible, preserving earliest-first order", () => {
    const map = mockMap({ zoom: 5 });
    const features = Array.from({ length: 10 }, (_, i) => feat(i, i));
    const result = computeVisiblePositions(map, features, 3, 3);
    expect(result).toHaveLength(3);
    expect(result.map((p) => p.idx)).toEqual([0, 1, 2]);
  });

  it("applies map.project() to each visible centroid", () => {
    const project = vi.fn(([lng, lat]: [number, number]) => ({ x: lng * 100, y: lat * 200 }));
    const map = mockMap({ zoom: 5, project });
    const result = computeVisiblePositions(map, [feat(1, 2), feat(3, 4)], 3, 50);
    expect(project).toHaveBeenCalledTimes(2);
    expect(result[0]).toEqual({ x: 100, y: 400, idx: 0 });
    expect(result[1]).toEqual({ x: 300, y: 800, idx: 1 });
  });

  it("does not call project() for out-of-bounds features (perf guard)", () => {
    const project = vi.fn(([lng, lat]: [number, number]) => ({ x: lng, y: lat }));
    const map: Pick<MapLike, "getZoom" | "getBounds" | "project"> = {
      getZoom: () => 5,
      getBounds: () => ({ contains: ([lng]) => lng > 0 }),
      project,
    };
    computeVisiblePositions(map, [feat(-1, 0), feat(-2, 0), feat(1, 0)], 3, 50);
    expect(project).toHaveBeenCalledTimes(1);
    expect(project).toHaveBeenCalledWith([1, 0]);
  });

  it("stops iterating once maxVisible is reached (perf guard)", () => {
    const project = vi.fn(([lng, lat]: [number, number]) => ({ x: lng, y: lat }));
    const map: Pick<MapLike, "getZoom" | "getBounds" | "project"> = {
      getZoom: () => 5,
      getBounds: () => ({ contains: () => true }),
      project,
    };
    const features = Array.from({ length: 20 }, (_, i) => feat(i, i));
    computeVisiblePositions(map, features, 3, 5);
    expect(project).toHaveBeenCalledTimes(5);
  });

  it("empty features list → []", () => {
    const map = mockMap({ zoom: 10 });
    expect(computeVisiblePositions(map, [], 3, 50)).toEqual([]);
  });

  it("maxVisible = 0 → [] even with in-bounds features", () => {
    const map = mockMap({ zoom: 10 });
    expect(computeVisiblePositions(map, [feat(0, 0), feat(1, 1)], 3, 0)).toEqual([]);
  });

  it("preserves index from the original features array (for label/value lookup)", () => {
    const map = mockMap({
      zoom: 5,
      insideBounds: ([lng]) => lng === 2 || lng === 5,
    });
    const features = [feat(1, 0), feat(2, 0), feat(3, 0), feat(4, 0), feat(5, 0)];
    const result = computeVisiblePositions(map, features, 3, 50);
    expect(result.map((p) => p.idx)).toEqual([1, 4]);
  });
});
