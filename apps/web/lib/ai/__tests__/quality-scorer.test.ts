import { describe, it, expect } from "vitest";
import { scoreManifest } from "../quality-scorer";
import type { MapManifest } from "@atlas/data-models";
import type { DatasetProfile } from "../types";

// ─── Helpers ────────────────────────────────────────────────

function fullManifest(overrides?: Record<string, unknown>): MapManifest {
  return {
    id: "test-map",
    title: "Test Map",
    description: "A test map for scoring.",
    theme: "explore",
    defaultCenter: [50, 10],
    defaultZoom: 5,
    defaultBounds: [[40, -5], [60, 25]],
    layers: [{
      id: "layer-1",
      kind: "asset",
      label: "Test Layer",
      sourceType: "geojson-static",
      geometryType: "polygon",
      style: {
        markerShape: "circle",
        mapFamily: "choropleth",
        colorField: "density",
        classification: { method: "quantile", classes: 5 },
        color: { scheme: "blues", colorblindSafe: true },
        normalization: { field: "area", method: "per-area" },
        fillOpacity: 0.85,
      },
      legend: { title: "Density", type: "gradient" },
      interaction: {
        tooltipFields: ["name", "density"],
        clickBehavior: "popup",
        hoverEffect: "highlight",
      },
    }],
    ...overrides,
  } as MapManifest;
}

function pointProfile(): DatasetProfile {
  return {
    featureCount: 100,
    geometryType: "Point",
    bounds: [[0, 0], [10, 10]],
    crs: null,
    attributes: [],
  };
}

function polygonProfile(): DatasetProfile {
  return {
    featureCount: 50,
    geometryType: "Polygon",
    bounds: [[0, 0], [10, 10]],
    crs: null,
    attributes: [],
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("scoreManifest", () => {
  it("gives high score to a well-formed choropleth manifest", () => {
    const score = scoreManifest(fullManifest(), polygonProfile());
    expect(score.total).toBe(100);
    expect(score.deductions).toHaveLength(0);
  });

  it("returns score between 0 and 100", () => {
    const score = scoreManifest(fullManifest());
    expect(score.total).toBeGreaterThanOrEqual(0);
    expect(score.total).toBeLessThanOrEqual(100);
  });

  it("has breakdown that sums to total", () => {
    const score = scoreManifest(fullManifest(), polygonProfile());
    const sum = Object.values(score.breakdown).reduce((a, b) => a + b, 0);
    expect(sum).toBe(score.total);
  });

  // ── Schema completeness ──

  it("deducts for missing description", () => {
    const score = scoreManifest(fullManifest({ description: "" }), polygonProfile());
    expect(score.breakdown.schemaCompleteness).toBeLessThan(20);
  });

  it("deducts for missing optional fields", () => {
    const manifest = fullManifest();
    delete (manifest as unknown as Record<string, unknown>).defaultBounds;
    delete (manifest as unknown as Record<string, unknown>).defaultCenter;
    delete (manifest as unknown as Record<string, unknown>).defaultZoom;
    delete (manifest as unknown as Record<string, unknown>).description;
    const score = scoreManifest(manifest, polygonProfile());
    expect(score.breakdown.schemaCompleteness).toBeLessThan(20);
    expect(score.deductions.some((d) => d.includes("optional fields"))).toBe(true);
  });

  // ── Family appropriateness ──

  it("scores full marks when family matches geometry", () => {
    const score = scoreManifest(fullManifest(), polygonProfile());
    expect(score.breakdown.familyAppropriateness).toBe(20);
  });

  it("deducts when choropleth used with point data", () => {
    const score = scoreManifest(fullManifest(), pointProfile());
    expect(score.breakdown.familyAppropriateness).toBe(0);
    expect(score.deductions.some((d) => d.includes("not appropriate"))).toBe(true);
  });

  it("gives partial score without profile", () => {
    const score = scoreManifest(fullManifest());
    expect(score.breakdown.familyAppropriateness).toBe(12);
  });

  it("gives full marks for point family with point geometry", () => {
    const manifest = fullManifest();
    (manifest.layers[0].style as unknown as Record<string, unknown>).mapFamily = "point";
    const score = scoreManifest(manifest, pointProfile());
    expect(score.breakdown.familyAppropriateness).toBe(20);
  });

  // ── Color scheme quality ──

  it("gives full color score for sequential scheme on choropleth", () => {
    const score = scoreManifest(fullManifest(), polygonProfile());
    expect(score.breakdown.colorSchemeQuality).toBe(20);
  });

  it("deducts when colorblind safety is disabled", () => {
    const manifest = fullManifest();
    manifest.layers[0].style.color = { scheme: "blues", colorblindSafe: false };
    const score = scoreManifest(manifest, polygonProfile());
    expect(score.breakdown.colorSchemeQuality).toBeLessThan(20);
    expect(score.deductions.some((d) => d.includes("Colorblind"))).toBe(true);
  });

  it("deducts when categorical scheme used for choropleth", () => {
    const manifest = fullManifest();
    manifest.layers[0].style.color = { scheme: "set1", colorblindSafe: true };
    const score = scoreManifest(manifest, polygonProfile());
    expect(score.breakdown.colorSchemeQuality).toBeLessThan(20);
    expect(score.deductions.some((d) => d.includes("Categorical scheme"))).toBe(true);
  });

  // ── Classification quality ──

  it("gives full marks for classification with 3-7 classes on choropleth", () => {
    const score = scoreManifest(fullManifest(), polygonProfile());
    expect(score.breakdown.classificationQuality).toBe(15);
  });

  it("deducts when choropleth has no classification", () => {
    const manifest = fullManifest();
    delete (manifest.layers[0].style as unknown as Record<string, unknown>).classification;
    const score = scoreManifest(manifest, polygonProfile());
    expect(score.breakdown.classificationQuality).toBe(0);
    expect(score.deductions.some((d) => d.includes("No classification"))).toBe(true);
  });

  it("deducts for classification with 2 classes", () => {
    const manifest = fullManifest();
    manifest.layers[0].style.classification = { method: "quantile", classes: 2 };
    const score = scoreManifest(manifest, polygonProfile());
    // method specified (+10) but classes < 3 (no +5)
    expect(score.breakdown.classificationQuality).toBe(10);
  });

  it("gives full marks to non-quantitative families without classification", () => {
    const manifest = fullManifest();
    (manifest.layers[0].style as unknown as Record<string, unknown>).mapFamily = "heatmap";
    delete (manifest.layers[0].style as unknown as Record<string, unknown>).classification;
    const score = scoreManifest(manifest);
    expect(score.breakdown.classificationQuality).toBe(15);
  });

  // ── Normalization ──

  it("gives full marks when choropleth has normalization", () => {
    const score = scoreManifest(fullManifest(), polygonProfile());
    expect(score.breakdown.normalization).toBe(10);
  });

  it("deducts when choropleth missing normalization", () => {
    const manifest = fullManifest();
    delete (manifest.layers[0].style as unknown as Record<string, unknown>).normalization;
    const score = scoreManifest(manifest, polygonProfile());
    expect(score.breakdown.normalization).toBe(0);
    expect(score.deductions.some((d) => d.includes("normalization"))).toBe(true);
  });

  it("gives full normalization score to non-choropleth families", () => {
    const manifest = fullManifest();
    (manifest.layers[0].style as unknown as Record<string, unknown>).mapFamily = "point";
    const score = scoreManifest(manifest);
    expect(score.breakdown.normalization).toBe(10);
  });

  // ── Legend completeness ──

  it("gives full legend score with title and type", () => {
    const score = scoreManifest(fullManifest(), polygonProfile());
    expect(score.breakdown.legendCompleteness).toBe(5);
  });

  it("deducts for missing legend title", () => {
    const manifest = fullManifest();
    manifest.layers[0].legend = { title: "", type: "gradient" };
    const score = scoreManifest(manifest, polygonProfile());
    expect(score.breakdown.legendCompleteness).toBe(2);
  });

  it("deducts for missing legend entirely", () => {
    const manifest = fullManifest();
    delete (manifest.layers[0] as unknown as Record<string, unknown>).legend;
    const score = scoreManifest(manifest, polygonProfile());
    expect(score.breakdown.legendCompleteness).toBe(0);
    expect(score.deductions.some((d) => d.includes("Legend"))).toBe(true);
  });

  // ── Deductions list ──

  it("accumulates multiple deductions for a poor manifest", () => {
    const manifest = {
      id: "bad",
      title: "Bad Map",
      theme: "explore",
      layers: [{
        id: "l",
        kind: "asset",
        label: "Bad",
        sourceType: "geojson-static",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          color: { scheme: "set1", colorblindSafe: false },
        },
      }],
    } as MapManifest;

    const score = scoreManifest(manifest, pointProfile());
    expect(score.total).toBeLessThan(50);
    expect(score.deductions.length).toBeGreaterThan(3);
  });
});
