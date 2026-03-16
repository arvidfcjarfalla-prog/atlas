import { describe, it, expect } from "vitest";
import {
  getAllEntries,
  findByLevel,
  findByCountryAndLevel,
  findByRegion,
  findByJoinCompatibility,
  findById,
  resolveBestEntry,
  type GeometryEntry,
} from "../tools/geometry-registry";
import type { CodeFamily, GeographyLevel } from "../tools/normalized-result";

// ═══════════════════════════════════════════════════════════════
// Registry integrity
// ═══════════════════════════════════════════════════════════════

describe("registry integrity", () => {
  it("has at least one entry", () => {
    expect(getAllEntries().length).toBeGreaterThan(0);
  });

  it("has unique IDs across all entries", () => {
    const entries = getAllEntries();
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every entry has at least one join key", () => {
    for (const entry of getAllEntries()) {
      expect(entry.joinKeys.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("every entry has a non-empty loaderTarget", () => {
    for (const entry of getAllEntries()) {
      expect(entry.loaderTarget.length).toBeGreaterThan(0);
    }
  });

  it("has at least one production-status entry", () => {
    const production = getAllEntries().filter((e) => e.status === "production");
    expect(production.length).toBeGreaterThanOrEqual(1);
  });

  it("production entries use api_route, local_file, or cdn_url loaders", () => {
    const production = getAllEntries().filter((e) => e.status === "production");
    for (const entry of production) {
      expect(["api_route", "local_file", "cdn_url"]).toContain(entry.loaderType);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// findByLevel
// ═══════════════════════════════════════════════════════════════

describe("findByLevel", () => {
  it("finds country-level geometry", () => {
    const entries = findByLevel("country");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const e of entries) {
      expect(e.level).toBe("country");
    }
  });

  it("finds admin1-level geometry", () => {
    const entries = findByLevel("admin1");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const e of entries) {
      expect(e.level).toBe("admin1");
    }
  });

  it("finds NUTS layers", () => {
    const nuts2 = findByLevel("nuts2");
    expect(nuts2.length).toBeGreaterThanOrEqual(1);
    expect(nuts2[0].level).toBe("nuts2");
  });

  it("finds municipality-level geometry", () => {
    const entries = findByLevel("municipality");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    for (const e of entries) {
      expect(e.level).toBe("municipality");
    }
  });

  it("finds point_set geometry", () => {
    const entries = findByLevel("point_set");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].level).toBe("point_set");
  });

  it("returns empty array for level with no entries", () => {
    const entries = findByLevel("grid");
    expect(entries).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// findByCountryAndLevel
// ═══════════════════════════════════════════════════════════════

describe("findByCountryAndLevel", () => {
  it("returns country-specific entry first for SE + municipality", () => {
    const entries = findByCountryAndLevel("SE", "municipality");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].scope.regionCode).toBe("SE");
    expect(entries[0].level).toBe("municipality");
  });

  it("returns country-specific entry first for NO + admin1", () => {
    const entries = findByCountryAndLevel("NO", "admin1");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    // NO-specific entry should come before the global NE admin1
    const noEntry = entries.find((e) => e.scope.regionCode === "NO");
    expect(noEntry).toBeDefined();
    expect(entries[0].scope.regionCode).toBe("NO");
  });

  it("falls back to global layer for country without specific entry", () => {
    const entries = findByCountryAndLevel("BR", "country");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    // Should find global Natural Earth countries
    expect(entries.some((e) => e.scope.regionCode === "GLOBAL")).toBe(true);
  });

  it("returns EU NUTS layers for EU countries", () => {
    const entries = findByCountryAndLevel("DE", "nuts1");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].scope.regionCode).toBe("EU");
  });

  it("returns EU NUTS layers for EFTA countries (NO, CH)", () => {
    const entries = findByCountryAndLevel("NO", "nuts2");
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect(entries[0].scope.regionCode).toBe("EU");
  });

  it("returns empty array when no match exists", () => {
    const entries = findByCountryAndLevel("AU", "municipality");
    expect(entries).toEqual([]);
  });

  it("is case-insensitive for country code", () => {
    const lower = findByCountryAndLevel("se", "municipality");
    const upper = findByCountryAndLevel("SE", "municipality");
    expect(lower.length).toBe(upper.length);
    expect(lower[0].id).toBe(upper[0].id);
  });

  it("includes both country-specific and global for SE + admin1", () => {
    const entries = findByCountryAndLevel("SE", "admin1");
    // SE has se:lan (country-specific) + NE admin1 (global)
    expect(entries.length).toBeGreaterThanOrEqual(2);
    // Country-specific should be first
    expect(entries[0].scope.regionCode).toBe("SE");
  });
});

// ═══════════════════════════════════════════════════════════════
// findByRegion
// ═══════════════════════════════════════════════════════════════

describe("findByRegion", () => {
  it("finds all GLOBAL layers", () => {
    const entries = findByRegion("GLOBAL");
    expect(entries.length).toBeGreaterThanOrEqual(2);
    for (const e of entries) {
      expect(e.scope.regionCode).toBe("GLOBAL");
    }
  });

  it("finds all EU layers (NUTS)", () => {
    const entries = findByRegion("EU");
    expect(entries.length).toBeGreaterThanOrEqual(4); // nuts0-3
    for (const e of entries) {
      expect(e.scope.regionCode).toBe("EU");
    }
  });

  it("finds Sweden-specific layers", () => {
    const entries = findByRegion("SE");
    expect(entries.length).toBeGreaterThanOrEqual(2); // län + kommun
    for (const e of entries) {
      expect(e.scope.regionCode).toBe("SE");
    }
  });

  it("returns empty for region with no entries", () => {
    expect(findByRegion("XX")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// findByJoinCompatibility
// ═══════════════════════════════════════════════════════════════

describe("findByJoinCompatibility", () => {
  it("finds entries joinable via ISO alpha-3", () => {
    const family: CodeFamily = { family: "iso", namespace: "alpha3" };
    const entries = findByJoinCompatibility(family);
    expect(entries.length).toBeGreaterThanOrEqual(1);
    // Should include world countries
    expect(entries.some((e) => e.id.includes("admin_0_countries"))).toBe(true);
  });

  it("finds entries joinable via NUTS codes", () => {
    const family: CodeFamily = { family: "eurostat", namespace: "nuts" };
    const entries = findByJoinCompatibility(family);
    expect(entries.length).toBeGreaterThanOrEqual(4); // nuts0-3
  });

  it("finds entries joinable via name matching", () => {
    const family: CodeFamily = { family: "name" };
    const entries = findByJoinCompatibility(family);
    // Many entries support name-based joining
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it("finds entries joinable via national codes (returns empty — no national keys in ADM2-only registry)", () => {
    const family: CodeFamily = { family: "national", namespace: "se-scb" };
    const entries = findByJoinCompatibility(family);
    // geoBoundaries ADM2 has no codes, so no national keys exist in registry
    expect(entries).toEqual([]);
  });

  it("returns empty for code family with no matching entries", () => {
    const family: CodeFamily = { family: "custom", namespace: "nonexistent" };
    const entries = findByJoinCompatibility(family);
    expect(entries).toEqual([]);
  });

  it("namespace-free query for national returns empty (no national keys in registry)", () => {
    const family: CodeFamily = { family: "national" };
    const entries = findByJoinCompatibility(family);
    // geoBoundaries ADM2 has no codes — national keys removed
    expect(entries).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// findById
// ═══════════════════════════════════════════════════════════════

describe("findById", () => {
  it("finds existing entry by exact ID", () => {
    const entry = findById("natural-earth:ne_110m_admin_0_countries");
    expect(entry).toBeDefined();
    expect(entry!.level).toBe("country");
    expect(entry!.status).toBe("production");
  });

  it("returns undefined for nonexistent ID", () => {
    expect(findById("nonexistent:layer")).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// resolveBestEntry
// ═══════════════════════════════════════════════════════════════

describe("resolveBestEntry", () => {
  it("returns production entry for global country level", () => {
    const entry = resolveBestEntry("BR", "country");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("production");
    expect(entry!.level).toBe("country");
  });

  it("picks country-specific production entry for SE admin1", () => {
    const entry = resolveBestEntry("SE", "admin1");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("production");
    // se:admin1 is country-specific and production, should rank first
    expect(entry!.id).toBe("se:admin1");
  });

  it("resolves production SE municipalities entry (290 municipalities)", () => {
    const entry = resolveBestEntry("SE", "municipality");
    expect(entry).toBeDefined();
    expect(entry!.id).toBe("se:municipalities");
    expect(entry!.status).toBe("production");
    expect(entry!.featureCount).toBe(290);
  });

  it("returns EU NUTS for German nuts2", () => {
    const entry = resolveBestEntry("DE", "nuts2");
    expect(entry).toBeDefined();
    expect(entry!.scope.regionCode).toBe("EU");
    expect(entry!.level).toBe("nuts2");
  });

  it("returns undefined when no entry exists at all", () => {
    expect(resolveBestEntry("AU", "municipality")).toBeUndefined();
  });

  it("returns undefined for grid level (no entries registered)", () => {
    expect(resolveBestEntry("SE", "grid")).toBeUndefined();
  });

  it("prefers production over provisional when both match", () => {
    // For "country" level, there are production (110m) and provisional (50m)
    const entry = resolveBestEntry("FR", "country");
    expect(entry).toBeDefined();
    expect(entry!.status).toBe("production");
  });
});

// ═══════════════════════════════════════════════════════════════
// Edge cases & structural guarantees
// ═══════════════════════════════════════════════════════════════

describe("structural guarantees", () => {
  it("every ID follows source:dataset pattern", () => {
    for (const entry of getAllEntries()) {
      expect(entry.id).toMatch(/^[a-z-]+:[a-z0-9_-]+$/i);
      expect(entry.id).toContain(":");
    }
  });

  it("every entry has a valid GeographyLevel", () => {
    const validLevels: GeographyLevel[] = [
      "global", "regional", "country", "admin1", "admin2",
      "municipality", "county", "region", "nuts0", "nuts1",
      "nuts2", "nuts3", "postal_code", "metro_area", "grid",
      "point_set", "custom_polygon", "unknown",
    ];
    for (const entry of getAllEntries()) {
      expect(validLevels).toContain(entry.level);
    }
  });

  it("loaderTarget for api_route starts with /", () => {
    const apiEntries = getAllEntries().filter((e) => e.loaderType === "api_route");
    for (const entry of apiEntries) {
      expect(entry.loaderTarget).toMatch(/^\//);
    }
  });

  it("loaderTarget for cdn_url starts with https://", () => {
    const cdnEntries = getAllEntries().filter((e) => e.loaderType === "cdn_url");
    for (const entry of cdnEntries) {
      expect(entry.loaderTarget).toMatch(/^https:\/\//);
    }
  });

  it("every join key has a valid code family", () => {
    const validFamilies = ["iso", "national", "eurostat", "fips", "name", "custom"];
    for (const entry of getAllEntries()) {
      for (const jk of entry.joinKeys) {
        expect(validFamilies).toContain(jk.codeFamily.family);
      }
    }
  });
});
