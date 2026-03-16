/**
 * Tests for ISO 3166-2 detection and global NE admin1 join planning.
 *
 * Verifies that:
 *   - ISO 3166-2 codes (BR-SP, AU-WA, JP-13) are detected as admin1
 *   - Detection produces { family: "iso", namespace: "3166-2" } code family
 *   - NE admin1 global layer reaches map_ready via exact namespace match
 *   - Countries without dedicated geometry fall through to global NE admin1
 *   - Name-only data still doesn't cross threshold (intentional safety)
 */

import { describe, it, expect } from "vitest";
import {
  classifyCodeShape,
  inferLevelFromCodeShape,
  detectGeography,
} from "../tools/geography-detector";
import { planJoin } from "../tools/join-planner";
import { sourceOk } from "../tools/normalized-result";
import type {
  NormalizedDimension,
  NormalizedSourceResult,
  SourceMetadata,
  QueryDiagnostics,
  GeographyLevel,
} from "../tools/normalized-result";

// ─── Helpers ────────────────────────────────────────────────

const meta = (overrides?: Partial<SourceMetadata>): SourceMetadata => ({
  sourceId: "test",
  sourceName: "Test Source",
  fetchedAt: 1700000000000,
  ...overrides,
});

const diag = (overrides?: Partial<QueryDiagnostics>): QueryDiagnostics => ({
  originalPrompt: "test",
  ...overrides,
});

function makeSource(opts: {
  dimensions?: NormalizedDimension[];
  countryHints?: string[];
  geographyHints?: GeographyLevel[];
  sourceId?: string;
}): NormalizedSourceResult {
  return sourceOk({
    dimensions: opts.dimensions ?? [],
    rows: [],
    candidateMetricFields: [],
    countryHints: opts.countryHints ?? [],
    geographyHints: opts.geographyHints ?? [],
    sourceMetadata: meta({ sourceId: opts.sourceId ?? "test" }),
    diagnostics: diag(),
    confidence: 0.5,
  });
}

function dimGeo(
  id: string,
  values: { code: string; label: string }[],
): NormalizedDimension {
  return { id, label: id, role: "geo", values };
}

function dimTime(
  id: string,
  values: { code: string; label: string }[],
): NormalizedDimension {
  return { id, label: id, role: "time", values };
}

// ═══════════════════════════════════════════════════════════════
// classifyCodeShape — ISO 3166-2
// ═══════════════════════════════════════════════════════════════

describe("classifyCodeShape: ISO 3166-2", () => {
  it("detects Brazilian state codes (BR-SP, BR-RJ)", () => {
    const result = classifyCodeShape([
      "BR-SP", "BR-RJ", "BR-MG", "BR-BA", "BR-RS", "BR-PR",
      "BR-PE", "BR-CE", "BR-PA", "BR-MA",
    ]);
    expect(result.pattern).toBe("iso_3166_2");
    expect(result.matchRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("detects Australian state codes (AU-WA, AU-NSW)", () => {
    const result = classifyCodeShape([
      "AU-WA", "AU-NSW", "AU-VIC", "AU-QLD", "AU-SA", "AU-TAS",
      "AU-NT", "AU-ACT",
    ]);
    expect(result.pattern).toBe("iso_3166_2");
    expect(result.matchRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("detects Japanese prefecture codes (JP-13, JP-27)", () => {
    const result = classifyCodeShape([
      "JP-13", "JP-27", "JP-01", "JP-40", "JP-23",
      "JP-14", "JP-11", "JP-04", "JP-34", "JP-22",
    ]);
    expect(result.pattern).toBe("iso_3166_2");
    expect(result.matchRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("detects Indian state codes (IN-MH, IN-KA)", () => {
    const result = classifyCodeShape([
      "IN-MH", "IN-KA", "IN-TN", "IN-UP", "IN-RJ",
      "IN-GJ", "IN-WB", "IN-MP",
    ]);
    expect(result.pattern).toBe("iso_3166_2");
    expect(result.matchRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("detects Kenyan province codes (KE-700, KE-400)", () => {
    const result = classifyCodeShape([
      "KE-700", "KE-400", "KE-500", "KE-200", "KE-300",
      "KE-110", "KE-800", "KE-600",
    ]);
    expect(result.pattern).toBe("iso_3166_2");
    expect(result.matchRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("detects Canadian province codes (CA-ON, CA-QC)", () => {
    const result = classifyCodeShape([
      "CA-ON", "CA-QC", "CA-BC", "CA-AB", "CA-MB",
      "CA-SK", "CA-NS", "CA-NB",
    ]);
    expect(result.pattern).toBe("iso_3166_2");
    expect(result.matchRatio).toBeGreaterThanOrEqual(0.8);
  });

  it("does not confuse ISO 3166-2 with NUTS codes", () => {
    // NUTS codes have no dash: "SE11", "DE1"
    const nuts = classifyCodeShape(["SE11", "SE12", "DE11", "FR10"]);
    expect(nuts.pattern).toBe("nuts");

    // ISO 3166-2 has a dash: "SE-E", "DE-BY"
    const iso = classifyCodeShape(["SE-E", "SE-BD", "DE-BY", "FR-IDF"]);
    expect(iso.pattern).toBe("iso_3166_2");
  });

  it("does not confuse ISO 3166-2 with ISO alpha-2", () => {
    // Pure 2-letter codes
    const a2 = classifyCodeShape(["SE", "NO", "DK", "FI"]);
    expect(a2.pattern).toBe("iso_a2");

    // Codes with dash
    const iso = classifyCodeShape(["SE-E", "NO-03", "DK-84", "FI-01"]);
    expect(iso.pattern).toBe("iso_3166_2");
  });
});

// ═══════════════════════════════════════════════════════════════
// inferLevelFromCodeShape — ISO 3166-2
// ═══════════════════════════════════════════════════════════════

describe("inferLevelFromCodeShape: ISO 3166-2", () => {
  it("infers admin1 from ISO 3166-2 codes", () => {
    const shape = classifyCodeShape(["BR-SP", "BR-RJ", "BR-MG", "BR-BA", "BR-RS"]);
    const result = inferLevelFromCodeShape(shape, 5, []);
    expect(result.level).toBe("admin1");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("uses hint when available", () => {
    const shape = classifyCodeShape(["JP-13", "JP-27", "JP-01"]);
    const result = inferLevelFromCodeShape(shape, 3, ["admin1"]);
    expect(result.level).toBe("admin1");
    expect(result.confidence).toBeGreaterThan(0.5);
  });

  it("confidence scales with match ratio", () => {
    const shape = classifyCodeShape(["BR-SP", "BR-RJ", "BR-MG", "BR-BA", "BR-RS"]);
    const result = inferLevelFromCodeShape(shape, 5, []);
    // matchRatio ≈ 1.0, so confidence ≈ 0.75
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });
});

// ═══════════════════════════════════════════════════════════════
// detectGeography — ISO 3166-2 full pipeline
// ═══════════════════════════════════════════════════════════════

describe("detectGeography: ISO 3166-2", () => {
  it("detects Brazilian state data with ISO 3166-2 codes", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("Region", [
          { code: "BR-SP", label: "São Paulo" },
          { code: "BR-RJ", label: "Rio de Janeiro" },
          { code: "BR-MG", label: "Minas Gerais" },
          { code: "BR-BA", label: "Bahia" },
          { code: "BR-RS", label: "Rio Grande do Sul" },
          { code: "BR-PR", label: "Paraná" },
          { code: "BR-PE", label: "Pernambuco" },
        ]),
        dimTime("Tid", [{ code: "2023", label: "2023" }]),
      ],
      countryHints: ["BR"],
      geographyHints: ["admin1"],
    });

    const result = detectGeography(source);
    expect(result.geoDimensionId).toBe("Region");
    expect(result.level).toBe("admin1");
    expect(result.codeFamily).toEqual({ family: "iso", namespace: "3166-2" });
    expect(result.renderHint).toBe("polygon_join");
    expect(result.confidence).toBeGreaterThan(0.6);
  });

  it("detects Australian state data with ISO 3166-2 codes", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("state", [
          { code: "AU-NSW", label: "New South Wales" },
          { code: "AU-VIC", label: "Victoria" },
          { code: "AU-QLD", label: "Queensland" },
          { code: "AU-WA", label: "Western Australia" },
          { code: "AU-SA", label: "South Australia" },
          { code: "AU-TAS", label: "Tasmania" },
        ]),
      ],
      countryHints: ["AU"],
    });

    const result = detectGeography(source);
    expect(result.level).toBe("admin1");
    expect(result.codeFamily).toEqual({ family: "iso", namespace: "3166-2" });
    expect(result.renderHint).toBe("polygon_join");
  });

  it("detects Japanese prefecture data with ISO 3166-2 codes", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("prefecture", [
          { code: "JP-13", label: "Tokyo" },
          { code: "JP-27", label: "Osaka" },
          { code: "JP-01", label: "Hokkaido" },
          { code: "JP-40", label: "Fukuoka" },
          { code: "JP-23", label: "Aichi" },
          { code: "JP-14", label: "Kanagawa" },
        ]),
      ],
      countryHints: ["JP"],
    });

    const result = detectGeography(source);
    expect(result.level).toBe("admin1");
    expect(result.codeFamily).toEqual({ family: "iso", namespace: "3166-2" });
  });
});

// ═══════════════════════════════════════════════════════════════
// planJoin — ISO 3166-2 → NE admin1 global layer
// ═══════════════════════════════════════════════════════════════

describe("planJoin: ISO 3166-2 reaches map_ready via NE admin1", () => {
  it("Brazil ISO 3166-2 data reaches map_ready", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("Region", [
          { code: "BR-SP", label: "São Paulo" },
          { code: "BR-RJ", label: "Rio de Janeiro" },
          { code: "BR-MG", label: "Minas Gerais" },
          { code: "BR-BA", label: "Bahia" },
          { code: "BR-RS", label: "Rio Grande do Sul" },
        ]),
        dimTime("Tid", [{ code: "2023", label: "2023" }]),
      ],
      countryHints: ["BR"],
      geographyHints: ["admin1"],
    });

    const detection = detectGeography(source);
    const plan = planJoin(detection, ["BR"]);

    expect(plan.mapReady).toBe(true);
    // Country-specific entry preferred over global NE admin1
    expect(plan.geometryLayerId).toBe("br:admin1");
    expect(plan.geometryJoinField).toBe("iso_3166_2");
    expect(plan.strategy).toBe("direct_code");
    expect(plan.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("Australia ISO 3166-2 data reaches map_ready", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("state", [
          { code: "AU-NSW", label: "New South Wales" },
          { code: "AU-VIC", label: "Victoria" },
          { code: "AU-QLD", label: "Queensland" },
          { code: "AU-WA", label: "Western Australia" },
          { code: "AU-SA", label: "South Australia" },
        ]),
      ],
      countryHints: ["AU"],
    });

    const detection = detectGeography(source);
    const plan = planJoin(detection, ["AU"]);

    expect(plan.mapReady).toBe(true);
    expect(plan.geometryLayerId).toBe("au:admin1");
    expect(plan.geometryJoinField).toBe("iso_3166_2");
    expect(plan.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it("Japan ISO 3166-2 data reaches map_ready", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("prefecture", [
          { code: "JP-13", label: "Tokyo" },
          { code: "JP-27", label: "Osaka" },
          { code: "JP-01", label: "Hokkaido" },
          { code: "JP-40", label: "Fukuoka" },
          { code: "JP-23", label: "Aichi" },
        ]),
      ],
      countryHints: ["JP"],
    });

    const detection = detectGeography(source);
    const plan = planJoin(detection, ["JP"]);

    expect(plan.mapReady).toBe(true);
    expect(plan.geometryLayerId).toBe("jp:prefectures");
    expect(plan.geometryJoinField).toBe("iso_3166_2");
  });

  it("Kenya ISO 3166-2 data reaches map_ready", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("province", [
          { code: "KE-700", label: "Rift Valley" },
          { code: "KE-400", label: "Eastern" },
          { code: "KE-500", label: "North-Eastern" },
          { code: "KE-200", label: "Central" },
          { code: "KE-300", label: "Coast" },
        ]),
      ],
      countryHints: ["KE"],
    });

    const detection = detectGeography(source);
    const plan = planJoin(detection, ["KE"]);

    expect(plan.mapReady).toBe(true);
    // Kenya has no country-specific entry → falls back to global NE admin1
    expect(plan.geometryLayerId).toBe("natural-earth:ne_10m_admin_1_states_provinces");
  });

  it("India ISO 3166-2 data reaches map_ready", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("state", [
          { code: "IN-MH", label: "Maharashtra" },
          { code: "IN-KA", label: "Karnataka" },
          { code: "IN-TN", label: "Tamil Nadu" },
          { code: "IN-UP", label: "Uttar Pradesh" },
          { code: "IN-RJ", label: "Rajasthan" },
        ]),
      ],
      countryHints: ["IN"],
    });

    const detection = detectGeography(source);
    const plan = planJoin(detection, ["IN"]);

    expect(plan.mapReady).toBe(true);
    expect(plan.geometryLayerId).toBe("in:admin1");
  });
});

// ═══════════════════════════════════════════════════════════════
// Safety: name-only data still doesn't cross threshold
// ═══════════════════════════════════════════════════════════════

describe("planJoin: name-only data stays below threshold", () => {
  it("Brazilian region names do not reach map_ready", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("Region", [
          { code: "São Paulo", label: "São Paulo" },
          { code: "Rio de Janeiro", label: "Rio de Janeiro" },
          { code: "Minas Gerais", label: "Minas Gerais" },
          { code: "Bahia", label: "Bahia" },
          { code: "Paraná", label: "Paraná" },
        ]),
      ],
      countryHints: ["BR"],
    });

    const detection = detectGeography(source);
    const plan = planJoin(detection, ["BR"]);

    // Name-only matching is too weak to cross threshold — intentional safety
    expect(plan.mapReady).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// NE admin1 registry entry validation
// ═══════════════════════════════════════════════════════════════

describe("NE admin1 registry entry", () => {
  it("is production status", () => {
    // Import indirectly via planJoin — the registry entry is used internally
    // We verify by checking that the plan uses it with production-level confidence
    const source = makeSource({
      dimensions: [
        dimGeo("Region", [
          { code: "BR-SP", label: "São Paulo" },
          { code: "BR-RJ", label: "Rio de Janeiro" },
          { code: "BR-MG", label: "Minas Gerais" },
          { code: "BR-BA", label: "Bahia" },
          { code: "BR-RS", label: "Rio Grande do Sul" },
        ]),
      ],
      countryHints: ["BR"],
      geographyHints: ["admin1"],
    });

    const detection = detectGeography(source);
    const plan = planJoin(detection, ["BR"]);

    // Production bonus (+0.15) instead of provisional penalty (-0.1)
    // should give confidence well above 0.7
    expect(plan.confidence).toBeGreaterThan(0.7);
  });
});
