/**
 * Tests for the geography plugin system.
 *
 * Covers:
 *   - Plugin registration / unregistration / precedence
 *   - Detection enrichment collection and application
 *   - Join enrichment collection and application
 *   - Fallback behavior when no plugins match
 *   - Multiple plugins coexisting safely
 *   - Plugin confidence hints affecting detection without forcing map_ready
 *   - Built-in plugins: SE-SCB, Eurostat NUTS, US FIPS, country admin
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  type GeographyPlugin,
  type CodeMatchResult,
  type PluginDetectionEnrichment,
  type PluginJoinEnrichment,
  registerPlugin,
  unregisterPlugin,
  getPlugins,
  clearPlugins,
  pluginCount,
  collectDetectionEnrichment,
  collectJoinEnrichment,
  applyDetectionEnrichment,
  applyJoinEnrichment,
  swedenScbPlugin,
  eurostatNutsPlugin,
  usFipsPlugin,
  countryAdminPlugin,
} from "../tools/geography-plugins";
import type { DetectionResult } from "../tools/geography-detector";
import type { JoinPlanResult } from "../tools/join-planner";
import { sourceOk } from "../tools/normalized-result";
import type {
  NormalizedSourceResult,
  NormalizedDimension,
  GeographyLevel,
  CodeFamily,
  SourceMetadata,
  QueryDiagnostics,
} from "../tools/normalized-result";

// ─── Helpers ─────────────────────────────────────────────────

const meta = (overrides?: Partial<SourceMetadata>): SourceMetadata => ({
  sourceId: "test",
  sourceName: "Test Source",
  fetchedAt: 1700000000000,
  ...overrides,
});

const diag = (): QueryDiagnostics => ({ originalPrompt: "test" });

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

function makeDetection(overrides?: Partial<DetectionResult>): DetectionResult {
  return {
    level: "unknown",
    codeFamily: { family: "name" },
    unitCount: 0,
    confidence: 0.3,
    reasons: ["base detection"],
    renderHint: "polygon_join",
    ...overrides,
  };
}

function makeJoinPlan(overrides?: Partial<JoinPlanResult>): JoinPlanResult {
  return {
    mapReady: false,
    strategy: "none",
    confidence: 0.3,
    reasons: ["base plan"],
    ...overrides,
  };
}

/** Minimal test plugin. */
function testPlugin(overrides?: Partial<GeographyPlugin>): GeographyPlugin {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    family: "custom",
    priority: 0,
    appliesTo: () => true,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Plugin Registration
// ═══════════════════════════════════════════════════════════════

describe("plugin registration", () => {
  beforeEach(() => clearPlugins());

  it("registers and retrieves a plugin", () => {
    const p = testPlugin({ id: "a" });
    registerPlugin(p);
    expect(pluginCount()).toBe(1);
    expect(getPlugins()[0].id).toBe("a");
  });

  it("rejects duplicate IDs", () => {
    registerPlugin(testPlugin({ id: "dup" }));
    expect(() => registerPlugin(testPlugin({ id: "dup" }))).toThrow(
      'Geography plugin "dup" is already registered',
    );
  });

  it("unregisters by ID", () => {
    registerPlugin(testPlugin({ id: "removable" }));
    expect(unregisterPlugin("removable")).toBe(true);
    expect(pluginCount()).toBe(0);
  });

  it("unregister returns false for unknown ID", () => {
    expect(unregisterPlugin("nonexistent")).toBe(false);
  });

  it("clearPlugins removes all", () => {
    registerPlugin(testPlugin({ id: "a" }));
    registerPlugin(testPlugin({ id: "b" }));
    clearPlugins();
    expect(pluginCount()).toBe(0);
  });

  it("getPlugins returns frozen copy (mutation-safe)", () => {
    registerPlugin(testPlugin({ id: "x" }));
    const list = getPlugins();
    expect(list.length).toBe(1);
    // Mutating the returned array should not affect the registry
    (list as GeographyPlugin[]).length = 0;
    expect(pluginCount()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// Plugin Precedence
// ═══════════════════════════════════════════════════════════════

describe("plugin precedence", () => {
  beforeEach(() => clearPlugins());

  it("sorts by priority descending", () => {
    registerPlugin(testPlugin({ id: "low", priority: 1 }));
    registerPlugin(testPlugin({ id: "high", priority: 10 }));
    registerPlugin(testPlugin({ id: "mid", priority: 5 }));

    const plugins = getPlugins();
    expect(plugins.map((p) => p.id)).toEqual(["high", "mid", "low"]);
  });

  it("higher-priority plugin's code match wins over lower", () => {
    const lowPlugin = testPlugin({
      id: "low-match",
      priority: 1,
      matchCodes: () => ({
        codeFamily: { family: "name" },
        level: "unknown" as GeographyLevel,
        confidence: 0.5,
        reason: "low plugin match",
      }),
    });

    const highPlugin = testPlugin({
      id: "high-match",
      priority: 10,
      matchCodes: () => ({
        codeFamily: { family: "national", namespace: "se-scb" },
        level: "admin1" as GeographyLevel,
        confidence: 0.8,
        reason: "high plugin match",
      }),
    });

    registerPlugin(lowPlugin);
    registerPlugin(highPlugin);

    const source = makeSource({ sourceId: "test" });
    const dim = dimGeo("Region", [
      { code: "01", label: "Stockholm" },
      { code: "03", label: "Uppsala" },
    ]);

    const enrichment = collectDetectionEnrichment(source, dim);
    expect(enrichment.codeMatch).not.toBeNull();
    expect(enrichment.codeMatch!.confidence).toBe(0.8);
    expect(enrichment.codeMatch!.reason).toContain("high plugin");
  });

  it("lower-confidence match from higher-priority plugin does NOT override higher-confidence from lower-priority", () => {
    const highPriLowConf = testPlugin({
      id: "high-pri-low-conf",
      priority: 10,
      matchCodes: () => ({
        codeFamily: { family: "name" },
        level: "unknown" as GeographyLevel,
        confidence: 0.3,
        reason: "high-priority but low confidence",
      }),
    });

    const lowPriHighConf = testPlugin({
      id: "low-pri-high-conf",
      priority: 1,
      matchCodes: () => ({
        codeFamily: { family: "national", namespace: "se-scb" },
        level: "admin1" as GeographyLevel,
        confidence: 0.9,
        reason: "low-priority but high confidence",
      }),
    });

    registerPlugin(highPriLowConf);
    registerPlugin(lowPriHighConf);

    const source = makeSource({});
    const dim = dimGeo("Region", [{ code: "01", label: "Stockholm" }]);

    const enrichment = collectDetectionEnrichment(source, dim);
    // Best match by confidence wins
    expect(enrichment.codeMatch!.confidence).toBe(0.9);
  });
});

// ═══════════════════════════════════════════════════════════════
// Detection Enrichment Collection
// ═══════════════════════════════════════════════════════════════

describe("detection enrichment collection", () => {
  beforeEach(() => clearPlugins());

  it("returns empty enrichment when no plugins registered", () => {
    const source = makeSource({});
    const enrichment = collectDetectionEnrichment(source);
    expect(enrichment.consultedPlugins).toHaveLength(0);
    expect(enrichment.codeMatch).toBeNull();
    expect(enrichment.knownDimensions).toHaveLength(0);
    expect(enrichment.confidenceHints).toHaveLength(0);
  });

  it("skips plugins that do not apply", () => {
    registerPlugin(
      testPlugin({
        id: "non-applicable",
        appliesTo: () => false,
        matchCodes: () => ({
          codeFamily: { family: "name" },
          level: "country" as GeographyLevel,
          confidence: 0.9,
          reason: "should not appear",
        }),
      }),
    );

    const source = makeSource({});
    const dim = dimGeo("X", [{ code: "SE", label: "Sweden" }]);
    const enrichment = collectDetectionEnrichment(source, dim);
    expect(enrichment.consultedPlugins).toHaveLength(0);
    expect(enrichment.codeMatch).toBeNull();
  });

  it("collects known dimensions from applicable plugins", () => {
    registerPlugin(
      testPlugin({
        id: "dim-provider",
        knownDimensions: () => [
          {
            dimensionId: "Region",
            level: "admin1" as GeographyLevel,
            codeFamily: { family: "national", namespace: "se-scb" },
            confidence: 0.8,
          },
        ],
      }),
    );

    const source = makeSource({});
    const enrichment = collectDetectionEnrichment(source);
    expect(enrichment.knownDimensions).toHaveLength(1);
    expect(enrichment.knownDimensions[0].pluginId).toBe("dim-provider");
    expect(enrichment.knownDimensions[0].level).toBe("admin1");
  });

  it("collects detection confidence hints", () => {
    registerPlugin(
      testPlugin({
        id: "hint-provider",
        confidenceHints: () => [
          {
            target: "detection" as const,
            delta: 0.1,
            condition: { level: "admin1" as GeographyLevel },
            reason: "admin1 boost",
          },
          {
            target: "join" as const, // should NOT be collected for detection
            delta: 0.2,
            condition: {},
            reason: "join boost",
          },
        ],
      }),
    );

    const source = makeSource({});
    const enrichment = collectDetectionEnrichment(source);
    // Only detection hints collected
    expect(enrichment.confidenceHints).toHaveLength(1);
    expect(enrichment.confidenceHints[0].reason).toBe("admin1 boost");
  });
});

// ═══════════════════════════════════════════════════════════════
// Detection Enrichment Application
// ═══════════════════════════════════════════════════════════════

describe("detection enrichment application", () => {
  beforeEach(() => clearPlugins());

  it("returns detection unchanged when no plugins consulted", () => {
    const detection = makeDetection({ confidence: 0.5, level: "country" });
    const enrichment: PluginDetectionEnrichment = {
      codeMatch: null,
      knownDimensions: [],
      confidenceHints: [],
      consultedPlugins: [],
    };
    const source = makeSource({});
    const result = applyDetectionEnrichment(detection, enrichment, source);
    expect(result).toBe(detection); // same reference — no copy
  });

  it("applies code match that upgrades unknown level", () => {
    const detection = makeDetection({
      level: "unknown",
      confidence: 0.2,
      geoDimensionId: "Region",
    });
    const enrichment: PluginDetectionEnrichment = {
      codeMatch: {
        codeFamily: { family: "national", namespace: "se-scb" },
        level: "admin1",
        confidence: 0.75,
        reason: "SCB county codes",
      },
      knownDimensions: [],
      confidenceHints: [],
      consultedPlugins: ["test"],
    };
    const source = makeSource({});
    const result = applyDetectionEnrichment(detection, enrichment, source);

    expect(result.level).toBe("admin1");
    expect(result.codeFamily.namespace).toBe("se-scb");
    expect(result.confidence).toBeGreaterThan(detection.confidence);
    expect(result.reasons.some((r) => r.includes("plugin code match"))).toBe(true);
  });

  it("does NOT downgrade known level with weaker code match", () => {
    const detection = makeDetection({
      level: "country",
      confidence: 0.7,
      geoDimensionId: "Geo",
    });
    const enrichment: PluginDetectionEnrichment = {
      codeMatch: {
        codeFamily: { family: "name" },
        level: "unknown",
        confidence: 0.2, // below threshold
        reason: "weak match",
      },
      knownDimensions: [],
      confidenceHints: [],
      consultedPlugins: ["test"],
    };
    const source = makeSource({});
    const result = applyDetectionEnrichment(detection, enrichment, source);

    // Level should stay as "country", not downgraded
    expect(result.level).toBe("country");
    expect(result.confidence).toBe(0.7); // no change from weak match
  });

  it("applies known dimension boost", () => {
    const detection = makeDetection({
      level: "unknown",
      confidence: 0.3,
      geoDimensionId: "Region",
    });
    const enrichment: PluginDetectionEnrichment = {
      codeMatch: null,
      knownDimensions: [
        {
          dimensionId: "Region",
          level: "admin1",
          codeFamily: { family: "national", namespace: "se-scb" },
          confidence: 0.8,
          pluginId: "pxweb-se-scb",
        },
      ],
      confidenceHints: [],
      consultedPlugins: ["pxweb-se-scb"],
    };
    const source = makeSource({});
    const result = applyDetectionEnrichment(detection, enrichment, source);

    expect(result.level).toBe("admin1");
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.reasons.some((r) => r.includes('plugin known dimension "Region"'))).toBe(true);
  });

  it("applies known dimension with regex pattern", () => {
    const detection = makeDetection({
      level: "unknown",
      confidence: 0.3,
      geoDimensionId: "GEO",
    });
    const enrichment: PluginDetectionEnrichment = {
      codeMatch: null,
      knownDimensions: [
        {
          dimensionId: /^(geo|GEO)$/,
          level: "nuts2",
          codeFamily: { family: "eurostat", namespace: "nuts" },
          confidence: 0.75,
          pluginId: "eurostat-nuts",
        },
      ],
      confidenceHints: [],
      consultedPlugins: ["eurostat-nuts"],
    };
    const source = makeSource({});
    const result = applyDetectionEnrichment(detection, enrichment, source);
    expect(result.level).toBe("nuts2");
  });

  it("applies confidence hints conditionally", () => {
    const scbDim = dimGeo("Region", [
      { code: "01", label: "Stockholm" },
      { code: "03", label: "Uppsala" },
      { code: "04", label: "Södermanland" },
      // Need at least 15 to trigger the SCB hint with minUnits: 15
      ...Array.from({ length: 17 }, (_, i) => ({
        code: String(i + 5).padStart(2, "0"),
        label: `County ${i + 5}`,
      })),
    ]);

    const source = makeSource({
      sourceId: "se-scb",
      dimensions: [scbDim],
    });

    const detection = makeDetection({
      level: "admin1",
      confidence: 0.5,
      geoDimensionId: "Region",
    });

    const enrichment: PluginDetectionEnrichment = {
      codeMatch: null,
      knownDimensions: [],
      confidenceHints: [
        {
          target: "detection",
          delta: 0.1,
          condition: {
            sourceId: "se-scb",
            level: "admin1",
            minUnits: 15,
          },
          reason: "SCB county data — high confidence",
          pluginId: "pxweb-se-scb",
        },
      ],
      consultedPlugins: ["pxweb-se-scb"],
    };

    const result = applyDetectionEnrichment(detection, enrichment, source);
    expect(result.confidence).toBe(0.6); // 0.5 + 0.1
    expect(result.reasons.some((r) => r.includes("SCB county data"))).toBe(true);
  });

  it("does NOT apply confidence hint when condition fails", () => {
    const source = makeSource({
      sourceId: "no-ssb", // wrong source
      dimensions: [
        dimGeo("Region", [
          { code: "01", label: "Oslo" },
          { code: "03", label: "Viken" },
        ]),
      ],
    });

    const detection = makeDetection({ level: "admin1", confidence: 0.5 });

    const enrichment: PluginDetectionEnrichment = {
      codeMatch: null,
      knownDimensions: [],
      confidenceHints: [
        {
          target: "detection",
          delta: 0.1,
          condition: { sourceId: "se-scb" }, // won't match
          reason: "SCB boost",
          pluginId: "pxweb-se-scb",
        },
      ],
      consultedPlugins: ["pxweb-se-scb"],
    };

    const result = applyDetectionEnrichment(detection, enrichment, source);
    expect(result.confidence).toBe(0.5); // unchanged
  });

  it("confidence hints never force map_ready — they only adjust score", () => {
    const source = makeSource({
      sourceId: "se-scb",
      dimensions: [
        dimGeo("Region", Array.from({ length: 21 }, (_, i) => ({
          code: String(i + 1).padStart(2, "0"),
          label: `County ${i + 1}`,
        }))),
      ],
    });

    const detection = makeDetection({
      level: "admin1",
      confidence: 0.15, // very low
      renderHint: "polygon_join",
    });

    // Big positive hint but capped
    const enrichment: PluginDetectionEnrichment = {
      codeMatch: null,
      knownDimensions: [],
      confidenceHints: [
        {
          target: "detection",
          delta: 0.2,
          condition: { sourceId: "se-scb", level: "admin1" },
          reason: "SCB boost",
          pluginId: "pxweb-se-scb",
        },
      ],
      consultedPlugins: ["pxweb-se-scb"],
    };

    const result = applyDetectionEnrichment(detection, enrichment, source);
    // Confidence increased but the detection result doesn't decide mapReady.
    // That's the planner's job. Here we just verify the score changed.
    expect(result.confidence).toBe(0.35);
    // The DetectionResult has no "mapReady" field — confirm it's absent
    expect("mapReady" in result).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════
// Join Enrichment
// ═══════════════════════════════════════════════════════════════

describe("join enrichment", () => {
  beforeEach(() => clearPlugins());

  it("collects join-key families from applicable plugins", () => {
    registerPlugin(
      testPlugin({
        id: "jk-provider",
        joinKeyFamilies: () => [
          {
            sourceFamily: { family: "national", namespace: "se-scb" },
            targetFamily: { family: "national", namespace: "se-scb" },
            strategy: "direct_code" as const,
            confidence: 0.85,
            description: "SCB → SCB",
          },
        ],
      }),
    );

    const source = makeSource({});
    const enrichment = collectJoinEnrichment(source);
    expect(enrichment.joinKeyFamilies).toHaveLength(1);
    expect(enrichment.joinKeyFamilies[0].pluginId).toBe("jk-provider");
  });

  it("collects alias normalizers", () => {
    registerPlugin(
      testPlugin({
        id: "alias-provider",
        aliasNormalizers: () => [
          {
            name: "test-normalizer",
            normalizer: (code: string) => code.toLowerCase(),
          },
        ],
      }),
    );

    const source = makeSource({});
    const enrichment = collectJoinEnrichment(source);
    expect(enrichment.aliasNormalizers).toHaveLength(1);
    expect(enrichment.aliasNormalizers[0].normalizer("ABC")).toBe("abc");
  });

  it("collects only join-targeted confidence hints", () => {
    registerPlugin(
      testPlugin({
        id: "mixed-hints",
        confidenceHints: () => [
          {
            target: "join" as const,
            delta: 0.1,
            condition: {},
            reason: "join boost",
          },
          {
            target: "detection" as const, // should be excluded
            delta: 0.2,
            condition: {},
            reason: "detection boost",
          },
        ],
      }),
    );

    const source = makeSource({});
    const enrichment = collectJoinEnrichment(source);
    expect(enrichment.confidenceHints).toHaveLength(1);
    expect(enrichment.confidenceHints[0].reason).toBe("join boost");
  });

  it("applies join-key family boost", () => {
    const plan = makeJoinPlan({ confidence: 0.45, strategy: "direct_code" });
    const enrichment: PluginJoinEnrichment = {
      joinKeyFamilies: [
        {
          sourceFamily: { family: "national", namespace: "se-scb" },
          targetFamily: { family: "national", namespace: "se-scb" },
          strategy: "direct_code",
          confidence: 0.85,
          description: "SCB → SCB",
          pluginId: "pxweb-se-scb",
        },
      ],
      aliasNormalizers: [],
      confidenceHints: [],
      consultedPlugins: ["pxweb-se-scb"],
    };

    const source = makeSource({ sourceId: "se-scb" });
    const result = applyJoinEnrichment(
      plan,
      enrichment,
      source,
      "admin1",
      { family: "national", namespace: "se-scb" },
    );

    expect(result.confidence).toBeGreaterThan(0.45);
    expect(result.reasons.some((r) => r.includes("join-key family"))).toBe(true);
  });

  it("re-applies map-ready threshold after enrichment", () => {
    // Start just below threshold
    const plan = makeJoinPlan({ confidence: 0.48, mapReady: false });
    const enrichment: PluginJoinEnrichment = {
      joinKeyFamilies: [],
      aliasNormalizers: [],
      confidenceHints: [
        {
          target: "join",
          delta: 0.05,
          condition: {},
          reason: "small boost",
          pluginId: "test",
        },
      ],
      consultedPlugins: ["test"],
    };

    const source = makeSource({});
    const result = applyJoinEnrichment(plan, enrichment, source, "admin1", { family: "name" });

    // 0.48 + 0.05 = 0.53 → now mapReady
    expect(result.confidence).toBe(0.53);
    expect(result.mapReady).toBe(true);
  });

  it("returns plan unchanged when no plugins consulted", () => {
    const plan = makeJoinPlan({ confidence: 0.4 });
    const enrichment: PluginJoinEnrichment = {
      joinKeyFamilies: [],
      aliasNormalizers: [],
      confidenceHints: [],
      consultedPlugins: [],
    };
    const source = makeSource({});
    const result = applyJoinEnrichment(plan, enrichment, source, "admin1", { family: "name" });
    expect(result).toBe(plan); // same reference
  });
});

// ═══════════════════════════════════════════════════════════════
// Fallback: no plugins
// ═══════════════════════════════════════════════════════════════

describe("fallback to generic detector when no plugin exists", () => {
  beforeEach(() => clearPlugins());

  it("detection enrichment has no effect when registry is empty", () => {
    const source = makeSource({
      dimensions: [
        dimGeo("Geo", [
          { code: "SWE", label: "Sweden" },
          { code: "NOR", label: "Norway" },
        ]),
      ],
    });

    const dim = dimGeo("Geo", [
      { code: "SWE", label: "Sweden" },
      { code: "NOR", label: "Norway" },
    ]);

    const enrichment = collectDetectionEnrichment(source, dim);
    expect(enrichment.consultedPlugins).toHaveLength(0);

    const detection = makeDetection({ level: "country", confidence: 0.6 });
    const result = applyDetectionEnrichment(detection, enrichment, source);
    expect(result).toBe(detection); // unchanged
  });

  it("join enrichment has no effect when registry is empty", () => {
    const source = makeSource({});
    const enrichment = collectJoinEnrichment(source);
    expect(enrichment.consultedPlugins).toHaveLength(0);

    const plan = makeJoinPlan({ confidence: 0.5, mapReady: true });
    const result = applyJoinEnrichment(plan, enrichment, source, "country", { family: "iso" });
    expect(result).toBe(plan); // unchanged
  });
});

// ═══════════════════════════════════════════════════════════════
// Multiple plugins coexisting
// ═══════════════════════════════════════════════════════════════

describe("multiple plugins coexisting", () => {
  beforeEach(() => clearPlugins());

  it("each plugin only applies when relevant", () => {
    registerPlugin(swedenScbPlugin);
    registerPlugin(eurostatNutsPlugin);
    registerPlugin(usFipsPlugin);
    registerPlugin(countryAdminPlugin);

    // Swedish source: only SCB + countryAdmin apply
    const seSource = makeSource({
      sourceId: "se-scb",
      countryHints: ["SE"],
      dimensions: [
        dimGeo("Region", [
          { code: "01", label: "Stockholm" },
          { code: "03", label: "Uppsala" },
        ]),
      ],
    });

    const seEnrichment = collectDetectionEnrichment(
      seSource,
      seSource.dimensions[0],
    );
    // SCB and countryAdmin should apply (countryAdmin is universal)
    expect(seEnrichment.consultedPlugins).toContain("pxweb-se-scb");
    expect(seEnrichment.consultedPlugins).toContain("country-admin");
    // US FIPS should NOT apply (no US hints)
    expect(seEnrichment.consultedPlugins).not.toContain("us-fips");
  });

  it("US source engages FIPS + countryAdmin but not SCB", () => {
    registerPlugin(swedenScbPlugin);
    registerPlugin(usFipsPlugin);
    registerPlugin(countryAdminPlugin);

    const usSource = makeSource({
      sourceId: "us-census",
      countryHints: ["US"],
      dimensions: [
        dimGeo("State", Array.from({ length: 50 }, (_, i) => ({
          code: String(i + 1).padStart(2, "0"),
          label: `State ${i + 1}`,
        }))),
      ],
    });

    const enrichment = collectDetectionEnrichment(
      usSource,
      usSource.dimensions[0],
    );
    expect(enrichment.consultedPlugins).toContain("us-fips");
    expect(enrichment.consultedPlugins).toContain("country-admin");
    expect(enrichment.consultedPlugins).not.toContain("pxweb-se-scb");
  });

  it("combined enrichment from multiple plugins does not double-count", () => {
    registerPlugin(swedenScbPlugin);
    registerPlugin(countryAdminPlugin);

    const source = makeSource({
      sourceId: "se-scb",
      countryHints: ["SE"],
      dimensions: [
        dimGeo("Region", Array.from({ length: 21 }, (_, i) => ({
          code: String(i + 1).padStart(2, "0"),
          label: `County ${i + 1}`,
        }))),
      ],
    });

    const detection = makeDetection({
      level: "admin1",
      confidence: 0.4,
      geoDimensionId: "Region",
    });

    const enrichment = collectDetectionEnrichment(source, source.dimensions[0]);
    const result = applyDetectionEnrichment(detection, enrichment, source);

    // Confidence should increase but stay reasonable (not > 1.0)
    expect(result.confidence).toBeGreaterThan(0.4);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });
});

// ═══════════════════════════════════════════════════════════════
// Built-in plugins: Sweden SCB
// ═══════════════════════════════════════════════════════════════

describe("swedenScbPlugin", () => {
  it("applies to SE country hint", () => {
    const source = makeSource({ countryHints: ["SE"] });
    expect(swedenScbPlugin.appliesTo(source)).toBe(true);
  });

  it("applies to se-scb source ID", () => {
    const source = makeSource({ sourceId: "se-scb" });
    expect(swedenScbPlugin.appliesTo(source)).toBe(true);
  });

  it("does not apply to unrelated source", () => {
    const source = makeSource({ sourceId: "no-ssb", countryHints: ["NO"] });
    expect(swedenScbPlugin.appliesTo(source)).toBe(false);
  });

  it("matches SCB county codes (2-digit)", () => {
    const codes = Array.from({ length: 21 }, (_, i) =>
      String(i + 1).padStart(2, "0"),
    );
    const dim = dimGeo("Region", codes.map((c) => ({ code: c, label: c })));
    const match = swedenScbPlugin.matchCodes!(codes, dim);
    expect(match).not.toBeNull();
    expect(match!.level).toBe("admin1");
    expect(match!.codeFamily.namespace).toBe("se-scb");
  });

  it("matches SCB municipality codes (4-digit)", () => {
    const codes = Array.from({ length: 50 }, (_, i) =>
      String(114 + i * 10).padStart(4, "0"),
    );
    const dim = dimGeo("Kommun", codes.map((c) => ({ code: c, label: c })));
    const match = swedenScbPlugin.matchCodes!(codes, dim);
    expect(match).not.toBeNull();
    expect(match!.level).toBe("municipality");
  });

  it("does NOT match non-SCB codes", () => {
    const codes = ["US", "UK", "FR", "DE"];
    const dim = dimGeo("Country", codes.map((c) => ({ code: c, label: c })));
    const match = swedenScbPlugin.matchCodes!(codes, dim);
    expect(match).toBeNull();
  });

  it("provides alias normalizers for SCB codes", () => {
    const normalizers = swedenScbPlugin.aliasNormalizers!();
    expect(normalizers).toHaveLength(2);

    // SCB county code → ISO 3166-2 mapping
    const isoNorm = normalizers[0].normalizer;
    expect(isoNorm("01")).toBe("SE-AB");
    expect(isoNorm("14")).toBe("SE-O");
    expect(isoNorm("25")).toBe("SE-BD");
    expect(isoNorm("99")).toBeNull();

    // Leading-zero padding
    const padNorm = normalizers[1].normalizer;
    expect(padNorm("1")).toBe("01");
    expect(padNorm("14")).toBe("14");
    expect(padNorm("114")).toBe("0114");
    expect(padNorm("SWE")).toBeNull();
  });

  it("provides known dimensions", () => {
    const dims = swedenScbPlugin.knownDimensions!();
    expect(dims.length).toBeGreaterThanOrEqual(2);
    expect(dims.find((d) => d.dimensionId === "Region")).toBeDefined();
    expect(dims.find((d) => d.dimensionId === "Kommun")).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════
// Built-in plugins: Eurostat NUTS
// ═══════════════════════════════════════════════════════════════

describe("eurostatNutsPlugin", () => {
  it("applies when geography hints include nuts*", () => {
    const source = makeSource({ geographyHints: ["nuts2"] });
    expect(eurostatNutsPlugin.appliesTo(source)).toBe(true);
  });

  it("matches NUTS2 codes", () => {
    const codes = ["DE11", "DE12", "DE13", "DE14", "DE21", "DE22", "FR10", "FR21"];
    const dim = dimGeo("geo", codes.map((c) => ({ code: c, label: c })));
    const match = eurostatNutsPlugin.matchCodes!(codes, dim);
    expect(match).not.toBeNull();
    expect(match!.level).toBe("nuts2");
    expect(match!.codeFamily.namespace).toBe("nuts");
  });

  it("matches NUTS1 codes", () => {
    const codes = ["DE1", "DE2", "DE3", "DE4", "FR1", "FR2"];
    const dim = dimGeo("geo", codes.map((c) => ({ code: c, label: c })));
    const match = eurostatNutsPlugin.matchCodes!(codes, dim);
    expect(match).not.toBeNull();
    expect(match!.level).toBe("nuts1");
  });

  it("matches NUTS0 codes (2-letter)", () => {
    const codes = ["DE", "FR", "IT", "ES", "PL", "NL"];
    const dim = dimGeo("geo", codes.map((c) => ({ code: c, label: c })));
    const match = eurostatNutsPlugin.matchCodes!(codes, dim);
    expect(match).not.toBeNull();
    expect(match!.level).toBe("nuts0");
  });

  it("provides known dimension with regex", () => {
    const dims = eurostatNutsPlugin.knownDimensions!();
    expect(dims).toHaveLength(1);
    expect(dims[0].dimensionId).toBeInstanceOf(RegExp);
    expect((dims[0].dimensionId as RegExp).test("geo")).toBe(true);
    expect((dims[0].dimensionId as RegExp).test("GEO")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════
// Built-in plugins: US FIPS
// ═══════════════════════════════════════════════════════════════

describe("usFipsPlugin", () => {
  it("applies to US country hint", () => {
    const source = makeSource({ countryHints: ["US"] });
    expect(usFipsPlugin.appliesTo(source)).toBe(true);
  });

  it("matches FIPS state codes", () => {
    const codes = Array.from({ length: 50 }, (_, i) =>
      String(i + 1).padStart(2, "0"),
    );
    const dim = dimGeo("State", codes.map((c) => ({ code: c, label: c })));
    const match = usFipsPlugin.matchCodes!(codes, dim);
    expect(match).not.toBeNull();
    expect(match!.level).toBe("admin1");
    expect(match!.codeFamily.family).toBe("fips");
  });

  it("matches FIPS county codes (5-digit)", () => {
    const codes = Array.from({ length: 50 }, (_, i) =>
      String(6000 + i).padStart(5, "0"),
    );
    const dim = dimGeo("County", codes.map((c) => ({ code: c, label: c })));
    const match = usFipsPlugin.matchCodes!(codes, dim);
    expect(match).not.toBeNull();
    expect(match!.level).toBe("admin2");
  });

  it("provides FIPS alias normalizer", () => {
    const normalizers = usFipsPlugin.aliasNormalizers!();
    expect(normalizers).toHaveLength(1);
    const norm = normalizers[0].normalizer;
    expect(norm("6")).toBe("06");
    expect(norm("6001")).toBe("06001");
    expect(norm("SWE")).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Built-in plugins: Country Admin
// ═══════════════════════════════════════════════════════════════

describe("countryAdminPlugin", () => {
  it("applies universally", () => {
    const source = makeSource({});
    expect(countryAdminPlugin.appliesTo(source)).toBe(true);
  });

  it("matches ISO alpha-2 codes", () => {
    const codes = ["SE", "NO", "DK", "FI", "IS"];
    const dim = dimGeo("Country", codes.map((c) => ({ code: c, label: c })));
    const match = countryAdminPlugin.matchCodes!(codes, dim);
    expect(match).not.toBeNull();
    expect(match!.level).toBe("country");
    expect(match!.codeFamily.namespace).toBe("alpha2");
  });

  it("matches ISO alpha-3 codes", () => {
    const codes = ["SWE", "NOR", "DNK", "FIN", "ISL"];
    const dim = dimGeo("Country", codes.map((c) => ({ code: c, label: c })));
    const match = countryAdminPlugin.matchCodes!(codes, dim);
    expect(match).not.toBeNull();
    expect(match!.level).toBe("country");
    expect(match!.codeFamily.namespace).toBe("alpha3");
  });

  it("does NOT match mixed/unknown codes", () => {
    const codes = ["abc123", "xyz789", "foo"];
    const dim = dimGeo("X", codes.map((c) => ({ code: c, label: c })));
    const match = countryAdminPlugin.matchCodes!(codes, dim);
    expect(match).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════
// Plugin confidence hints affecting detection without forcing map_ready
// ═══════════════════════════════════════════════════════════════

describe("confidence hints do not force map_ready", () => {
  beforeEach(() => clearPlugins());

  it("positive hint increases confidence but DetectionResult has no mapReady field", () => {
    registerPlugin(
      testPlugin({
        id: "big-booster",
        confidenceHints: () => [
          {
            target: "detection" as const,
            delta: 0.3,
            condition: {},
            reason: "aggressive boost",
          },
        ],
      }),
    );

    const source = makeSource({});
    const detection = makeDetection({ confidence: 0.2 });
    const enrichment = collectDetectionEnrichment(source);
    const result = applyDetectionEnrichment(detection, enrichment, source);

    expect(result.confidence).toBe(0.5);
    // DetectionResult DOES NOT have mapReady
    expect("mapReady" in result).toBe(false);
  });

  it("negative hint decreases join confidence below threshold → mapReady false", () => {
    const plan = makeJoinPlan({ confidence: 0.55, mapReady: true });
    const enrichment: PluginJoinEnrichment = {
      joinKeyFamilies: [],
      aliasNormalizers: [],
      confidenceHints: [
        {
          target: "join",
          delta: -0.1,
          condition: {},
          reason: "weak source penalty",
          pluginId: "test",
        },
      ],
      consultedPlugins: ["test"],
    };

    const source = makeSource({});
    const result = applyJoinEnrichment(plan, enrichment, source, "admin1", { family: "name" });
    expect(result.confidence).toBe(0.45);
    expect(result.mapReady).toBe(false); // dropped below 0.5
  });
});
