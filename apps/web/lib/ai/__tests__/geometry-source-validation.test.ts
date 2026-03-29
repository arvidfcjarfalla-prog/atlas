/**
 * Offline structural validation of geometry registry entries.
 *
 * Verifies that registered geometry sources have:
 *   - Required fields (id, joinKeys, loaderTarget, etc.)
 *   - Consistent property names matching known CDN schemas
 *   - No duplicate entry IDs
 *   - Plausible feature counts for the geography level
 *   - Representative data samples that can join via declared property names
 *
 * These tests use inline GeoJSON fixtures that mirror real CDN property
 * structure — no network calls are made.
 */

import { describe, it, expect } from "vitest";
import {
  getAllEntries,
  findById,
  findByCountryAndLevel,
  resolveBestEntry,
} from "../tools/geometry-registry";
import type { GeometryEntry } from "../tools/geometry-registry";
import { executeJoin } from "../tools/geometry-join";
import type { JoinPlanResult } from "../tools/join-planner";
import type { NormalizedRow } from "../tools/normalized-result";

// ═══════════════════════════════════════════════════════════════
// Test helpers
// ═══════════════════════════════════════════════════════════════

function makePlan(entry: GeometryEntry, joinKeyIndex = 0): JoinPlanResult {
  return {
    mapReady: true,
    geometryLayerId: entry.id,
    rowJoinField: "Region",
    geometryJoinField: entry.joinKeys[joinKeyIndex].geometryProperty,
    strategy: "direct_code",
    confidence: 0.7,
    reasons: [],
  };
}

function makeRow(geoCode: string, value: number): NormalizedRow {
  return {
    dimensionValues: { Region: geoCode, Tid: "2023" },
    value,
  };
}

function makeFeature(
  properties: Record<string, string | number>,
): GeoJSON.Feature {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
    },
    properties,
  };
}

function makeFC(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

// ═══════════════════════════════════════════════════════════════
// Registry structural validation
// ═══════════════════════════════════════════════════════════════

describe("registry structural integrity", () => {
  const entries = getAllEntries();

  it("has no duplicate IDs", () => {
    const ids = entries.map((e) => e.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("every entry has required fields", () => {
    for (const entry of entries) {
      expect(entry.id, `${entry.id}: missing id`).toBeTruthy();
      expect(entry.name, `${entry.id}: missing name`).toBeTruthy();
      expect(entry.level, `${entry.id}: missing level`).toBeTruthy();
      expect(entry.scope, `${entry.id}: missing scope`).toBeTruthy();
      expect(entry.loaderType, `${entry.id}: missing loaderType`).toBeTruthy();
      expect(entry.loaderTarget, `${entry.id}: missing loaderTarget`).toBeTruthy();
      expect(entry.joinKeys.length, `${entry.id}: no joinKeys`).toBeGreaterThan(0);
      expect(entry.featureIdProperty, `${entry.id}: missing featureIdProperty`).toBeTruthy();
      expect(entry.resolution, `${entry.id}: missing resolution`).toBeTruthy();
      expect(entry.status, `${entry.id}: missing status`).toBeTruthy();
    }
  });

  it("every join key has geometryProperty and codeFamily", () => {
    for (const entry of entries) {
      for (const jk of entry.joinKeys) {
        expect(jk.geometryProperty, `${entry.id}: joinKey missing geometryProperty`).toBeTruthy();
        expect(jk.codeFamily, `${entry.id}: joinKey missing codeFamily`).toBeTruthy();
        expect(jk.codeFamily.family, `${entry.id}: joinKey missing codeFamily.family`).toBeTruthy();
      }
    }
  });

  it("featureIdProperty is listed as a join key geometryProperty", () => {
    for (const entry of entries) {
      const joinProps = entry.joinKeys.map((jk) => jk.geometryProperty);
      expect(
        joinProps,
        `${entry.id}: featureIdProperty "${entry.featureIdProperty}" not in joinKeys`,
      ).toContain(entry.featureIdProperty);
    }
  });

  it("feature counts are plausible for geography levels", () => {
    const levelBounds: Record<string, [number, number]> = {
      country: [1, 300],
      admin1: [1, 5000],
      admin2: [1, 6000],
      municipality: [1, 6000],
      nuts0: [1, 50],
      nuts1: [1, 200],
      nuts2: [1, 500],
      nuts3: [1, 2000],
      point_set: [1, 10000],
    };

    for (const entry of entries) {
      if (entry.featureCount == null) continue;
      const bounds = levelBounds[entry.level];
      if (!bounds) continue;
      const [min, max] = bounds;
      expect(
        entry.featureCount,
        `${entry.id}: featureCount ${entry.featureCount} out of plausible range [${min}, ${max}]`,
      ).toBeGreaterThanOrEqual(min);
      expect(entry.featureCount).toBeLessThanOrEqual(max);
    }
  });

  it("CDN entries have valid URLs", () => {
    for (const entry of entries) {
      if (entry.loaderType !== "cdn_url") continue;
      expect(
        entry.loaderTarget,
        `${entry.id}: CDN URL should start with https`,
      ).toMatch(/^https:\/\//);
    }
  });

  it("sparse sources are marked with conservative notes", () => {
    const sparseEntries = entries.filter(
      (e) => e.notes?.includes("INCOMPLETE"),
    );
    for (const entry of sparseEntries) {
      expect(
        entry.status,
        `${entry.id}: sparse source should be provisional`,
      ).toBe("provisional");
      expect(
        entry.notes,
        `${entry.id}: sparse source should mention coverage concerns`,
      ).toMatch(/too sparse|INCOMPLETE/i);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Sweden: se:admin1 (county-level, ISO 3166-2 codes)
// ═══════════════════════════════════════════════════════════════

describe("se:admin1 property validation", () => {
  const entry = findById("se:admin1")!;

  it("exists and uses iso_3166_2 for code join", () => {
    expect(entry).toBeDefined();
    const isoKey = entry.joinKeys.find((jk) => jk.codeFamily.namespace === "3166-2");
    expect(isoKey).toBeDefined();
    expect(isoKey!.geometryProperty).toBe("iso_3166_2");
  });

  it("uses name for name-based join", () => {
    const nameKey = entry.joinKeys.find((jk) => jk.codeFamily.family === "name");
    expect(nameKey).toBeDefined();
    expect(nameKey!.geometryProperty).toBe("name");
  });

  it("representative ISO 3166-2 county codes join via iso_3166_2", () => {
    // Fixture mirrors geoBoundaries ADM1 property structure
    const geometry = makeFC([
      makeFeature({ iso_3166_2: "SE-AB", name: "Stockholms län", iso_a3: "SWE" }),
      makeFeature({ iso_3166_2: "SE-C", name: "Uppsala län", iso_a3: "SWE" }),
      makeFeature({ iso_3166_2: "SE-X", name: "Gävleborgs län", iso_a3: "SWE" }),
    ]);

    const rows = [makeRow("SE-AB", 100), makeRow("SE-C", 200), makeRow("SE-X", 300)];
    const plan = makePlan(entry, 0); // iso_3166_2 join key

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(3);
    expect(result.diagnostics.unmatched).toBe(0);
    expect(result.status).toBe("map_ready");
  });

  it("name-based join works for county names", () => {
    const geometry = makeFC([
      makeFeature({ iso_3166_2: "SE-AB", name: "Stockholms län", iso_a3: "SWE" }),
      makeFeature({ iso_3166_2: "SE-O", name: "Västra Götalands län", iso_a3: "SWE" }),
    ]);

    const rows = [
      makeRow("Stockholms län", 100),
      makeRow("Västra Götalands län", 200),
    ];
    const plan = makePlan(entry, 1); // name join key

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════
// Sweden: se:municipalities (municipality-level codes)
// ═══════════════════════════════════════════════════════════════

describe("se:municipalities property validation", () => {
  const entry = findById("se:municipalities")!;

  it("exists and uses SCB code + name join", () => {
    expect(entry).toBeDefined();
    expect(entry.joinKeys.length).toBe(2);
    expect(entry.joinKeys[0].geometryProperty).toBe("scb_code");
    expect(entry.joinKeys[0].codeFamily.family).toBe("national");
    expect(entry.joinKeys[0].codeFamily.namespace).toBe("se-scb");
    expect(entry.joinKeys[1].geometryProperty).toBe("name");
    expect(entry.joinKeys[1].codeFamily.family).toBe("name");
  });

  it("has 290 municipalities and production status", () => {
    expect(entry.featureCount).toBe(290);
    expect(entry.status).toBe("production");
  });

  it("representative municipality SCB codes join via scb_code", () => {
    const geometry = makeFC([
      makeFeature({ scb_code: "0114", name: "Upplands Väsby", iso_a3: "SWE" }),
      makeFeature({ scb_code: "0115", name: "Vallentuna", iso_a3: "SWE" }),
      makeFeature({ scb_code: "0180", name: "Stockholm", iso_a3: "SWE" }),
    ]);

    const rows = [makeRow("0114", 100), makeRow("0115", 200), makeRow("0180", 300)];
    const plan = makePlan(entry, 0); // scb_code join key

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(3);
    expect(result.status).toBe("map_ready");
  });
});

// ═══════════════════════════════════════════════════════════════
// Eurostat NUTS
// ═══════════════════════════════════════════════════════════════

describe("eurostat:nuts0 property validation", () => {
  const entry = findById("eurostat:nuts0")!;

  it("exists and has correct feature count", () => {
    expect(entry).toBeDefined();
    expect(entry.featureCount).toBe(39);
  });

  it("uses nuts_id for eurostat code join", () => {
    const nutsKey = entry.joinKeys.find((jk) => jk.codeFamily.namespace === "nuts");
    expect(nutsKey).toBeDefined();
    expect(nutsKey!.geometryProperty).toBe("nuts_id");
  });

  it("uses iso_a2 for ISO alpha-2 join", () => {
    const isoKey = entry.joinKeys.find((jk) => jk.codeFamily.namespace === "alpha2");
    expect(isoKey).toBeDefined();
    expect(isoKey!.geometryProperty).toBe("iso_a2");
  });

  it("representative NUTS-0 codes join via nuts_id", () => {
    // Fixture mirrors Eurostat GISCO property structure (normalized)
    const geometry = makeFC([
      makeFeature({ nuts_id: "SE", iso_a2: "SE", name: "Sverige" }),
      makeFeature({ nuts_id: "DE", iso_a2: "DE", name: "Deutschland" }),
      makeFeature({ nuts_id: "FR", iso_a2: "FR", name: "France" }),
    ]);

    const rows = [makeRow("SE", 100), makeRow("DE", 200), makeRow("FR", 300)];
    const plan = makePlan(entry, 0); // nuts_id join key

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(3);
    expect(result.status).toBe("map_ready");
  });

  it("representative country codes join via iso_a2", () => {
    const geometry = makeFC([
      makeFeature({ nuts_id: "SE", iso_a2: "SE" }),
      makeFeature({ nuts_id: "NO", iso_a2: "NO" }),
    ]);

    const rows = [makeRow("SE", 100), makeRow("NO", 200)];
    const plan = makePlan(entry, 1); // iso_a2 join key

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(2);
  });
});

describe("eurostat:nuts2 property validation", () => {
  const entry = findById("eurostat:nuts2")!;

  it("exists and uses nuts_id", () => {
    expect(entry).toBeDefined();
    const nutsKey = entry.joinKeys.find((jk) => jk.codeFamily.namespace === "nuts");
    expect(nutsKey).toBeDefined();
    expect(nutsKey!.geometryProperty).toBe("nuts_id");
  });

  it("representative NUTS-2 codes join via nuts_id", () => {
    const geometry = makeFC([
      makeFeature({ nuts_id: "SE22", name: "Sydsverige" }),
      makeFeature({ nuts_id: "DE11", name: "Stuttgart" }),
      makeFeature({ nuts_id: "FR10", name: "Île de France" }),
    ]);

    const rows = [makeRow("SE22", 100), makeRow("DE11", 200), makeRow("FR10", 300)];
    const plan = makePlan(entry, 0);

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(3);
    expect(result.status).toBe("map_ready");
  });
});

// ═══════════════════════════════════════════════════════════════
// US States
// ═══════════════════════════════════════════════════════════════

describe("us:states property validation", () => {
  const entry = findById("us:states")!;

  it("exists and has both iso_3166_2 and name join keys", () => {
    expect(entry).toBeDefined();
    const nameKey = entry.joinKeys.find((jk) => jk.codeFamily.family === "name");
    const isoKey = entry.joinKeys.find((jk) => jk.codeFamily.namespace === "3166-2");
    expect(nameKey).toBeDefined();
    expect(nameKey!.geometryProperty).toBe("name");
    expect(isoKey).toBeDefined();
    expect(isoKey!.geometryProperty).toBe("iso_3166_2");
  });

  it("representative state names join via name", () => {
    // Fixture mirrors geoBoundaries ADM1 properties
    const geometry = makeFC([
      makeFeature({ name: "California", iso_3166_2: "US-CA", iso_a3: "USA" }),
      makeFeature({ name: "Texas", iso_3166_2: "US-TX", iso_a3: "USA" }),
      makeFeature({ name: "New York", iso_3166_2: "US-NY", iso_a3: "USA" }),
    ]);

    const rows = [makeRow("California", 100), makeRow("Texas", 200), makeRow("New York", 300)];
    const plan = makePlan(entry, 1); // name join key

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(3);
    expect(result.status).toBe("map_ready");
  });

  it("representative ISO 3166-2 codes join via iso_3166_2", () => {
    const geometry = makeFC([
      makeFeature({ name: "California", iso_3166_2: "US-CA", iso_a3: "USA" }),
      makeFeature({ name: "Texas", iso_3166_2: "US-TX", iso_a3: "USA" }),
      makeFeature({ name: "New York", iso_3166_2: "US-NY", iso_a3: "USA" }),
    ]);

    const rows = [makeRow("US-CA", 100), makeRow("US-TX", 200), makeRow("US-NY", 300)];
    const plan = makePlan(entry, 0); // iso_3166_2 join key

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(3);
    expect(result.status).toBe("map_ready");
  });

  it("feature count is 56 (50 states + DC + territories)", () => {
    expect(entry.featureCount).toBe(56);
  });
});

// ═══════════════════════════════════════════════════════════════
// Norway
// ═══════════════════════════════════════════════════════════════

describe("no:admin1 property validation", () => {
  const entry = findById("no:admin1")!;

  it("exists and uses iso_3166_2 for code join", () => {
    expect(entry).toBeDefined();
    const isoKey = entry.joinKeys.find((jk) => jk.codeFamily.namespace === "3166-2");
    expect(isoKey).toBeDefined();
    expect(isoKey!.geometryProperty).toBe("iso_3166_2");
  });

  it("uses name for name-based join", () => {
    const nameKey = entry.joinKeys.find((jk) => jk.codeFamily.family === "name");
    expect(nameKey).toBeDefined();
    expect(nameKey!.geometryProperty).toBe("name");
  });

  it("has 11 counties and production status", () => {
    expect(entry.featureCount).toBe(11);
    expect(entry.status).toBe("production");
  });

  it("representative ISO 3166-2 county codes join via iso_3166_2", () => {
    const geometry = makeFC([
      makeFeature({ iso_3166_2: "NO-03", name: "Oslo", iso_a3: "NOR" }),
      makeFeature({ iso_3166_2: "NO-11", name: "Rogaland", iso_a3: "NOR" }),
      makeFeature({ iso_3166_2: "NO-15", name: "Møre og Romsdal", iso_a3: "NOR" }),
    ]);

    const rows = [makeRow("NO-03", 100), makeRow("NO-11", 200), makeRow("NO-15", 300)];
    const plan = makePlan(entry, 0); // iso_3166_2 join key

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(3);
    expect(result.status).toBe("map_ready");
  });
});

describe("no:municipalities property validation", () => {
  const entry = findById("no:municipalities")!;

  it("exists with kommunenummer as primary join key and name as fallback", () => {
    expect(entry).toBeDefined();
    expect(entry.joinKeys.length).toBe(2);
    expect(entry.joinKeys[0].geometryProperty).toBe("kommunenummer");
    expect(entry.joinKeys[0].codeFamily.family).toBe("national");
    expect(entry.joinKeys[0].codeFamily.namespace).toBe("no-ssb");
    expect(entry.joinKeys[1].geometryProperty).toBe("name");
    expect(entry.joinKeys[1].codeFamily.family).toBe("name");
  });

  it("has production status", () => {
    expect(entry.status).toBe("production");
  });

  it("representative municipality SSB codes join via kommunenummer", () => {
    const geometry = makeFC([
      makeFeature({ kommunenummer: "0301", name: "Oslo" }),
      makeFeature({ kommunenummer: "1103", name: "Stavanger" }),
      makeFeature({ kommunenummer: "4601", name: "Bergen" }),
    ]);

    const rows = [makeRow("0301", 100), makeRow("1103", 200), makeRow("4601", 300)];
    const plan = makePlan(entry, 0); // kommunenummer join key (index 0)

    const result = executeJoin(plan, rows, geometry);
    expect(result.diagnostics.matched).toBe(3);
    expect(result.status).toBe("map_ready");
  });
});

// ═══════════════════════════════════════════════════════════════
// Lookup API validation
// ═══════════════════════════════════════════════════════════════

describe("registry lookup consistency", () => {
  it("findByCountryAndLevel returns se:admin1 for SE admin1", () => {
    const entries = findByCountryAndLevel("SE", "admin1");
    const ids = entries.map((e) => e.id);
    expect(ids).toContain("se:admin1");
  });

  it("findByCountryAndLevel returns se:municipalities for SE municipality", () => {
    const entries = findByCountryAndLevel("SE", "municipality");
    const ids = entries.map((e) => e.id);
    expect(ids).toContain("se:municipalities");
  });

  it("findByCountryAndLevel returns us:states for US admin1", () => {
    const entries = findByCountryAndLevel("US", "admin1");
    const ids = entries.map((e) => e.id);
    expect(ids).toContain("us:states");
  });

  it("SE countries fall back to eurostat:nuts0 for nuts0 level", () => {
    const entries = findByCountryAndLevel("SE", "nuts0");
    const ids = entries.map((e) => e.id);
    expect(ids).toContain("eurostat:nuts0");
  });

  it("resolveBestEntry picks production over provisional for GLOBAL country", () => {
    const best = resolveBestEntry("SE", "country");
    expect(best?.status).toBe("production");
    expect(best?.id).toBe("natural-earth:ne_110m_admin_0_countries");
  });
});
