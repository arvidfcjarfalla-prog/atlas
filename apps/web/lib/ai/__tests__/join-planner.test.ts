import { describe, it, expect } from "vitest";
import { planJoin, type JoinPlanResult } from "../tools/join-planner";
import type { DetectionResult } from "../tools/geography-detector";
import type { GeographyLevel, CodeFamily } from "../tools/normalized-result";
import type { GeometryEntry } from "../tools/geometry-registry";

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

function makeDetection(opts: {
  level: GeographyLevel;
  codeFamily: CodeFamily;
  confidence: number;
  renderHint?: "polygon_join" | "point_based" | "non_geographic";
  geoDimensionId?: string;
  unitCount?: number;
}): DetectionResult {
  return {
    level: opts.level,
    codeFamily: opts.codeFamily,
    confidence: opts.confidence,
    geoDimensionId: opts.geoDimensionId ?? "Region",
    unitCount: opts.unitCount ?? 10,
    reasons: [],
    renderHint: opts.renderHint ?? "polygon_join",
  };
}

/**
 * Minimal geometry entry factory for test isolation.
 * Tests inject entries via the geometryLookup parameter
 * so they don't depend on the real registry.
 */
function makeEntry(opts: {
  id: string;
  level: GeographyLevel;
  joinKeys: { geometryProperty: string; codeFamily: CodeFamily }[];
  status?: "production" | "provisional";
  regionCode?: string;
}): GeometryEntry {
  return {
    id: opts.id,
    name: opts.id,
    level: opts.level,
    scope: { regionCode: opts.regionCode ?? "GLOBAL" },
    loaderType: "cdn_url",
    loaderTarget: "https://example.com/test.geojson",
    joinKeys: opts.joinKeys,
    featureIdProperty: opts.joinKeys[0]?.geometryProperty ?? "id",
    resolution: "medium",
    status: opts.status ?? "production",
  };
}

/** Create a lookup function that returns the given entries for any query. */
function staticLookup(entries: GeometryEntry[]) {
  return (_country: string, _level: GeographyLevel) => entries;
}

/** Create a lookup that returns different entries per level. */
function levelLookup(byLevel: Record<string, GeometryEntry[]>) {
  return (_country: string, level: GeographyLevel) => byLevel[level] ?? [];
}

// ═══════════════════════════════════════════════════════════════
// Country-level joins
// ═══════════════════════════════════════════════════════════════

describe("country-level joins", () => {
  const countryEntry = makeEntry({
    id: "natural-earth:ne_110m_admin_0_countries",
    level: "country",
    joinKeys: [
      { geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } },
      { geometryProperty: "name", codeFamily: { family: "name" } },
    ],
    status: "production",
  });

  it("plans direct ISO-A3 join for country-level data", () => {
    const detection = makeDetection({
      level: "country",
      codeFamily: { family: "iso", namespace: "alpha3" },
      confidence: 0.85,
    });

    const result = planJoin(detection, ["SE"], staticLookup([countryEntry]));

    expect(result.mapReady).toBe(true);
    expect(result.strategy).toBe("direct_code");
    expect(result.geometryLayerId).toBe("natural-earth:ne_110m_admin_0_countries");
    expect(result.geometryJoinField).toBe("iso_a3");
    expect(result.rowJoinField).toBe("Region");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("plans direct ISO-A2 join when namespace matches", () => {
    const entryWithA2 = makeEntry({
      id: "test:countries-a2",
      level: "country",
      joinKeys: [
        { geometryProperty: "iso_a2", codeFamily: { family: "iso", namespace: "alpha2" } },
      ],
      status: "production",
    });

    const detection = makeDetection({
      level: "country",
      codeFamily: { family: "iso", namespace: "alpha2" },
      confidence: 0.8,
    });

    const result = planJoin(detection, [], staticLookup([entryWithA2]));

    expect(result.mapReady).toBe(true);
    expect(result.strategy).toBe("direct_code");
    expect(result.geometryJoinField).toBe("iso_a2");
  });

  it("falls back to name join when code family differs", () => {
    const detection = makeDetection({
      level: "country",
      codeFamily: { family: "custom", namespace: "weird" },
      confidence: 0.7,
    });

    const result = planJoin(detection, [], staticLookup([countryEntry]));

    // Name join key exists on countryEntry but is fuzzy
    expect(result.strategy).toBe("fuzzy_name");
    expect(result.mapReady).toBe(false); // fuzzy alone capped below threshold
    expect(result.confidence).toBeLessThanOrEqual(0.45);
  });
});

// ═══════════════════════════════════════════════════════════════
// Admin1 joins
// ═══════════════════════════════════════════════════════════════

describe("admin1 joins", () => {
  it("plans join for Swedish counties with ISO 3166-2 codes", () => {
    const seAdmin1 = makeEntry({
      id: "se:admin1",
      level: "admin1",
      joinKeys: [
        { geometryProperty: "iso_3166_2", codeFamily: { family: "iso", namespace: "3166-2" } },
        { geometryProperty: "name", codeFamily: { family: "name" } },
      ],
      status: "production",
      regionCode: "SE",
    });

    const detection = makeDetection({
      level: "admin1",
      codeFamily: { family: "iso", namespace: "3166-2" },
      confidence: 0.75,
      geoDimensionId: "Region",
    });

    const result = planJoin(detection, ["SE"], staticLookup([seAdmin1]));

    expect(result.strategy).toBe("direct_code");
    expect(result.geometryLayerId).toBe("se:admin1");
    expect(result.geometryJoinField).toBe("iso_3166_2");
    expect(result.rowJoinField).toBe("Region");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.mapReady).toBe(true);
  });

  it("plans join for Norwegian counties", () => {
    const noAdmin1 = makeEntry({
      id: "no:admin1",
      level: "admin1",
      joinKeys: [
        { geometryProperty: "iso_3166_2", codeFamily: { family: "iso", namespace: "3166-2" } },
        { geometryProperty: "name", codeFamily: { family: "name" } },
      ],
      status: "production",
      regionCode: "NO",
    });

    const detection = makeDetection({
      level: "admin1",
      codeFamily: { family: "iso", namespace: "3166-2" },
      confidence: 0.7,
      geoDimensionId: "Region",
    });

    const result = planJoin(detection, ["NO"], staticLookup([noAdmin1]));

    expect(result.mapReady).toBe(true);
    expect(result.strategy).toBe("direct_code");
    expect(result.geometryLayerId).toBe("no:admin1");
    expect(result.geometryJoinField).toBe("iso_3166_2");
  });
});

// ═══════════════════════════════════════════════════════════════
// Municipality-style joins
// ═══════════════════════════════════════════════════════════════

describe("municipality joins", () => {
  it("plans join for Swedish municipalities", () => {
    const seMunicipalities = makeEntry({
      id: "se:municipalities",
      level: "municipality",
      joinKeys: [
        { geometryProperty: "code", codeFamily: { family: "iso", namespace: "3166-2" } },
        { geometryProperty: "name", codeFamily: { family: "name" } },
      ],
      status: "production",
      regionCode: "SE",
    });

    const detection = makeDetection({
      level: "municipality",
      codeFamily: { family: "iso", namespace: "3166-2" },
      confidence: 0.8,
      geoDimensionId: "Region",
      unitCount: 290,
    });

    const result = planJoin(detection, ["SE"], staticLookup([seMunicipalities]));

    expect(result.mapReady).toBe(true);
    expect(result.strategy).toBe("direct_code");
    expect(result.geometryLayerId).toBe("se:municipalities");
    expect(result.geometryJoinField).toBe("code");
  });
});

// ═══════════════════════════════════════════════════════════════
// NUTS-style joins
// ═══════════════════════════════════════════════════════════════

describe("NUTS joins", () => {
  it("plans join for NUTS2 data", () => {
    const nuts2 = makeEntry({
      id: "eurostat:nuts2",
      level: "nuts2",
      joinKeys: [
        { geometryProperty: "nuts_id", codeFamily: { family: "eurostat", namespace: "nuts" } },
      ],
      status: "production",
      regionCode: "EU",
    });

    const detection = makeDetection({
      level: "nuts2",
      codeFamily: { family: "eurostat", namespace: "nuts" },
      confidence: 0.7,
      geoDimensionId: "geo",
    });

    const result = planJoin(detection, ["SE"], staticLookup([nuts2]));

    expect(result.mapReady).toBe(true);
    expect(result.strategy).toBe("direct_code");
    expect(result.geometryLayerId).toBe("eurostat:nuts2");
    expect(result.geometryJoinField).toBe("nuts_id");
  });

  it("plans join for NUTS1 German Länder", () => {
    const nuts1 = makeEntry({
      id: "eurostat:nuts1",
      level: "nuts1",
      joinKeys: [
        { geometryProperty: "nuts_id", codeFamily: { family: "eurostat", namespace: "nuts" } },
      ],
      status: "production",
      regionCode: "EU",
    });

    const detection = makeDetection({
      level: "nuts1",
      codeFamily: { family: "eurostat", namespace: "nuts" },
      confidence: 0.65,
      geoDimensionId: "geo",
      unitCount: 16,
    });

    const result = planJoin(detection, ["DE"], staticLookup([nuts1]));

    expect(result.mapReady).toBe(true);
    expect(result.strategy).toBe("direct_code");
    expect(result.geometryLayerId).toBe("eurostat:nuts1");
  });
});

// ═══════════════════════════════════════════════════════════════
// No compatible boundary layer
// ═══════════════════════════════════════════════════════════════

describe("no compatible boundary", () => {
  it("returns not map-ready when no entries exist", () => {
    const detection = makeDetection({
      level: "municipality",
      codeFamily: { family: "national", namespace: "au-abs" },
      confidence: 0.8,
    });

    const result = planJoin(detection, ["AU"], staticLookup([]));

    expect(result.mapReady).toBe(false);
    expect(result.strategy).toBe("none");
    expect(result.confidence).toBe(0);
    expect(result.geometryLayerId).toBeUndefined();
  });

  it("returns not map-ready for point_set level (not polygon)", () => {
    const detection = makeDetection({
      level: "point_set",
      codeFamily: { family: "name" },
      confidence: 0.6,
      renderHint: "point_based",
    });

    // Even if a point entry exists, the planner filters out point_set for polygon joins
    const pointEntry = makeEntry({
      id: "test:points",
      level: "point_set",
      joinKeys: [{ geometryProperty: "name", codeFamily: { family: "name" } }],
    });

    const result = planJoin(detection, [], staticLookup([pointEntry]));

    // point_set with non-inline code family → no polygon candidates found
    expect(result.mapReady).toBe(false);
    expect(result.strategy).toBe("none");
  });
});

// ═══════════════════════════════════════════════════════════════
// Fuzzy name downgrade
// ═══════════════════════════════════════════════════════════════

describe("fuzzy name handling", () => {
  it("caps fuzzy-only joins below map-ready threshold", () => {
    const entry = makeEntry({
      id: "test:admin1",
      level: "admin1",
      joinKeys: [
        // Only a name join key, no code-based key matching detection
        { geometryProperty: "name", codeFamily: { family: "name" } },
      ],
      status: "production",
    });

    const detection = makeDetection({
      level: "admin1",
      codeFamily: { family: "national", namespace: "xx-custom" },
      confidence: 0.9, // high detection confidence
    });

    const result = planJoin(detection, [], staticLookup([entry]));

    // Name on entry vs national on detection → fuzzy fallback
    expect(result.strategy).toBe("fuzzy_name");
    expect(result.confidence).toBeLessThanOrEqual(0.45);
    expect(result.mapReady).toBe(false);
  });

  it("uses normalized name when both sides are name family", () => {
    const entry = makeEntry({
      id: "test:admin1-names",
      level: "admin1",
      joinKeys: [
        { geometryProperty: "name", codeFamily: { family: "name" } },
      ],
      status: "production",
    });

    const detection = makeDetection({
      level: "admin1",
      codeFamily: { family: "name" },
      confidence: 0.5,
    });

    const result = planJoin(detection, [], staticLookup([entry]));

    expect(result.strategy).toBe("normalized_name");
    // normalized_name (0.3) + production (0.15) + detection (0.5*0.3=0.15) = 0.6
    expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    expect(result.mapReady).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Namespace match vs family-only match
// ═══════════════════════════════════════════════════════════════

describe("namespace scoring precedence", () => {
  it("prefers exact namespace match over family-only match", () => {
    const exactEntry = makeEntry({
      id: "test:exact",
      level: "admin1",
      joinKeys: [
        { geometryProperty: "code", codeFamily: { family: "national", namespace: "se-scb" } },
      ],
      status: "provisional",
    });

    const familyOnlyEntry = makeEntry({
      id: "test:family-only",
      level: "admin1",
      joinKeys: [
        { geometryProperty: "code", codeFamily: { family: "national" } },
      ],
      status: "provisional",
    });

    const detection = makeDetection({
      level: "admin1",
      codeFamily: { family: "national", namespace: "se-scb" },
      confidence: 0.7,
    });

    // Both entries available — exact namespace should win
    const result = planJoin(
      detection,
      ["SE"],
      staticLookup([familyOnlyEntry, exactEntry]),
    );

    expect(result.geometryLayerId).toBe("test:exact");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("family-only match scores lower than exact namespace", () => {
    const familyOnly = makeEntry({
      id: "test:family",
      level: "admin1",
      joinKeys: [
        { geometryProperty: "code", codeFamily: { family: "national" } },
      ],
      status: "production",
    });

    const detection = makeDetection({
      level: "admin1",
      codeFamily: { family: "national", namespace: "se-scb" },
      confidence: 0.6,
    });

    const result = planJoin(detection, ["SE"], staticLookup([familyOnly]));

    // family-only (0.2) + production (0.15) + detection (0.6*0.3=0.18) = 0.53
    expect(result.confidence).toBeLessThan(0.6);
    expect(result.mapReady).toBe(true); // just barely above 0.5
  });

  it("crosswalk strategy when same family but different namespaces", () => {
    const entry = makeEntry({
      id: "test:crosswalk",
      level: "admin1",
      joinKeys: [
        { geometryProperty: "code", codeFamily: { family: "national", namespace: "no-ssb" } },
      ],
      status: "production",
    });

    const detection = makeDetection({
      level: "admin1",
      codeFamily: { family: "national", namespace: "se-scb" },
      confidence: 0.7,
    });

    const result = planJoin(detection, ["SE"], staticLookup([entry]));

    expect(result.strategy).toBe("alias_crosswalk");
    // crosswalk (0.2) + production (0.15) + detection (0.7*0.3=0.21) = 0.56
    expect(result.confidence).toBeGreaterThan(0.5);
  });
});

// ═══════════════════════════════════════════════════════════════
// Production vs provisional preference
// ═══════════════════════════════════════════════════════════════

describe("production vs provisional", () => {
  it("prefers production when both have same join quality", () => {
    const prodEntry = makeEntry({
      id: "test:prod",
      level: "country",
      joinKeys: [
        { geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } },
      ],
      status: "production",
    });

    const provEntry = makeEntry({
      id: "test:prov",
      level: "country",
      joinKeys: [
        { geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } },
      ],
      status: "provisional",
    });

    const detection = makeDetection({
      level: "country",
      codeFamily: { family: "iso", namespace: "alpha3" },
      confidence: 0.85,
    });

    const result = planJoin(
      detection,
      [],
      staticLookup([provEntry, prodEntry]),
    );

    expect(result.geometryLayerId).toBe("test:prod");
  });

  it("provisional entry reduces overall confidence", () => {
    const provEntry = makeEntry({
      id: "test:prov-only",
      level: "admin1",
      joinKeys: [
        { geometryProperty: "code", codeFamily: { family: "national", namespace: "xx" } },
      ],
      status: "provisional",
    });

    const detection = makeDetection({
      level: "admin1",
      codeFamily: { family: "national", namespace: "xx" },
      confidence: 0.7,
    });

    const result = planJoin(detection, [], staticLookup([provEntry]));

    // exact (0.5) + provisional (-0.1) + detection (0.7*0.3=0.21) = 0.61
    expect(result.confidence).toBeLessThan(0.7);
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.mapReady).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Inline geometry (point-based)
// ═══════════════════════════════════════════════════════════════

describe("inline geometry", () => {
  it("returns map-ready for inline point data", () => {
    const detection = makeDetection({
      level: "point_set",
      codeFamily: { family: "custom", namespace: "inline" },
      confidence: 0.6,
      renderHint: "point_based",
    });

    const result = planJoin(detection, [], staticLookup([]));

    expect(result.mapReady).toBe(true);
    expect(result.strategy).toBe("inline_geometry");
    expect(result.geometryLayerId).toBeUndefined();
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("returns map-ready for coordinate-based point data", () => {
    const detection = makeDetection({
      level: "point_set",
      codeFamily: { family: "custom", namespace: "coordinates" },
      confidence: 0.7,
      renderHint: "point_based",
    });

    const result = planJoin(detection, [], staticLookup([]));

    expect(result.mapReady).toBe(true);
    expect(result.strategy).toBe("inline_geometry");
  });
});

// ═══════════════════════════════════════════════════════════════
// Non-geographic and unknown
// ═══════════════════════════════════════════════════════════════

describe("non-geographic and unknown", () => {
  it("returns not map-ready for non-geographic detection", () => {
    const detection = makeDetection({
      level: "unknown",
      codeFamily: { family: "name" },
      confidence: 0,
      renderHint: "non_geographic",
    });

    const result = planJoin(detection, [], staticLookup([]));

    expect(result.mapReady).toBe(false);
    expect(result.strategy).toBe("none");
    expect(result.confidence).toBe(0);
  });

  it("returns not map-ready for unknown level with low confidence", () => {
    const detection = makeDetection({
      level: "unknown",
      codeFamily: { family: "name" },
      confidence: 0.1,
      renderHint: "polygon_join",
    });

    const result = planJoin(detection, [], staticLookup([]));

    expect(result.mapReady).toBe(false);
    expect(result.strategy).toBe("none");
  });

  it("attempts join for unknown level with low confidence", () => {
    const entry = makeEntry({
      id: "test:unknown-fallback",
      level: "unknown",
      joinKeys: [
        { geometryProperty: "name", codeFamily: { family: "name" } },
      ],
      status: "provisional",
    });

    const detection = makeDetection({
      level: "unknown",
      codeFamily: { family: "name" },
      confidence: 0.35,
      renderHint: "polygon_join",
    });

    const result = planJoin(detection, [], staticLookup([entry]));

    // Will attempt but normalized_name with provisional and low confidence won't be enough
    expect(result.strategy).toBe("normalized_name");
    // normalized_name (0.3) + provisional (-0.1) + detection (0.35*0.3=0.105) = 0.305
    expect(result.mapReady).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Uses real registry (integration test)
// ═══════════════════════════════════════════════════════════════

describe("integration with real registry", () => {
  it("plans country-level join via real registry", () => {
    const detection = makeDetection({
      level: "country",
      codeFamily: { family: "iso", namespace: "alpha3" },
      confidence: 0.85,
      geoDimensionId: "country",
    });

    // No custom lookup → uses real findByCountryAndLevel
    const result = planJoin(detection, ["SE"]);

    expect(result.mapReady).toBe(true);
    expect(result.strategy).toBe("direct_code");
    expect(result.geometryLayerId).toBe("natural-earth:ne_110m_admin_0_countries");
    expect(result.geometryJoinField).toBe("iso_a3");
  });

  it("plans Swedish municipality join via real registry (name-based)", () => {
    const detection = makeDetection({
      level: "municipality",
      codeFamily: { family: "name" },
      confidence: 0.8,
      geoDimensionId: "Region",
    });

    const result = planJoin(detection, ["SE"]);

    expect(result.mapReady).toBe(true);
    expect(result.geometryLayerId).toBe("se:municipalities");
    expect(result.geometryJoinField).toBe("name");
  });

  it("returns not map-ready for Australian municipalities via real registry", () => {
    const detection = makeDetection({
      level: "municipality",
      codeFamily: { family: "national", namespace: "au-abs" },
      confidence: 0.8,
    });

    const result = planJoin(detection, ["AU"]);

    expect(result.mapReady).toBe(false);
    expect(result.strategy).toBe("none");
  });
});

// ═══════════════════════════════════════════════════════════════
// Reasons array
// ═══════════════════════════════════════════════════════════════

describe("reasons", () => {
  it("always populates reasons array", () => {
    const detection = makeDetection({
      level: "country",
      codeFamily: { family: "iso", namespace: "alpha3" },
      confidence: 0.85,
    });

    const entry = makeEntry({
      id: "test:countries",
      level: "country",
      joinKeys: [
        { geometryProperty: "iso_a3", codeFamily: { family: "iso", namespace: "alpha3" } },
      ],
    });

    const result = planJoin(detection, [], staticLookup([entry]));

    expect(result.reasons.length).toBeGreaterThan(0);
    for (const r of result.reasons) {
      expect(typeof r).toBe("string");
      expect(r.length).toBeGreaterThan(0);
    }
  });
});
