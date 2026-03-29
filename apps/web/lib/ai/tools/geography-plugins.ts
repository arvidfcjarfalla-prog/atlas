/**
 * Pluggable geography intelligence.
 *
 * Plugins contribute domain-specific knowledge that enriches the generic
 * geography detector and join planner — without hardcoding outcomes.
 *
 * Plugin families:
 *   - PxWeb country plugins (SE-SCB, NO-SSB, FI-stat, etc.)
 *   - Eurostat / NUTS plugin
 *   - US FIPS-style plugin
 *   - Country admin-code plugin
 *
 * Core rules:
 *   1. Plugins enrich detection and planning — they never bypass the
 *      generic detector or join executor.
 *   2. Plugin results are confidence-scored and explainable.
 *   3. Multiple plugins can coexist; their contributions are merged by
 *      the plugin runner with precedence rules.
 *   4. When no plugin matches, the generic detector works unchanged.
 */

import type {
  NormalizedSourceResult,
  NormalizedDimension,
  GeographyLevel,
  CodeFamily,
} from "./normalized-result";
import type { DetectionResult } from "./geography-detector";
import type { JoinPlanResult, JoinStrategy } from "./join-planner";

// ═══════════════════════════════════════════════════════════════
// Plugin contributions
// ═══════════════════════════════════════════════════════════════

/**
 * A code matcher identifies whether a set of codes belongs to a
 * known code system, returning a code family + confidence.
 */
export interface CodeMatchResult {
  /** Recognized code family. */
  codeFamily: CodeFamily;
  /** Inferred geography level. */
  level: GeographyLevel;
  /** 0.0–1.0 confidence in this match. */
  confidence: number;
  /** Human-readable explanation. */
  reason: string;
}

/**
 * A known geography dimension descriptor.
 * Tells the detector "when you see a dimension with this id/label
 * from this source, treat it as geography at this level."
 */
export interface KnownGeoDimension {
  /** Dimension ID pattern (exact or regex). */
  dimensionId: string | RegExp;
  /** Expected geography level. */
  level: GeographyLevel;
  /** Code family the values use. */
  codeFamily: CodeFamily;
  /** How confident the plugin is about this mapping. */
  confidence: number;
}

/**
 * A join-key family describes how codes from a specific system
 * map to geometry properties.
 */
export interface JoinKeyFamily {
  /** Source code family (what the data has). */
  sourceFamily: CodeFamily;
  /** Target code family (what the geometry property uses). */
  targetFamily: CodeFamily;
  /** Recommended join strategy. */
  strategy: JoinStrategy;
  /** Confidence that this mapping is correct. */
  confidence: number;
  /** Human-readable description. */
  description: string;
}

/**
 * An alias normalizer transforms source codes into a canonical form
 * that the geometry can match on.
 *
 * Example: SCB uses "01" for Stockholm län, geometry uses "01".
 * Example: FIPS uses "06" for California, geometry uses "06".
 *
 * Returns null when the code doesn't belong to this normalizer's domain.
 */
export type AliasNormalizer = (code: string) => string | null;

/**
 * A confidence hint adjusts the detection/planning confidence
 * based on plugin-specific knowledge.
 */
export interface ConfidenceHint {
  /** What this hint adjusts. */
  target: "detection" | "join";
  /** Additive adjustment (-1.0 to +1.0). Clamped to [0, 1] after. */
  delta: number;
  /** Condition: only apply when this predicate is true. */
  condition: ConfidenceCondition;
  /** Human-readable reason for this adjustment. */
  reason: string;
}

/** Conditions under which a confidence hint applies. */
export interface ConfidenceCondition {
  /** Match source ID (exact). */
  sourceId?: string;
  /** Match geography level. */
  level?: GeographyLevel;
  /** Match code family. */
  codeFamily?: CodeFamily;
  /** Minimum unit count to trigger. */
  minUnits?: number;
  /** Maximum unit count to trigger. */
  maxUnits?: number;
}

// ═══════════════════════════════════════════════════════════════
// Plugin interface
// ═══════════════════════════════════════════════════════════════

/**
 * A geography intelligence plugin.
 *
 * Plugins are stateless — they receive data and return contributions.
 * They do NOT call the detector, planner, or join executor.
 */
export interface GeographyPlugin {
  /** Unique stable identifier. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Plugin family for grouping. */
  family: PluginFamily;
  /** Priority (higher = checked first). Default: 0. */
  priority: number;

  /**
   * Does this plugin apply to the given source?
   * Quick check based on source metadata — should be fast.
   */
  appliesTo(source: NormalizedSourceResult): boolean;

  /**
   * Try to match codes from a dimension to a known code system.
   * Return null if this plugin can't identify the codes.
   */
  matchCodes?(codes: string[], dimension: NormalizedDimension): CodeMatchResult | null;

  /**
   * Return known geography dimensions for this source.
   * The detector uses these as strong signals during dimension scoring.
   */
  knownDimensions?(): KnownGeoDimension[];

  /**
   * Return join-key families this plugin knows about.
   * The planner uses these to improve join strategy selection.
   */
  joinKeyFamilies?(): JoinKeyFamily[];

  /**
   * Return alias normalizers for code transformation.
   * Applied during join execution to improve match rates.
   */
  aliasNormalizers?(): Array<{ name: string; normalizer: AliasNormalizer }>;

  /**
   * Return confidence hints that adjust detection/planning scores.
   * Applied after the generic detector/planner runs.
   */
  confidenceHints?(): ConfidenceHint[];

  /**
   * Return known table IDs for specific topics.
   *
   * When free-text search fails to surface the right table, plugins can
   * contribute hardcoded table IDs for well-known metrics. The pipeline
   * will fetch these directly before falling back to full-text search.
   *
   * Keys are normalized topic keywords (lowercase English), values are
   * arrays of table IDs in priority order.
   *
   * Example: { "population": ["11342", "05803"] }
   */
  knownTables?(): Record<string, string[]>;
}

/** Plugin family categories. */
export type PluginFamily =
  | "pxweb_country"     // PxWeb API country plugins (SE, NO, FI, DK, IS)
  | "eurostat"          // Eurostat / NUTS
  | "fips"              // US FIPS-style codes
  | "admin_code"        // Country admin code systems
  | "custom";           // Other

// ═══════════════════════════════════════════════════════════════
// Plugin registry
// ═══════════════════════════════════════════════════════════════

/** Internal storage for registered plugins. */
const pluginRegistry: GeographyPlugin[] = [];

/**
 * Register a geography plugin.
 * Plugins are sorted by priority (descending) on registration.
 * Duplicate IDs are rejected.
 */
export function registerPlugin(plugin: GeographyPlugin): void {
  if (pluginRegistry.some((p) => p.id === plugin.id)) {
    throw new Error(`Geography plugin "${plugin.id}" is already registered`);
  }
  pluginRegistry.push(plugin);
  pluginRegistry.sort((a, b) => b.priority - a.priority);
}

/**
 * Remove a registered plugin by ID.
 * Returns true if the plugin was found and removed.
 */
export function unregisterPlugin(id: string): boolean {
  const idx = pluginRegistry.findIndex((p) => p.id === id);
  if (idx === -1) return false;
  pluginRegistry.splice(idx, 1);
  return true;
}

/**
 * Get all registered plugins, sorted by priority (highest first).
 * Returns a frozen copy.
 */
export function getPlugins(): readonly GeographyPlugin[] {
  return [...pluginRegistry];
}

/**
 * Remove all registered plugins. For testing only.
 */
export function clearPlugins(): void {
  pluginRegistry.length = 0;
}

/**
 * Get the number of registered plugins.
 */
export function pluginCount(): number {
  return pluginRegistry.length;
}

// ═══════════════════════════════════════════════════════════════
// Plugin runner: known table lookup
// ═══════════════════════════════════════════════════════════════

/**
 * Collect known table IDs from all plugins applicable to a source,
 * for the given topic keywords (normalized lowercase English).
 *
 * Takes a minimal source descriptor so it can be called early in the
 * pipeline before a full NormalizedSourceResult is available.
 *
 * Returns an array of table IDs in plugin priority order, de-duplicated.
 * The caller should try these first before falling back to full-text search.
 */
export function getKnownTablesForSource(
  source: { sourceId: string; countryCode?: string },
  topicKeywords: string[],
): string[] {
  // Build a minimal NormalizedSourceResult for appliesTo checks
  const minimalSource = {
    sourceMetadata: { sourceId: source.sourceId, apiType: "pxweb-v2" as const },
    countryHints: source.countryCode ? [source.countryCode] : [],
    geographyHints: [],
    dimensions: [],
    rows: [],
    candidateMetricFields: [],
    adapterStatus: "ok" as const,
    confidence: 0,
    diagnostics: { steps: [] },
    candidates: [],
  } as unknown as NormalizedSourceResult;

  const tableIds: string[] = [];
  const seen = new Set<string>();

  for (const plugin of pluginRegistry) {
    if (!plugin.appliesTo(minimalSource)) continue;
    if (!plugin.knownTables) continue;

    const map = plugin.knownTables();
    for (const kw of topicKeywords) {
      const ids = map[kw.toLowerCase()];
      if (ids) {
        for (const id of ids) {
          if (!seen.has(id)) {
            seen.add(id);
            tableIds.push(id);
          }
        }
      }
    }
  }

  return tableIds;
}

// ═══════════════════════════════════════════════════════════════
// Plugin runner: detection enrichment
// ═══════════════════════════════════════════════════════════════

/**
 * Collected plugin contributions for detection enrichment.
 */
export interface PluginDetectionEnrichment {
  /** Best code match result from any plugin (highest confidence). */
  codeMatch: CodeMatchResult | null;
  /** All known dimension matches from applicable plugins. */
  knownDimensions: Array<KnownGeoDimension & { pluginId: string }>;
  /** Confidence adjustments to apply after detection. */
  confidenceHints: Array<ConfidenceHint & { pluginId: string }>;
  /** Which plugins were consulted. */
  consultedPlugins: string[];
}

/**
 * Run all applicable plugins to collect detection enrichment.
 *
 * Does NOT modify the detection result — returns enrichment data
 * that the detector can use.
 *
 * @param source - The normalized source result
 * @param geoDimension - The candidate geo dimension (if known)
 */
export function collectDetectionEnrichment(
  source: NormalizedSourceResult,
  geoDimension?: NormalizedDimension,
): PluginDetectionEnrichment {
  const result: PluginDetectionEnrichment = {
    codeMatch: null,
    knownDimensions: [],
    confidenceHints: [],
    consultedPlugins: [],
  };

  let bestCodeConfidence = -1;

  for (const plugin of pluginRegistry) {
    if (!plugin.appliesTo(source)) continue;
    result.consultedPlugins.push(plugin.id);

    // Collect code matches
    if (plugin.matchCodes && geoDimension) {
      const codes = geoDimension.values.map((v) => v.code);
      const match = plugin.matchCodes(codes, geoDimension);
      if (match && match.confidence > bestCodeConfidence) {
        result.codeMatch = match;
        bestCodeConfidence = match.confidence;
      }
    }

    // Collect known dimensions
    if (plugin.knownDimensions) {
      for (const kd of plugin.knownDimensions()) {
        result.knownDimensions.push({ ...kd, pluginId: plugin.id });
      }
    }

    // Collect detection confidence hints
    if (plugin.confidenceHints) {
      for (const hint of plugin.confidenceHints()) {
        if (hint.target === "detection") {
          result.confidenceHints.push({ ...hint, pluginId: plugin.id });
        }
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Plugin runner: join enrichment
// ═══════════════════════════════════════════════════════════════

/**
 * Collected plugin contributions for join planning enrichment.
 */
export interface PluginJoinEnrichment {
  /** Join-key families from applicable plugins. */
  joinKeyFamilies: Array<JoinKeyFamily & { pluginId: string }>;
  /** Alias normalizers from applicable plugins. */
  aliasNormalizers: Array<{ name: string; normalizer: AliasNormalizer; pluginId: string }>;
  /** Confidence adjustments for the join planner. */
  confidenceHints: Array<ConfidenceHint & { pluginId: string }>;
  /** Which plugins were consulted. */
  consultedPlugins: string[];
}

/**
 * Run all applicable plugins to collect join enrichment.
 *
 * Does NOT modify the join plan — returns enrichment data
 * that the planner can use.
 */
export function collectJoinEnrichment(
  source: NormalizedSourceResult,
): PluginJoinEnrichment {
  const result: PluginJoinEnrichment = {
    joinKeyFamilies: [],
    aliasNormalizers: [],
    confidenceHints: [],
    consultedPlugins: [],
  };

  for (const plugin of pluginRegistry) {
    if (!plugin.appliesTo(source)) continue;
    result.consultedPlugins.push(plugin.id);

    // Collect join-key families
    if (plugin.joinKeyFamilies) {
      for (const jkf of plugin.joinKeyFamilies()) {
        result.joinKeyFamilies.push({ ...jkf, pluginId: plugin.id });
      }
    }

    // Collect alias normalizers
    if (plugin.aliasNormalizers) {
      for (const an of plugin.aliasNormalizers()) {
        result.aliasNormalizers.push({ ...an, pluginId: plugin.id });
      }
    }


    // Collect join confidence hints
    if (plugin.confidenceHints) {
      for (const hint of plugin.confidenceHints()) {
        if (hint.target === "join") {
          result.confidenceHints.push({ ...hint, pluginId: plugin.id });
        }
      }
    }
  }

  // Auto-inject a code→label normalizer from geo dimension values.
  // When the geo dimension has labels (e.g. "0180" → "Stockholm"), this
  // enables alias_crosswalk joins to name-keyed geometry without fuzzy matching.
  // Injected once per source. Generic — works for any structured data source
  // where geographic codes have human-readable labels (PxWeb, Eurostat, etc.).
  if (result.consultedPlugins.length > 0) {
    const geoDim = source.dimensions.find((d) => d.role === "geo");
    if (geoDim && geoDim.values.length > 0 && geoDim.values[0].label) {
      const codeToLabel: Record<string, string> = {};
      for (const v of geoDim.values) {
        if (v.label) codeToLabel[v.code] = v.label;
      }
      result.aliasNormalizers.push({
        name: "source-code-to-label",
        pluginId: "auto",
        normalizer: (code: string) => codeToLabel[code] ?? null,
      });
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Enrichment application
// ═══════════════════════════════════════════════════════════════

/**
 * Apply plugin detection enrichment to a detection result.
 *
 * Merges plugin signals into the existing detection — never replaces.
 * Returns a new DetectionResult with adjusted confidence and reasons.
 */
export function applyDetectionEnrichment(
  detection: DetectionResult,
  enrichment: PluginDetectionEnrichment,
  source: NormalizedSourceResult,
): DetectionResult {
  if (enrichment.consultedPlugins.length === 0) {
    return detection; // No plugins applied — return unchanged
  }

  const reasons = [...detection.reasons];
  let confidence = detection.confidence;
  let level = detection.level;
  let codeFamily = detection.codeFamily;

  reasons.push(`plugins consulted: [${enrichment.consultedPlugins.join(", ")}]`);

  // ── Apply code match if it's stronger than generic detection ──
  if (enrichment.codeMatch && enrichment.codeMatch.confidence > 0.3) {
    const cm = enrichment.codeMatch;
    // Only upgrade, never downgrade
    if (cm.confidence > confidence || detection.level === "unknown") {
      // Blend: plugin provides a strong signal but doesn't force
      const pluginWeight = Math.min(cm.confidence, 0.7);
      const blended = confidence * (1 - pluginWeight) + cm.confidence * pluginWeight;
      confidence = blended;
      level = cm.level;
      codeFamily = cm.codeFamily;
      reasons.push(`plugin code match: ${cm.reason} (blended confidence: ${r2(blended)})`);
    }
  }

  // ── Apply known dimension matches ────────────────────────────
  const geoDimId = detection.geoDimensionId;
  if (geoDimId) {
    for (const kd of enrichment.knownDimensions) {
      const matches = typeof kd.dimensionId === "string"
        ? kd.dimensionId === geoDimId
        : kd.dimensionId.test(geoDimId);
      if (matches) {
        // Known dimension is a strong signal — boost confidence
        const boost = kd.confidence * 0.2; // max +0.2 from known dim
        confidence = Math.min(1.0, confidence + boost);
        if (level === "unknown") {
          level = kd.level;
        }
        codeFamily = kd.codeFamily;
        reasons.push(
          `plugin known dimension "${geoDimId}" → ${kd.level} ` +
          `(+${r2(boost)} from ${kd.pluginId})`,
        );
      }
    }
  }

  // ── Apply confidence hints ──────────────────────────────────
  for (const hint of enrichment.confidenceHints) {
    if (matchesCondition(hint.condition, source, level, codeFamily)) {
      confidence = clamp01(confidence + hint.delta);
      reasons.push(`plugin hint: ${hint.reason} (${hint.delta >= 0 ? "+" : ""}${r2(hint.delta)} from ${hint.pluginId})`);
    }
  }

  return {
    ...detection,
    level,
    codeFamily,
    confidence: clamp01(confidence),
    reasons,
  };
}

/**
 * Apply plugin join enrichment to a join plan result.
 *
 * Adjusts confidence and reasons. Never changes mapReady directly —
 * the threshold check is reapplied after adjustment.
 */
export function applyJoinEnrichment(
  plan: JoinPlanResult,
  enrichment: PluginJoinEnrichment,
  source: NormalizedSourceResult,
  detectionLevel: GeographyLevel,
  detectionFamily: CodeFamily,
): JoinPlanResult {
  if (enrichment.consultedPlugins.length === 0) {
    return plan; // No plugins applied
  }

  const reasons = [...plan.reasons];
  let confidence = plan.confidence;

  reasons.push(`join plugins consulted: [${enrichment.consultedPlugins.join(", ")}]`);

  // ── Apply join-key family boosts ────────────────────────────
  for (const jkf of enrichment.joinKeyFamilies) {
    if (
      familiesMatch(jkf.sourceFamily, detectionFamily) &&
      jkf.confidence > 0.5
    ) {
      const boost = jkf.confidence * 0.1; // max +0.1 from join key family
      confidence = Math.min(1.0, confidence + boost);
      reasons.push(
        `plugin join-key family: ${jkf.description} ` +
        `(+${r2(boost)} from ${jkf.pluginId})`,
      );
    }
  }

  // ── Apply join confidence hints ─────────────────────────────
  for (const hint of enrichment.confidenceHints) {
    if (matchesCondition(hint.condition, source, detectionLevel, detectionFamily)) {
      confidence = clamp01(confidence + hint.delta);
      reasons.push(`plugin join hint: ${hint.reason} (${hint.delta >= 0 ? "+" : ""}${r2(hint.delta)} from ${hint.pluginId})`);
    }
  }

  confidence = clamp01(confidence);

  return {
    ...plan,
    confidence,
    mapReady: confidence >= 0.5, // re-apply threshold
    reasons,
  };
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Check if a confidence condition matches the current state. */
function matchesCondition(
  cond: ConfidenceCondition,
  source: NormalizedSourceResult,
  level: GeographyLevel,
  codeFamily: CodeFamily,
): boolean {
  if (cond.sourceId && source.sourceMetadata.sourceId !== cond.sourceId) return false;
  if (cond.level && cond.level !== level) return false;
  if (cond.codeFamily) {
    if (cond.codeFamily.family !== codeFamily.family) return false;
    if (cond.codeFamily.namespace && cond.codeFamily.namespace !== codeFamily.namespace) return false;
  }
  // Unit count checks — use dimension values if available
  const geoDim = source.dimensions.find((d) => d.role === "geo");
  const unitCount = geoDim ? new Set(geoDim.values.map((v) => v.code)).size : 0;
  if (cond.minUnits !== undefined && unitCount < cond.minUnits) return false;
  if (cond.maxUnits !== undefined && unitCount > cond.maxUnits) return false;
  return true;
}

/** Check if two code families are compatible. */
function familiesMatch(a: CodeFamily, b: CodeFamily): boolean {
  if (a.family !== b.family) return false;
  if (a.namespace && b.namespace) return a.namespace === b.namespace;
  return true;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
}

function r2(v: number): string {
  return (Math.round(v * 100) / 100).toFixed(2);
}

// ═══════════════════════════════════════════════════════════════
// Built-in plugins
// ═══════════════════════════════════════════════════════════════

/**
 * Swedish SCB PxWeb plugin.
 *
 * Recognizes SCB-style county codes (2-digit "01"–"25") and
 * municipality codes (4-digit "0114"–"2584").
 */
export const swedenScbPlugin: GeographyPlugin = {
  id: "pxweb-se-scb",
  name: "Sweden SCB (PxWeb)",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) {
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return sid.includes("se-scb") || sid.includes("scb") ||
      source.countryHints.includes("SE");
  },

  matchCodes(codes, _dimension) {
    // SCB county codes: 2-digit, "01"–"25"
    const countyMatch = codes.filter((c) => /^\d{2}$/.test(c) && Number(c) >= 1 && Number(c) <= 25);
    if (countyMatch.length / codes.length >= 0.8 && codes.length >= 3) {
      return {
        codeFamily: { family: "national", namespace: "se-scb" },
        level: "admin1",
        confidence: 0.75,
        reason: `${countyMatch.length}/${codes.length} match SCB county code pattern (2-digit 01–25)`,
      };
    }

    // SCB municipality codes: 4-digit, "0114"–"2584"
    const munMatch = codes.filter((c) => /^\d{4}$/.test(c));
    if (munMatch.length / codes.length >= 0.8 && codes.length >= 10) {
      return {
        codeFamily: { family: "national", namespace: "se-scb" },
        level: "municipality",
        confidence: 0.7,
        reason: `${munMatch.length}/${codes.length} match SCB municipality code pattern (4-digit)`,
      };
    }

    return null;
  },

  knownDimensions() {
    return [
      {
        dimensionId: "Region",
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "se-scb" },
        confidence: 0.8,
      },
      {
        dimensionId: "Kommun",
        level: "municipality" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "se-scb" },
        confidence: 0.8,
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        sourceFamily: { family: "national" as const, namespace: "se-scb" },
        targetFamily: { family: "iso" as const, namespace: "3166-2" },
        strategy: "alias_crosswalk",
        confidence: 0.9,
        description: "SCB county codes → ISO 3166-2 via mapping",
      },
      {
        sourceFamily: { family: "national" as const, namespace: "se-scb" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk",
        confidence: 0.75,
        description: "SCB municipality codes → geometry names via label crosswalk",
      },
    ];
  },

  aliasNormalizers() {
    // SCB 2-digit county code → ISO 3166-2 mapping
    const SCB_TO_ISO: Record<string, string> = {
      "01": "SE-AB", "03": "SE-C", "04": "SE-D", "05": "SE-E",
      "06": "SE-F", "07": "SE-G", "08": "SE-H", "09": "SE-I",
      "10": "SE-K", "12": "SE-M", "13": "SE-N", "14": "SE-O",
      "17": "SE-S", "18": "SE-T", "19": "SE-U", "20": "SE-W",
      "21": "SE-X", "22": "SE-Y", "23": "SE-Z", "24": "SE-AC",
      "25": "SE-BD",
    };
    return [
      {
        name: "scb-county-to-iso",
        normalizer: (code: string) => {
          // Map SCB 2-digit county code → ISO 3166-2
          const padded = code.padStart(2, "0");
          return SCB_TO_ISO[padded] ?? null;
        },
      },
      {
        name: "scb-leading-zero",
        normalizer: (code: string) => {
          // Ensure county codes are zero-padded to 2 digits
          if (/^\d{1,2}$/.test(code)) return code.padStart(2, "0");
          // Ensure municipality codes are zero-padded to 4 digits
          if (/^\d{3,4}$/.test(code)) return code.padStart(4, "0");
          return null;
        },
      },
    ];
  },

  knownTables() {
    // SCB table IDs for common topics — verified to have 4-digit municipality codes.
    // SCB's full-text search returns district-level tables (6-digit codes) or
    // irrelevant matches before these canonical tables.
    return {
      // Population — TAB694 is the municipal summary (3 vars: region, contents, year).
      // TAB638 has age×sex×marital breakdowns with no totals — unusable for simple queries.
      befolkning: ["TAB694"],
      population: ["TAB694"],
      folkmängd: ["TAB694"],
      folkm: ["TAB694"],
      invånare: ["TAB694"],
      // Income — TAB3556 (5 vars) is simpler and already map_ready in cache.
      inkomst: ["TAB3556", "TAB3909"],
      income: ["TAB3556", "TAB3909"],
      förvärvsinkomst: ["TAB3556"],
      medelinkomst: ["TAB3556"],
      // Education
      utbildning: ["TAB5956"],
      utbildningsnivå: ["TAB5956"],
      education: ["TAB5956"],
      // Employment
      sysselsättning: ["TAB4083"],
      employment: ["TAB4083"],
      arbetslöshet: ["TAB4083"],
      unemployment: ["TAB4083"],
      // Age
      ålder: ["TAB637", "TAB638"],
      medelålder: ["TAB637"],
      age: ["TAB637"],
    };
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          sourceId: "se-scb",
          level: "admin1" as GeographyLevel,
          minUnits: 15,
        },
        reason: "SCB county data with ≥15 counties — high confidence",
      },
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          sourceId: "se-scb",
          level: "municipality" as GeographyLevel,
          minUnits: 100,
        },
        reason: "SCB municipality data with ≥100 municipalities — high confidence",
      },
    ];
  },
};

/**
 * Norway SSB plugin.
 *
 * Recognizes SSB county codes (2-digit, 03–56) and maps them to
 * the GeoJSON county names (2020-era 11-county structure).
 * SSB labels contain bilingual suffixes ("Nordland - Nordlánnda") —
 * the normalizer strips the suffix and maps to clean GeoJSON names.
 */
export const norwaySsbPlugin: GeographyPlugin = {
  id: "pxweb-no-ssb",
  name: "Norway SSB (PxWeb)",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) {
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return sid.includes("no-ssb") || sid.includes("ssb") ||
      source.countryHints.includes("NO");
  },

  matchCodes(codes, _dimension) {
    // SSB county codes: 2-digit, "03"–"56" (current + recent historical)
    const countyMatch = codes.filter((c) => /^\d{2}$/.test(c) && Number(c) >= 3 && Number(c) <= 56);
    if (countyMatch.length / codes.length >= 0.6 && codes.length >= 3) {
      return {
        codeFamily: { family: "national", namespace: "no-ssb" },
        level: "admin1",
        confidence: 0.75,
        reason: `${countyMatch.length}/${codes.length} match SSB county code pattern (2-digit 03–56)`,
      };
    }

    // SSB municipality codes: 4-digit, "0101"–"5630"
    // SSB tables often include county aggregates (2-digit) alongside municipality
    // codes in the same dimension. Accept if there are ≥ 50 4-digit codes,
    // regardless of what fraction of the total they are.
    const munMatch = codes.filter((c) => /^\d{4}$/.test(c));
    const munRatioOk = munMatch.length / codes.length >= 0.8;
    const munCountOk = munMatch.length >= 50;
    if ((munRatioOk || munCountOk) && codes.length >= 10) {
      return {
        codeFamily: { family: "national", namespace: "no-ssb" },
        level: "municipality",
        confidence: munRatioOk ? 0.7 : 0.6,
        reason: `${munMatch.length}/${codes.length} match SSB municipality code pattern (4-digit)`,
      };
    }

    return null;
  },

  knownDimensions() {
    return [
      {
        dimensionId: "Region",
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "no-ssb" },
        confidence: 0.8,
      },
      {
        // SSB municipality dimension is also called "Region" when scoped to (K)-level tables
        dimensionId: /^Region$/,
        level: "municipality" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "no-ssb" },
        confidence: 0.5, // lower — actual level is determined by matchCodes
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        // Municipality level: SSB 4-digit codes match kommunenummer directly
        sourceFamily: { family: "national" as const, namespace: "no-ssb" },
        targetFamily: { family: "national" as const, namespace: "no-ssb" },
        strategy: "direct_code" as JoinStrategy,
        confidence: 0.9,
        description: "SSB municipality codes → GeoJSON kommunenummer (direct code match)",
      },
      {
        // County level: SSB 2-digit codes → GeoJSON county names via label crosswalk
        sourceFamily: { family: "national" as const, namespace: "no-ssb" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.85,
        description: "SSB county codes → GeoJSON county names via label crosswalk",
      },
    ];
  },

  aliasNormalizers() {
    // SSB county codes → GeoJSON names.
    //
    // GeoJSON uses the 2020-era 11-county structure (Viken, Vestfold og Telemark,
    // Troms og Finnmark as merged counties). Norway re-split these in 2024, so
    // SSB data from 2024+ uses the new 15-county codes (31-33, 39-40, 55-56).
    //
    // The 2024 → 2020 mapping comes from SSB KLASS correspondence table 1282
    // ("Fylkesinndeling 2024 - Fylkesinndeling 2022"):
    //   31 Østfold, 32 Akershus, 33 Buskerud → 30 Viken
    //   39 Vestfold, 40 Telemark → 38 Vestfold og Telemark
    //   55 Troms, 56 Finnmark → 54 Troms og Finnmark
    const SSB_TO_NAME: Record<string, string> = {
      // 2020-era codes (11 counties, still valid for 2020-2023 data)
      "03": "Oslo",
      "11": "Rogaland",
      "15": "Møre og Romsdal",
      "18": "Nordland",
      "30": "Viken",
      "34": "Innlandet",
      "38": "Vestfold og Telemark",
      "42": "Agder",
      "46": "Vestland",
      "50": "Trøndelag",
      "54": "Troms og Finnmark",
      // 2024 re-split codes → mapped to their 2020 merged GeoJSON polygon
      "31": "Viken",               // Østfold re-established
      "32": "Viken",               // Akershus re-established
      "33": "Viken",               // Buskerud re-established
      "39": "Vestfold og Telemark", // Vestfold re-established
      "40": "Vestfold og Telemark", // Telemark re-established
      "55": "Troms og Finnmark",   // Troms re-established
      "56": "Troms og Finnmark",   // Finnmark re-established
    };
    return [
      {
        name: "ssb-county-to-name",
        normalizer: (code: string) => {
          const padded = code.padStart(2, "0");
          return SSB_TO_NAME[padded] ?? null;
        },
      },
      {
        // Strip bilingual label suffixes: "Nordland - Nordlánnda" → "Nordland"
        // Also strips date ranges: "Viken (2020-2023)" → "Viken"
        name: "ssb-label-cleanup",
        normalizer: (label: string) => {
          const cleaned = label
            .replace(/\s*[-–]\s*[^\s].*$/, "")   // strip " - Nordlánnda" suffix
            .replace(/\s*\(\d{4}.*\)$/, "")       // strip "(2020-2023)" suffix
            .trim();
          return cleaned !== label ? cleaned : null;
        },
      },
      {
        // SSB municipality codes are 4-digit but may arrive without leading zero.
        // Normalize to always 4-digit string to match kommunenummer in GeoJSON.
        name: "ssb-municipality-leading-zero",
        normalizer: (code: string) => {
          if (/^\d{3}$/.test(code)) return code.padStart(4, "0");
          if (/^\d{4}$/.test(code)) return code; // already 4 digits
          return null;
        },
      },
    ];
  },

  knownTables() {
    // SSB table IDs for common topics.
    // SSB's full-text search doesn't reliably surface these for natural-language
    // queries — e.g. "population" returns student/income tables before 11342.
    return {
      // Population by county
      population: ["11342", "05803"],
      // Employment / labor force
      employment: ["12550", "05111"],
      // Income
      income: ["12558", "05655"],
      // Housing
      housing: ["06265"],
      // Education
      education: ["13362", "09429"],
      // Immigration
      immigration: ["10211"],
    };
  },
};

/**
 * Denmark DST plugin.
 *
 * Recognizes DST municipality codes (3-digit 101–860) and region
 * codes (4-digit 1081–1085). DST metadata has explicit `map` flags
 * on geographic variables, so dimension classification is handled
 * upstream — this plugin provides code matching and join key families.
 */
export const denmarkDstPlugin: GeographyPlugin = {
  id: "dst-dk",
  name: "Denmark DST",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) {
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return sid.includes("dk-dst") || sid.includes("dst") ||
      source.countryHints.includes("DK");
  },

  matchCodes(codes, _dimension) {
    // DST municipality codes: 3-digit "101"–"860"
    const munMatch = codes.filter((c) => /^\d{3}$/.test(c) && Number(c) >= 101 && Number(c) <= 860);
    if (munMatch.length / codes.length >= 0.7 && codes.length >= 10) {
      return {
        codeFamily: { family: "national", namespace: "dk-dst" },
        level: "municipality",
        confidence: 0.7,
        reason: `${munMatch.length}/${codes.length} match DST municipality code pattern (3-digit 101–860)`,
      };
    }

    // DST region codes: 4-digit "1081"–"1085"
    const regMatch = codes.filter((c) => /^10[89]\d$/.test(c));
    if (regMatch.length >= 4) {
      return {
        codeFamily: { family: "national", namespace: "dk-dst" },
        level: "admin1",
        confidence: 0.7,
        reason: `${regMatch.length}/${codes.length} match DST region code pattern (4-digit 108x–109x)`,
      };
    }

    return null;
  },

  knownDimensions() {
    return [
      {
        dimensionId: /^OMRÅDE$/i,
        level: "municipality" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "dk-dst" },
        confidence: 0.8,
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        sourceFamily: { family: "national" as const, namespace: "dk-dst" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.75,
        description: "DST municipality codes → geometry names via label crosswalk",
      },
    ];
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          level: "municipality" as GeographyLevel,
          minUnits: 50,
        },
        reason: "DST municipality data with ≥50 municipalities — good coverage",
      },
    ];
  },
};

/**
 * Finland Statistics Finland (stat.fi) PxWeb plugin.
 *
 * Statistics Finland (Tilastokeskus) publishes data via PxWeb at
 * pxdata.stat.fi. Geographic dimensions use two prefixed code formats:
 *   - MK prefix: maakunta (region/admin1), codes MK01–MK21 (19 regions)
 *   - KU prefix: kunta (municipality), codes KU003–KU992 (304 municipalities)
 *
 * GeoJSON admin1 file has iso_3166_2 (FI-XX) and name properties.
 * GeoJSON municipalities file has name-only (no numeric codes).
 *
 * Join strategy:
 *   - Admin1: alias_crosswalk via name — MK codes are mapped to English region
 *     names, then matched against GeoJSON name property.
 *   - Municipality: alias_crosswalk via name — dimension label used directly
 *     (KU prefix is stripped; name comes from PxWeb label text).
 */
export const finlandPlugin: GeographyPlugin = {
  id: "fi-stat",
  name: "Finland Statistics Finland / Tilastokeskus (PxWeb)",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) {
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return sid.includes("fi-stat") || sid.includes("tilastokeskus") ||
      sid.includes("stat.fi") || source.countryHints.includes("FI");
  },

  matchCodes(codes, _dimension) {
    // Stat.fi maakunta (region) codes: "MK" prefix + 2-digit number 01–21
    const mkMatch = codes.filter((c) => /^MK(0[1-9]|1[0-9]|2[01])$/.test(c));
    if (mkMatch.length / codes.length >= 0.7 && codes.length >= 3) {
      return {
        codeFamily: { family: "national", namespace: "fi-stat" },
        level: "admin1",
        confidence: 0.85,
        reason: `${mkMatch.length}/${codes.length} match Stat.fi maakunta code pattern (MK01–MK21)`,
      };
    }

    // Stat.fi kunta (municipality) codes: "KU" prefix + 3-digit number
    // ~304 municipalities, codes are non-contiguous (KU005–KU992)
    const kuMatch = codes.filter((c) => /^KU\d{3}$/.test(c));
    if (kuMatch.length / codes.length >= 0.7 && codes.length >= 10) {
      return {
        codeFamily: { family: "national", namespace: "fi-stat" },
        level: "municipality",
        confidence: 0.85,
        reason: `${kuMatch.length}/${codes.length} match Stat.fi kunta code pattern (KU + 3 digits)`,
      };
    }

    return null;
  },

  knownDimensions() {
    return [
      {
        // English API dimension name for geographic area (regions use MK codes → admin1)
        // "Area" appears in both regional and municipal tables; matchCodes determines
        // the actual level from MK vs KU prefix — keep confidence low so it doesn't
        // override matchCodes.
        dimensionId: /^Area$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "fi-stat" },
        confidence: 0.4,
      },
      {
        // Finnish dimension name: "Alue" — used in regional (MK) tables.
        // Municipal tables use "Kunta", not "Alue". Default to admin1 here.
        dimensionId: /^Alue$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "fi-stat" },
        confidence: 0.5,
      },
      {
        // Finnish dimension name: "Maakunta" — explicitly regional (MK codes).
        dimensionId: /^Maakunta$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "fi-stat" },
        confidence: 0.7,
      },
      {
        // Finnish dimension name: "Kunta" — municipality (KU codes → municipality level)
        dimensionId: /^Kunta$/i,
        level: "municipality" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "fi-stat" },
        confidence: 0.7,
      },
      {
        // Swedish dimension name: "Område" — can be region or municipality;
        // matchCodes will override level from MK/KU prefix.
        dimensionId: /^Område$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "fi-stat" },
        confidence: 0.4,
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        // Admin1: MK codes → GeoJSON name property via alias crosswalk normalizer
        sourceFamily: { family: "national" as const, namespace: "fi-stat" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.85,
        description: "Stat.fi MK region codes → GeoJSON region names via alias crosswalk",
      },
      {
        // Municipality: KU label → GeoJSON name property via label crosswalk
        sourceFamily: { family: "national" as const, namespace: "fi-stat" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.8,
        description: "Stat.fi KU municipality codes → GeoJSON municipality names via alias crosswalk",
      },
    ];
  },

  aliasNormalizers() {
    // MK (maakunta) codes → English GeoJSON name property values.
    // GeoJSON uses Natural Earth English names which differ from PxWeb English labels
    // (e.g. PxWeb "Southwest Finland" vs GeoJSON "Finland Proper").
    const MK_TO_NAME: Record<string, string> = {
      MK01: "Uusimaa",
      MK02: "Finland Proper",       // PxWeb: "Southwest Finland"
      MK04: "Satakunta",
      MK05: "Kanta-Häme",
      MK06: "Pirkanmaa",
      MK07: "Päijät-Häme",
      MK08: "Kymenlaakso",
      MK09: "South Karelia",
      MK10: "Southern Savonia",     // PxWeb: "South Savo"
      MK11: "Northern Savonia",     // PxWeb: "North Savo"
      MK12: "North Karelia",
      MK13: "Central Finland",
      MK14: "South Ostrobothnia",
      MK15: "Ostrobothnia",
      MK16: "Central Ostrobothnia",
      MK17: "North Ostrobothnia",
      MK18: "Kainuu",
      MK19: "Lapland",
      MK21: "Åland",
    };
    return [
      {
        // Map MK region codes to GeoJSON English names
        name: "fi-stat-mk-to-name",
        normalizer: (code: string) => MK_TO_NAME[code] ?? null,
      },
      {
        // Label cleanup: strip bilingual suffixes and parenthetical date ranges.
        // Finnish PxWeb labels can have Finnish/Swedish appended qualifiers.
        // e.g. "Helsinki - Helsingfors" → "Helsinki"
        //      "Uusimaa (2021-)" → "Uusimaa"
        name: "fi-stat-label-cleanup",
        normalizer: (label: string) => {
          const cleaned = label
            .replace(/\s*[-–]\s*\S.*$/, "")   // strip " - Helsingfors" suffix
            .replace(/\s*\(\d{4}.*\)$/, "")    // strip "(2021-)" suffix
            .trim();
          return cleaned !== label ? cleaned : null;
        },
      },
    ];
  },

  knownTables() {
    // Stat.fi database IDs for common topics.
    // Base URL: pxdata.stat.fi/PXWeb/api/v1/en/StatFin/{db}/
    return {
      // Population structure by area (key figures, age, sex)
      population: ["statfin_vaerak_pxt_11ra.px", "statfin_vaerak_pxt_11re.px"],
      // Employment statistics by area and activity
      employment: ["statfin_tyokay_pxt_115b.px", "statfin_tyokay_pxt_115x.px"],
      // Educational structure of population
      education: ["vkour"],
      // Migration (internal + international)
      immigration: ["muutl"],
    };
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          level: "admin1" as GeographyLevel,
          minUnits: 15,
          maxUnits: 21,
        },
        reason: "Stat.fi region data with 15–21 units — matches Finland's 19 maakunnat",
      },
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          level: "municipality" as GeographyLevel,
          minUnits: 100,
        },
        reason: "Stat.fi municipality data with ≥100 municipalities — high confidence",
      },
    ];
  },
};

/**
 * Eurostat NUTS plugin.
 *
 * Recognizes NUTS codes (2 letter prefix + 1–3 alphanumeric suffix)
 * and provides level inference from code length.
 */
export const eurostatNutsPlugin: GeographyPlugin = {
  id: "eurostat-nuts",
  name: "Eurostat NUTS",
  family: "eurostat",
  priority: 5,

  appliesTo(source) {
    // Applies when hints suggest EU data or NUTS geography
    if (source.geographyHints.some((h) => h.startsWith("nuts"))) return true;
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return sid.includes("eurostat") || sid.includes("nuts");
  },

  matchCodes(codes, _dimension) {
    const nutsRe = /^[A-Z]{2}[A-Z0-9]{0,3}$/;
    const matches = codes.filter((c) => nutsRe.test(c));
    if (matches.length / codes.length < 0.7 || codes.length < 3) return null;

    // Determine NUTS level from code length distribution
    const lengths = matches.map((c) => c.length);
    const avgLen = lengths.reduce((a, b) => a + b, 0) / lengths.length;

    let level: GeographyLevel;
    if (avgLen <= 2.2) level = "nuts0";
    else if (avgLen <= 3.2) level = "nuts1";
    else if (avgLen <= 4.2) level = "nuts2";
    else level = "nuts3";

    return {
      codeFamily: { family: "eurostat", namespace: "nuts" },
      level,
      confidence: 0.7,
      reason: `${matches.length}/${codes.length} match NUTS pattern, avg length ${avgLen.toFixed(1)} → ${level}`,
    };
  },

  knownDimensions() {
    return [
      {
        dimensionId: /^(geo|GEO)$/,
        level: "nuts2" as GeographyLevel, // default, refined by matchCodes
        codeFamily: { family: "eurostat" as const, namespace: "nuts" },
        confidence: 0.75,
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        sourceFamily: { family: "eurostat" as const, namespace: "nuts" },
        targetFamily: { family: "eurostat" as const, namespace: "nuts" },
        strategy: "direct_code" as JoinStrategy,
        confidence: 0.9,
        description: "NUTS codes → Eurostat geometry (direct match)",
      },
    ];
  },

  confidenceHints() {
    return [
      {
        target: "join" as const,
        delta: 0.1,
        condition: {
          codeFamily: { family: "eurostat" as const, namespace: "nuts" },
          minUnits: 20,
        },
        reason: "NUTS data with ≥20 regions — reliable Eurostat coverage",
      },
    ];
  },
};

/**
 * US FIPS plugin.
 *
 * Recognizes US FIPS state (2-digit) and county (5-digit) codes.
 */
export const usFipsPlugin: GeographyPlugin = {
  id: "us-fips",
  name: "US FIPS Codes",
  family: "fips",
  priority: 5,

  appliesTo(source) {
    if (source.countryHints.includes("US")) return true;
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return sid.includes("census") || sid.includes("fips") || sid.includes("us-");
  },

  matchCodes(codes, _dimension) {
    // FIPS state codes: 2-digit, "01"–"72" (includes territories)
    const stateMatch = codes.filter((c) => /^\d{2}$/.test(c) && Number(c) >= 1 && Number(c) <= 72);
    if (stateMatch.length / codes.length >= 0.8 && codes.length >= 10) {
      return {
        codeFamily: { family: "fips" },
        level: "admin1",
        confidence: 0.65,
        reason: `${stateMatch.length}/${codes.length} match FIPS state code pattern (2-digit 01–72)`,
      };
    }

    // FIPS county codes: 5-digit
    const countyMatch = codes.filter((c) => /^\d{5}$/.test(c));
    if (countyMatch.length / codes.length >= 0.7 && codes.length >= 20) {
      return {
        codeFamily: { family: "fips" },
        level: "admin2",
        confidence: 0.6,
        reason: `${countyMatch.length}/${codes.length} match FIPS county code pattern (5-digit)`,
      };
    }

    return null;
  },

  joinKeyFamilies() {
    return [
      {
        sourceFamily: { family: "fips" as const },
        targetFamily: { family: "fips" as const },
        strategy: "direct_code" as JoinStrategy,
        confidence: 0.8,
        description: "FIPS codes → US Census geometry (direct match)",
      },
    ];
  },

  aliasNormalizers() {
    return [
      {
        name: "fips-leading-zero",
        normalizer: (code: string) => {
          // Ensure state FIPS is zero-padded to 2 digits
          if (/^\d{1,2}$/.test(code)) return code.padStart(2, "0");
          // Ensure county FIPS is zero-padded to 5 digits
          if (/^\d{3,5}$/.test(code)) return code.padStart(5, "0");
          return null;
        },
      },
    ];
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          level: "admin1" as GeographyLevel,
          minUnits: 40,
          maxUnits: 56,
        },
        reason: "FIPS state data with 40–56 units — matches US state count",
      },
    ];
  },
};

/**
 * Iceland Statistics Iceland (Hagstofa Íslands) PxWeb plugin.
 *
 * Recognizes Hagstofa region codes (1-digit "1"–"8", matching IS-1 through IS-8)
 * and municipality-level data (74 municipalities, name-only geometry).
 *
 * Geometry properties:
 *   admin1: iso_3166_2 (IS-1…IS-8), name (English region name)
 *   admin2: name only (Icelandic municipality name — no numeric codes)
 *
 * At region level, codes join via iso_3166_2; at municipality level,
 * dimension labels (Icelandic names) join to geometry names via crosswalk.
 */
export const icelandPlugin: GeographyPlugin = {
  id: "pxweb-is-statice",
  name: "Iceland Statistics Iceland / Hagstofa (PxWeb)",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) {
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return sid.includes("is-statice") || sid.includes("hagstofa") ||
      source.countryHints.includes("IS");
  },

  matchCodes(codes, _dimension) {
    // Hagstofa region codes: single digit "1"–"8" (matching IS-1 to IS-8)
    const regionMatch = codes.filter((c) => /^[1-8]$/.test(c));
    if (regionMatch.length / codes.length >= 0.8 && codes.length >= 3) {
      return {
        codeFamily: { family: "iso", namespace: "3166-2" },
        level: "admin1",
        confidence: 0.75,
        reason: `${regionMatch.length}/${codes.length} match Hagstofa region code pattern (single digit 1–8)`,
      };
    }

    // Zero-padded region codes: "01"–"08" (alternative Hagstofa encoding)
    const paddedRegionMatch = codes.filter((c) => /^0[1-8]$/.test(c));
    if (paddedRegionMatch.length / codes.length >= 0.8 && codes.length >= 3) {
      return {
        codeFamily: { family: "iso", namespace: "3166-2" },
        level: "admin1",
        confidence: 0.7,
        reason: `${paddedRegionMatch.length}/${codes.length} match Hagstofa zero-padded region code pattern (01–08)`,
      };
    }

    return null;
  },

  knownDimensions() {
    return [
      {
        // English API uses "Region" for admin1 regions
        dimensionId: /^Region$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "iso" as const, namespace: "3166-2" },
        confidence: 0.75,
      },
      {
        // English API uses "Municipality" for sveitarfélag
        dimensionId: /^Municipality$/i,
        level: "municipality" as GeographyLevel,
        codeFamily: { family: "name" as const },
        confidence: 0.8,
      },
      {
        // Icelandic dimension name for municipality
        dimensionId: /^Sveitarfélag$/i,
        level: "municipality" as GeographyLevel,
        codeFamily: { family: "name" as const },
        confidence: 0.8,
      },
      {
        // Icelandic dimension name for region
        dimensionId: /^Landshluti$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "iso" as const, namespace: "3166-2" },
        confidence: 0.75,
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        // Region level: Hagstofa 1-digit codes → iso_3166_2 property via normalizer
        sourceFamily: { family: "iso" as const, namespace: "3166-2" },
        targetFamily: { family: "iso" as const, namespace: "3166-2" },
        strategy: "direct_code" as JoinStrategy,
        confidence: 0.85,
        description: "Hagstofa region codes → GeoJSON iso_3166_2 (IS-1 through IS-8)",
      },
      {
        // Municipality level: name-only geometry → label crosswalk
        sourceFamily: { family: "name" as const },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.75,
        description: "Hagstofa municipality labels → GeoJSON name property via label crosswalk",
      },
    ];
  },

  aliasNormalizers() {
    // Hagstofa 1-digit region codes → ISO 3166-2 (IS-1 through IS-8)
    const HAGSTOFA_TO_ISO: Record<string, string> = {
      "1": "IS-1",  // Capital Region (Höfuðborgarsvæðið)
      "2": "IS-2",  // Southern Peninsula (Suðurnes)
      "3": "IS-3",  // Western Region (Vesturland)
      "4": "IS-4",  // Westfjords (Vestfirðir)
      "5": "IS-5",  // Northwestern Region (Norðurland vestra)
      "6": "IS-6",  // Northeastern Region (Norðurland eystra)
      "7": "IS-7",  // Eastern Region (Austurland)
      "8": "IS-8",  // Southern Region (Suðurland)
    };
    return [
      {
        name: "hagstofa-region-to-iso",
        normalizer: (code: string) => {
          // Map single-digit or zero-padded region code → IS-N format
          const trimmed = code.replace(/^0+/, "") || "0";
          return HAGSTOFA_TO_ISO[trimmed] ?? null;
        },
      },
      {
        name: "hagstofa-region-zero-pad",
        normalizer: (code: string) => {
          // Normalize zero-padded "01"–"08" → single digit "1"–"8"
          if (/^0[1-8]$/.test(code)) return code.replace(/^0/, "");
          return null;
        },
      },
    ];
  },

  knownTables() {
    // Hagstofa table IDs for common topics.
    // Tables confirmed under: px.hagstofa.is/pxen/api/v1/en/Ibuar/mannfjoldi/2_byggdir/sveitarfelog/
    return {
      // Population by municipality, age and sex (current division)
      population: ["MAN02005", "MAN02008"],
      mannfjoldi: ["MAN02005", "MAN02008"],
      ibuar: ["MAN02005"],
      // Population with sex and citizenship
      citizenship: ["MAN10001"],
    };
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          sourceId: "is-statice",
          level: "admin1" as GeographyLevel,
          minUnits: 6,
          maxUnits: 10,
        },
        reason: "Hagstofa region data with 6–10 units — matches Iceland's 8 regions",
      },
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          sourceId: "is-statice",
          level: "municipality" as GeographyLevel,
          minUnits: 50,
        },
        reason: "Hagstofa municipality data with ≥50 municipalities — high confidence",
      },
    ];
  },
};

/**
 * Generic PxWeb v2 plugin.
 *
 * Applies to ALL PxWeb v2 sources regardless of country.
 * Declares that national codes can be joined to geometry via label crosswalk,
 * enabling alias_crosswalk strategy (instead of fuzzy_name) for any PxWeb
 * source that has geo dimension labels. This covers NO, FI, IS, CH, LV, etc.
 * without needing a per-country plugin.
 *
 * Sits below country-specific plugins (priority 3) so SE-SCB, FIPS, NUTS
 * take precedence when they match.
 */
export const pxwebGenericPlugin: GeographyPlugin = {
  id: "pxweb-generic",
  name: "Generic PxWeb v2",
  family: "pxweb_country",
  priority: 3,

  appliesTo(source) {
    return source.sourceMetadata.apiType === "pxweb-v2";
  },

  joinKeyFamilies() {
    return [
      {
        // Any national code system → geometry name via label crosswalk.
        // The actual mapping is performed by the auto-injected
        // source-code-to-label normalizer in collectJoinEnrichment.
        sourceFamily: { family: "national" as const },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.7,
        description: "PxWeb national codes → geometry names via dimension labels",
      },
    ];
  },
};

/**
 * Slovenia SiStat plugin.
 *
 * Statistical Office of Slovenia (SURS) publishes regional data via PxWeb
 * at https://pxweb.stat.si/SiStatData/api/v1/en/Data.
 *
 * Geography levels:
 *   - Cohesion regions (2): NUTS1 codes SI03/SI04 — match admin1 iso_3166_2
 *   - Statistical regions (12): NUTS3 codes SI011–SI044 — label crosswalk
 *   - Municipalities (212): Slovenian municipality names — label crosswalk
 *     (admin2 geometry has only `name` property, no numeric codes)
 *
 * PxWeb dimension names (English endpoint):
 *   - "Cohesion region" → cohesion_region level (NUTS1, 2 units)
 *   - "Statistical region" → admin1 level (NUTS3, 12 units)
 *   - "Municipality" → municipality level (212 units)
 */
export const sloveniaPlugin: GeographyPlugin = {
  id: "pxweb-si-sistat",
  name: "Slovenia SiStat (PxWeb)",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) {
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return (
      sid.includes("si-stat") ||
      sid.includes("sistat") ||
      sid.includes("stat.si") ||
      source.countryHints.includes("SI")
    );
  },

  matchCodes(codes, _dimension) {
    // NUTS1 cohesion region codes: SI03, SI04
    const nuts1Match = codes.filter((c) => /^SI0[34]$/.test(c));
    if (nuts1Match.length / codes.length >= 0.8 && codes.length >= 2) {
      return {
        codeFamily: { family: "iso", namespace: "3166-2" },
        level: "admin1",
        confidence: 0.9,
        reason: `${nuts1Match.length}/${codes.length} match Slovenia NUTS1 cohesion region codes (SI03/SI04)`,
      };
    }

    // NUTS3 statistical region codes: SI011–SI044
    const nuts3Match = codes.filter((c) => /^SI0[1-4][1-4]$/.test(c));
    if (nuts3Match.length / codes.length >= 0.7 && codes.length >= 3) {
      return {
        codeFamily: { family: "eurostat", namespace: "nuts" },
        level: "admin1",
        confidence: 0.85,
        reason: `${nuts3Match.length}/${codes.length} match Slovenia NUTS3 statistical region codes (SI0xx)`,
      };
    }

    return null;
  },

  knownDimensions() {
    return [
      {
        // English PxWeb endpoint dimension label
        dimensionId: /^(Cohesion region|Kohezijska regija)$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "iso" as const, namespace: "3166-2" },
        confidence: 0.9,
      },
      {
        // Statistical regions (12 NUTS3 regions)
        dimensionId: /^(Statistical region|Statistična regija)$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "eurostat" as const, namespace: "nuts" },
        confidence: 0.85,
      },
      {
        // Municipalities (212 units, name-keyed geometry)
        dimensionId: /^(Municipality|Občina)$/i,
        level: "municipality" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "si-sistat" },
        confidence: 0.8,
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        // Cohesion regions: ISO 3166-2 codes (SI03/SI04) match admin1 iso_3166_2 directly
        sourceFamily: { family: "iso" as const, namespace: "3166-2" },
        targetFamily: { family: "iso" as const, namespace: "3166-2" },
        strategy: "direct_code" as JoinStrategy,
        confidence: 0.9,
        description: "Slovenia NUTS1 ISO 3166-2 codes → admin1 iso_3166_2 property",
      },
      {
        // Statistical regions: NUTS3 codes → names via label crosswalk
        sourceFamily: { family: "eurostat" as const, namespace: "nuts" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.8,
        description: "Slovenia NUTS3 codes → statistical region names via label crosswalk",
      },
      {
        // Municipalities: SiStat national codes → admin2 names via label crosswalk
        // (admin2 geometry has only `name` property — no numeric codes)
        sourceFamily: { family: "national" as const, namespace: "si-sistat" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.75,
        description: "SiStat municipality codes → admin2 municipality names via label crosswalk",
      },
    ];
  },

  aliasNormalizers() {
    // NUTS3 statistical region codes → Slovenian region names.
    // Names match the Slovenian government's official English labels.
    const NUTS3_TO_NAME: Record<string, string> = {
      SI011: "Pomurska",
      SI012: "Podravska",
      SI013: "Koroška",
      SI014: "Savinjska",
      SI015: "Zasavska",
      SI016: "Posavska",
      SI017: "Jugovzhodna Slovenija",
      SI018: "Primorsko-notranjska",
      SI021: "Osrednjeslovenska",
      SI022: "Gorenjska",
      SI023: "Goriška",
      SI024: "Obalno-kraška",
    };

    // NUTS1 cohesion region code → admin1 name (fallback if direct code fails)
    const NUTS1_TO_NAME: Record<string, string> = {
      SI03: "Vzhodna",
      SI04: "Zahodna Slovenija",
    };

    return [
      {
        // NUTS3 codes → statistical region names
        name: "si-nuts3-to-name",
        normalizer: (code: string) => NUTS3_TO_NAME[code.toUpperCase()] ?? null,
      },
      {
        // NUTS1 codes → cohesion region names (backup for label_match)
        name: "si-nuts1-to-name",
        normalizer: (code: string) => NUTS1_TO_NAME[code.toUpperCase()] ?? null,
      },
      {
        // Strip parenthetical suffixes from municipality labels:
        // "Koper/Capodistria" → "Koper", "Nova Gorica (Mestna občina)" → "Nova Gorica"
        name: "si-label-cleanup",
        normalizer: (label: string) => {
          const cleaned = label
            .replace(/\s*\/.*$/, "")                 // strip "/Capodistria" Italian suffix
            .replace(/\s*\(.*\)$/, "")               // strip "(Mestna občina)" suffix
            .trim();
          return cleaned !== label ? cleaned : null;
        },
      },
    ];
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          sourceId: "si-sistat",
          level: "municipality" as GeographyLevel,
          minUnits: 100,
        },
        reason: "SiStat municipality data with ≥100 municipalities — high confidence",
      },
      {
        target: "detection" as const,
        delta: 0.15,
        condition: {
          sourceId: "si-sistat",
          level: "admin1" as GeographyLevel,
          minUnits: 10,
          maxUnits: 14,
        },
        reason: "SiStat statistical region data with 10–14 units — matches Slovenia NUTS3 count",
      },
    ];
  },

  knownTables() {
    // SiStat table IDs for common topics.
    // Source: https://pxweb.stat.si/SiStatData/api/v1/en/Data listing
    return {
      // Territorial units / administrative geography
      territory: ["0214809S.px", "0214819S.px"],
      municipalities: ["0214809S.px"],
      regions: ["0214819S.px"],
    };
  },
};

/**
 * Estonia Statistics Estonia plugin.
 *
 * Recognizes EHAK county codes (2–3 digit, 37–87) used in the
 * Statistics Estonia PxWeb API (andmed.stat.ee).
 *
 * County dimension is `Maakond` (code) / `County` (text).
 * The GeoJSON admin1 features use ISO 3166-2 (EE-37…EE-86) whose numeric
 * suffix differs from the EHAK code — e.g. EHAK 45 = Ida-Viru = ISO EE-44.
 * The alias normalizer maps EHAK codes to ISO 3166-2 strings via a hardcoded
 * crosswalk derived from matching county names across both systems.
 *
 * Municipality dimension is `Omavalitsus` (code) / `Municipality` (text).
 * admin2 GeoJSON has only a `name` property — municipalities are joined by
 * name via the auto-injected source-code-to-label normalizer.
 */
export const estoniaPlugin: GeographyPlugin = {
  id: "pxweb-ee-stat",
  name: "Estonia Statistics Estonia (PxWeb)",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) {
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return (
      sid.includes("ee-stat") ||
      sid.includes("andmed.stat.ee") ||
      sid.includes("stat.ee") ||
      source.countryHints.includes("EE")
    );
  },

  matchCodes(codes, _dimension) {
    // Statistics Estonia EHAK county codes: 2–3 digit numeric, values 37–87.
    // Skip aggregates: "00" (whole country), "unk", and sub-codes "784"/"793".
    const countyCodes = new Set(["37","39","45","50","52","56","60","64","68","71","74","79","81","84","87"]);
    const realCodes = codes.filter((c) => /^\d{2,3}$/.test(c) && c !== "00" && c !== "784" && c !== "793");
    const countyMatch = realCodes.filter((c) => countyCodes.has(c));
    if (countyMatch.length / Math.max(realCodes.length, 1) >= 0.6 && countyMatch.length >= 3) {
      return {
        codeFamily: { family: "national", namespace: "ee-stat" },
        level: "admin1",
        confidence: 0.8,
        reason: `${countyMatch.length}/${realCodes.length} match Estonian EHAK county codes`,
      };
    }

    // Municipality-level EHAK codes are 4-digit numeric.
    const munMatch = codes.filter((c) => /^\d{4}$/.test(c));
    if (munMatch.length / codes.length >= 0.7 && codes.length >= 20) {
      return {
        codeFamily: { family: "national", namespace: "ee-stat" },
        level: "municipality",
        confidence: 0.65,
        reason: `${munMatch.length}/${codes.length} match Estonian municipality code pattern (4-digit)`,
      };
    }

    return null;
  },

  knownDimensions() {
    return [
      {
        // County-level tables: dimension code "Maakond", text "County"
        dimensionId: "Maakond",
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "ee-stat" },
        confidence: 0.9,
      },
      {
        // Municipality tables: dimension code "Omavalitsus", text "Municipality"
        dimensionId: /^Omavalitsus$/i,
        level: "municipality" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "ee-stat" },
        confidence: 0.85,
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        // County: EHAK code → ISO 3166-2 (EE-XX) via alias crosswalk
        sourceFamily: { family: "national" as const, namespace: "ee-stat" },
        targetFamily: { family: "iso" as const, namespace: "3166-2" },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.9,
        description: "Estonian EHAK county codes → ISO 3166-2 (EE-XX) via crosswalk",
      },
      {
        // Municipality: codes → admin2 geometry names via label crosswalk
        sourceFamily: { family: "national" as const, namespace: "ee-stat" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.75,
        description: "Estonian municipality codes → geometry names via label crosswalk",
      },
    ];
  },

  aliasNormalizers() {
    // EHAK county code → ISO 3166-2 mapping.
    //
    // Statistics Estonia EHAK numeric codes differ from the ISO 3166-2 numeric
    // suffix used in the GeoJSON admin1 features (e.g. EHAK 45 = Ida-Viru county
    // but GeoJSON uses EE-44). Crosswalk derived by matching county names.
    const EHAK_TO_ISO: Record<string, string> = {
      "37": "EE-37", // Harju
      "39": "EE-39", // Hiiu
      "45": "EE-44", // Ida-Viru
      "50": "EE-49", // Jõgeva
      "52": "EE-51", // Järva
      "56": "EE-57", // Lääne
      "60": "EE-59", // Lääne-Viru
      "64": "EE-65", // Põlva
      "68": "EE-67", // Pärnu
      "71": "EE-70", // Rapla
      "74": "EE-74", // Saare
      "79": "EE-78", // Tartu
      "81": "EE-82", // Valga
      "84": "EE-84", // Viljandi
      "87": "EE-86", // Võru
    };

    return [
      {
        name: "ee-ehak-county-to-iso",
        normalizer: (code: string) => EHAK_TO_ISO[code] ?? null,
      },
    ];
  },

  knownTables() {
    // Statistics Estonia PxWeb table IDs for common topics.
    // API root: https://andmed.stat.ee/api/v1/en/stat
    return {
      // Population by county — RV0222U contains the Maakond dimension
      population: ["RV0222U", "RV0213U"],
      rahvaarv: ["RV0222U"],
      // Population density and area
      density: ["RV0291U"],
      // Mean annual population
      "mean population": ["RV028U"],
    };
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          sourceId: "ee-stat",
          level: "admin1" as GeographyLevel,
          minUnits: 10,
          maxUnits: 18,
        },
        reason: "Estonian county data with 10–18 units — matches 15-county structure",
      },
    ];
  },
};

/**
 * Country admin-code plugin.
 *
 * Generic recognizer for ISO 3166-1 alpha-2 and alpha-3 codes.
 * Lower priority — more specific plugins take precedence.
 */
export const countryAdminPlugin: GeographyPlugin = {
  id: "country-admin",
  name: "Country Admin Codes",
  family: "admin_code",
  priority: 1, // low — act as fallback

  appliesTo() {
    return true; // universal fallback
  },

  matchCodes(codes, _dimension) {
    // ISO alpha-2
    const a2 = codes.filter((c) => /^[A-Z]{2}$/.test(c));
    if (a2.length / codes.length >= 0.8 && codes.length >= 3) {
      return {
        codeFamily: { family: "iso", namespace: "alpha2" },
        level: "country",
        confidence: 0.6,
        reason: `${a2.length}/${codes.length} match ISO alpha-2 pattern`,
      };
    }

    // ISO alpha-3
    const a3 = codes.filter((c) => /^[A-Z]{3}$/.test(c) && !/\d/.test(c));
    if (a3.length / codes.length >= 0.8 && codes.length >= 3) {
      return {
        codeFamily: { family: "iso", namespace: "alpha3" },
        level: "country",
        confidence: 0.6,
        reason: `${a3.length}/${codes.length} match ISO alpha-3 pattern`,
      };
    }

    return null;
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.05,
        condition: {
          level: "country" as GeographyLevel,
          minUnits: 10,
        },
        reason: "Country-level data with ≥10 countries — decent coverage",
      },
    ];
  },
};

/**
 * Switzerland FSO (Federal Statistical Office / BFS) plugin.
 *
 * STAT-TAB is the FSO's PxWeb instance at pxweb.bfs.admin.ch.
 * Geographic dimensions are multilingual — the same dimension appears as
 * "Kanton" (DE), "Canton" (FR/EN), "Cantone" (IT). Values use BFS numeric
 * canton codes (01 = Zürich, 26 = Jura), short ISO abbreviations (ZH, BE, …),
 * or full ISO 3166-2 strings (CH-ZH, CH-BE, …).
 *
 * Admin1 geometry (26 cantons): has `iso_3166_2` property → direct_code join.
 * Admin2 geometry (169 districts): has only `name` property → alias_crosswalk.
 *
 * BFS also uses a 4-digit municipality number (Gemeindenummer, e.g. 0261 for
 * Zürich) for commune-level tables — matched by 4-digit code pattern.
 */
export const switzerlandFsoPlugin: GeographyPlugin = {
  id: "ch-fso",
  name: "Switzerland FSO / STAT-TAB (PxWeb)",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) {
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return (
      sid.includes("ch-fso") ||
      sid.includes("bfs.admin.ch") ||
      sid.includes("stat-tab") ||
      source.countryHints.includes("CH")
    );
  },

  matchCodes(codes, _dimension) {
    // Full ISO 3166-2 strings: "CH-ZH", "CH-BE", …
    const isoFullMatch = codes.filter((c) => /^CH-[A-Z]{2}$/.test(c));
    if (isoFullMatch.length / codes.length >= 0.7 && codes.length >= 3) {
      return {
        codeFamily: { family: "iso", namespace: "3166-2" },
        level: "admin1",
        confidence: 0.95,
        reason: `${isoFullMatch.length}/${codes.length} match Swiss ISO 3166-2 canton codes (CH-XX)`,
      };
    }

    // 2-letter canton abbreviations: ZH, BE, LU, UR, SZ, OW, NW, GL, ZG, FR,
    // SO, BS, BL, SH, AR, AI, SG, GR, AG, TG, TI, VD, VS, NE, GE, JU
    const CANTON_ABBR = new Set([
      "ZH","BE","LU","UR","SZ","OW","NW","GL","ZG","FR",
      "SO","BS","BL","SH","AR","AI","SG","GR","AG","TG",
      "TI","VD","VS","NE","GE","JU",
    ]);
    const abbrMatch = codes.filter((c) => CANTON_ABBR.has(c.toUpperCase()));
    if (abbrMatch.length / codes.length >= 0.7 && codes.length >= 3) {
      return {
        codeFamily: { family: "iso", namespace: "3166-2" },
        level: "admin1",
        confidence: 0.9,
        reason: `${abbrMatch.length}/${codes.length} match Swiss 2-letter canton abbreviations`,
      };
    }

    // BFS numeric canton codes: 2-digit "01"–"26" (Zürich=01, Jura=26)
    const bfsCantonMatch = codes.filter(
      (c) => /^\d{2}$/.test(c) && Number(c) >= 1 && Number(c) <= 26
    );
    if (bfsCantonMatch.length / codes.length >= 0.7 && codes.length >= 3) {
      return {
        codeFamily: { family: "national", namespace: "ch-fso" },
        level: "admin1",
        confidence: 0.8,
        reason: `${bfsCantonMatch.length}/${codes.length} match BFS 2-digit canton codes (01–26)`,
      };
    }

    // BFS municipality (Gemeindenummer): 4-digit "0001"–"6999"
    const bfsMunMatch = codes.filter((c) => /^\d{4}$/.test(c));
    const munRatioOk = bfsMunMatch.length / codes.length >= 0.8;
    const munCountOk = bfsMunMatch.length >= 100;
    if ((munRatioOk || munCountOk) && codes.length >= 10) {
      return {
        codeFamily: { family: "national", namespace: "ch-fso" },
        level: "municipality",
        confidence: munRatioOk ? 0.7 : 0.6,
        reason: `${bfsMunMatch.length}/${codes.length} match BFS 4-digit municipality code pattern`,
      };
    }

    return null;
  },

  knownDimensions() {
    return [
      {
        // Swiss cantons — all four official languages + English
        dimensionId: /^(Kanton|Canton|Cantone|Chantun)$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "iso" as const, namespace: "3166-2" },
        confidence: 0.9,
      },
      {
        // NUTS2 macro-regions ("Grossregion" / "Grande région")
        dimensionId: /^(Grossregion|Grande r[ée]gion|Grandi regioni)$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "eurostat" as const, namespace: "nuts" },
        confidence: 0.8,
      },
      {
        // BFS districts
        dimensionId: /^(Bezirk|District|Distretto|District\/Bezirk)$/i,
        level: "admin2" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "ch-fso" },
        confidence: 0.8,
      },
      {
        // BFS municipalities (Gemeinde)
        dimensionId: /^(Gemeinde|Commune|Gemeinden|Communes|Municipality)$/i,
        level: "municipality" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "ch-fso" },
        confidence: 0.8,
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        // Canton ISO 3166-2 codes → admin1 iso_3166_2 property (direct match)
        sourceFamily: { family: "iso" as const, namespace: "3166-2" },
        targetFamily: { family: "iso" as const, namespace: "3166-2" },
        strategy: "direct_code" as JoinStrategy,
        confidence: 0.95,
        description: "Swiss ISO 3166-2 canton codes → admin1 iso_3166_2 property (direct)",
      },
      {
        // BFS numeric canton codes → admin1 names via alias crosswalk
        sourceFamily: { family: "national" as const, namespace: "ch-fso" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.85,
        description: "BFS canton codes → admin1 canton names via crosswalk",
      },
      {
        // BFS district codes → admin2 names via label crosswalk
        // (admin2 geometry has only `name` — no numeric codes)
        sourceFamily: { family: "national" as const, namespace: "ch-fso" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.75,
        description: "BFS district codes/labels → admin2 district names via label crosswalk",
      },
    ];
  },

  aliasNormalizers() {
    // BFS numeric canton codes → ISO 3166-2 abbreviation (used as-is in geometry iso_3166_2).
    // Source: https://www.bfs.admin.ch/bfs/en/home/basics/swiss-official-commune-register.html
    // BFS number = official Swiss Federal Statistical Office canton numbering.
    const BFS_TO_ISO: Record<string, string> = {
      "01": "CH-ZH", // Zürich
      "02": "CH-BE", // Bern
      "03": "CH-LU", // Luzern
      "04": "CH-UR", // Uri
      "05": "CH-SZ", // Schwyz
      "06": "CH-OW", // Obwalden
      "07": "CH-NW", // Nidwalden
      "08": "CH-GL", // Glarus
      "09": "CH-ZG", // Zug
      "10": "CH-FR", // Fribourg
      "11": "CH-SO", // Solothurn
      "12": "CH-BS", // Basel-Stadt
      "13": "CH-BL", // Basel-Landschaft
      "14": "CH-SH", // Schaffhausen
      "15": "CH-AR", // Appenzell Ausserrhoden
      "16": "CH-AI", // Appenzell Innerrhoden
      "17": "CH-SG", // St. Gallen
      "18": "CH-GR", // Graubünden
      "19": "CH-AG", // Aargau
      "20": "CH-TG", // Thurgau
      "21": "CH-TI", // Ticino
      "22": "CH-VD", // Vaud
      "23": "CH-VS", // Valais
      "24": "CH-NE", // Neuchâtel
      "25": "CH-GE", // Genève
      "26": "CH-JU", // Jura
    };

    // 2-letter canton abbreviation → full ISO 3166-2 string.
    // FSO tables sometimes emit bare abbreviations ("ZH") without the "CH-" prefix.
    const ABBR_TO_ISO: Record<string, string> = {
      ZH: "CH-ZH", BE: "CH-BE", LU: "CH-LU", UR: "CH-UR",
      SZ: "CH-SZ", OW: "CH-OW", NW: "CH-NW", GL: "CH-GL",
      ZG: "CH-ZG", FR: "CH-FR", SO: "CH-SO", BS: "CH-BS",
      BL: "CH-BL", SH: "CH-SH", AR: "CH-AR", AI: "CH-AI",
      SG: "CH-SG", GR: "CH-GR", AG: "CH-AG", TG: "CH-TG",
      TI: "CH-TI", VD: "CH-VD", VS: "CH-VS", NE: "CH-NE",
      GE: "CH-GE", JU: "CH-JU",
    };

    return [
      {
        // BFS 2-digit code → ISO 3166-2 string (with or without leading zero)
        name: "fso-canton-bfs-to-iso",
        normalizer: (code: string) => {
          const padded = code.padStart(2, "0");
          return BFS_TO_ISO[padded] ?? null;
        },
      },
      {
        // 2-letter abbreviation → ISO 3166-2 string
        name: "fso-canton-abbr-to-iso",
        normalizer: (code: string) => ABBR_TO_ISO[code.toUpperCase()] ?? null,
      },
      {
        // Label cleanup for multilingual FSO dimension values.
        // Examples:
        //   "Bern / Berne"          → "Bern"  (bilingual slash suffix)
        //   "Graubünden / Grigioni / Grischun" → "Graubünden"
        //   "Basel-Stadt (BS)"      → "Basel-Stadt" (code in parens)
        //   "Valais/Wallis"         → "Valais"
        name: "fso-label-cleanup",
        normalizer: (label: string) => {
          const cleaned = label
            .replace(/\s*\/\s*[^\s].*$/, "")   // strip " / Berne" or "/Wallis" suffix
            .replace(/\s*\([^)]+\)$/, "")       // strip "(BS)" or other parens suffix
            .trim();
          return cleaned !== label ? cleaned : null;
        },
      },
    ];
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.15,
        condition: {
          sourceId: "ch-fso",
          level: "admin1" as GeographyLevel,
          minUnits: 20,
          maxUnits: 28,
        },
        reason: "FSO canton data with 20–28 units — matches Switzerland's 26 cantons",
      },
    ];
  },

  knownTables() {
    // STAT-TAB table IDs for common topics at canton level.
    // Database IDs follow the pattern px-x-{topic-code}_{version}.
    // Source: https://www.pxweb.bfs.admin.ch
    return {
      // Population by canton (permanent resident population)
      population: ["px-x-0102010000_101", "px-x-0102010000_102"],
      // Employment / jobs
      employment: ["px-x-0602050000_101", "px-x-0602050000_102"],
      // Gross domestic product by canton
      gdp: ["px-x-0401010000_101"],
      // Poverty / social assistance
      social: ["px-x-1302020000_101"],
      // Education levels
      education: ["px-x-1502020100_101"],
      // Housing / buildings
      housing: ["px-x-0902010000_101"],
      // Health
      health: ["px-x-1401010000_101"],
    };
  },
};

// ═══════════════════════════════════════════════════════════════
// Latvia CSB plugin
// ═══════════════════════════════════════════════════════════════

/**
 * Latvia Central Statistical Bureau (CSB) plugin.
 *
 * API base: https://data.stat.gov.lv/api/v1/en/OSP_PUB
 *
 * Territorial codes follow the pattern "LV" + 7 digits:
 *   - Statistical region codes: LV00A, LV006, LV00C, LV00B, LV009, LV005 (5–6 chars)
 *   - Municipality/city codes: LV0001000–LV0056000 (9 chars, ending in "000")
 *   - Sub-municipality codes (towns, pagasti): 9 chars, NOT ending in "000"
 *
 * admin1 GeoJSON has `iso_3166_2` (e.g. "LV-007", "LV-RIX") — used as join key.
 * admin2 GeoJSON has only `name` — joined via alias_crosswalk using dimension labels.
 *
 * Note: GeoJSON has a known duplicate LV-073 (used for both Preiļu novads and
 * Rēzeknes novads). Both CSB municipality codes map to the same ISO code.
 */
export const latviaCsbPlugin: GeographyPlugin = {
  id: "pxweb-lv-csb",
  name: "Latvia CSB (PxWeb)",
  family: "pxweb_country",
  priority: 10,

  appliesTo(source) {
    const sid = source.sourceMetadata.sourceId.toLowerCase();
    return (
      sid.includes("lv-csb") ||
      sid.includes("data.stat.gov.lv") ||
      sid.includes("stat.gov.lv") ||
      source.countryHints.includes("LV")
    );
  },

  matchCodes(codes, _dimension) {
    // CSB municipality/city codes: exactly 9 chars, "LV" + 7 digits, ending in "000"
    // e.g. LV0001000 (Riga), LV0021000 (Alūksne municipality)
    const munMatch = codes.filter((c) => /^LV\d{7}$/.test(c) && c.endsWith("000"));
    if (munMatch.length / codes.length >= 0.6 && codes.length >= 3) {
      return {
        codeFamily: { family: "national", namespace: "lv-csb" },
        level: "admin1",
        confidence: 0.8,
        reason: `${munMatch.length}/${codes.length} match Latvia CSB municipality code pattern (LVxxxxxxx)`,
      };
    }

    // CSB statistical region codes: 5–6 chars, "LV" + 3–4 alphanum
    // e.g. LV00A, LV006, LV00C, LV00B, LV009, LV005
    const regionMatch = codes.filter((c) => /^LV[0-9A-Z]{3,4}$/.test(c) && c.length <= 6);
    if (regionMatch.length / codes.length >= 0.6 && codes.length >= 3) {
      return {
        codeFamily: { family: "national", namespace: "lv-csb" },
        level: "admin1",
        confidence: 0.65,
        reason: `${regionMatch.length}/${codes.length} match Latvia CSB statistical region code pattern`,
      };
    }

    // Sub-municipality codes: 9 chars, "LV" + 7 digits, NOT ending in "000"
    // e.g. LV0020200 (Aizkraukle town within Aizkraukle municipality)
    const subMunMatch = codes.filter((c) => /^LV\d{7}$/.test(c) && !c.endsWith("000"));
    if (subMunMatch.length / codes.length >= 0.6 && codes.length >= 10) {
      return {
        codeFamily: { family: "national", namespace: "lv-csb" },
        level: "municipality",
        confidence: 0.6,
        reason: `${subMunMatch.length}/${codes.length} match Latvia CSB sub-municipality code pattern`,
      };
    }

    return null;
  },

  knownDimensions() {
    return [
      {
        // CSB tables use "Territorial unit" for both regions and municipalities
        dimensionId: /^Territorial unit$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "lv-csb" },
        confidence: 0.8,
      },
      {
        // Latvian-language variant: "Teritoriālā vienība"
        dimensionId: /^Teritoriālā vienība$/i,
        level: "admin1" as GeographyLevel,
        codeFamily: { family: "national" as const, namespace: "lv-csb" },
        confidence: 0.8,
      },
    ];
  },

  joinKeyFamilies() {
    return [
      {
        // Municipality/city codes → ISO 3166-2 (LV-XXX) via alias crosswalk
        // admin1 GeoJSON uses iso_3166_2 as the authoritative join key
        sourceFamily: { family: "national" as const, namespace: "lv-csb" },
        targetFamily: { family: "iso" as const, namespace: "3166-2" },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.9,
        description: "Latvia CSB territorial codes → ISO 3166-2 (LV-XXX) via crosswalk",
      },
      {
        // Sub-municipality (pagasts/towns) — name-based join against admin2 geometry
        sourceFamily: { family: "national" as const, namespace: "lv-csb" },
        targetFamily: { family: "name" as const },
        strategy: "alias_crosswalk" as JoinStrategy,
        confidence: 0.7,
        description: "Latvia CSB sub-municipality codes → admin2 geometry names via label crosswalk",
      },
    ];
  },

  aliasNormalizers() {
    // CSB territorial code → ISO 3166-2.
    //
    // Latvia has 43 administrative units (36 municipalities + 7 state cities).
    // The CSB uses a 9-character code: "LV" + 7 digits where the last 3 are "000"
    // for top-level units. ISO 3166-2 uses "LV-" + 3 alphanumeric chars.
    //
    // Note: LV-073 appears twice in the GeoJSON (Preiļu novads and Rēzeknes novads)
    // due to a data quirk. Both CSB codes map to the same ISO — the render engine
    // will match whichever feature appears first.
    const CSB_TO_ISO: Record<string, string> = {
      // State cities (7 republican cities)
      "LV0001000": "LV-RIX", // Rīga
      "LV0002000": "LV-DGV", // Daugavpils
      "LV0003000": "LV-JEL", // Jelgava
      "LV0004000": "LV-JUR", // Jūrmala
      "LV0005000": "LV-LPX", // Liepāja
      "LV0006000": "LV-REZ", // Rēzekne
      "LV0007000": "LV-VEN", // Ventspils
      // Municipalities (novadi) — 36 units post-2021 administrative reform
      "LV0020000": "LV-002", // Aizkraukles novads
      "LV0021000": "LV-007", // Alūksnes novads
      "LV0022000": "LV-111", // Augšdaugavas novads
      "LV0023000": "LV-011", // Ādažu novads
      "LV0024000": "LV-015", // Balvu novads
      "LV0025000": "LV-016", // Bauskas novads
      "LV0026000": "LV-022", // Cēsu novads
      "LV0027000": "LV-112", // Dienvidkurzemes novads
      "LV0028000": "LV-026", // Dobeles novads
      "LV0029000": "LV-033", // Gulbenes novads
      "LV0030000": "LV-041", // Jelgavas novads
      "LV0031000": "LV-042", // Jēkabpils novads
      "LV0032000": "LV-047", // Krāslavas novads
      "LV0033000": "LV-050", // Kuldīgas novads
      "LV0034000": "LV-052", // Ķekavas novads
      "LV0035000": "LV-054", // Limbažu novads
      "LV0036000": "LV-056", // Līvānu novads
      "LV0037000": "LV-058", // Ludzas novads
      "LV0038000": "LV-059", // Madonas novads
      "LV0038001": "LV-059", // Madonas novads (boundary update 01.07.2025, same unit)
      "LV0039000": "LV-062", // Mārupes novads
      "LV0040000": "LV-067", // Ogres novads
      "LV0041000": "LV-068", // Olaines novads
      "LV0042000": "LV-073", // Preiļu novads (LV-073 shared with Rēzeknes novads in GeoJSON)
      "LV0043000": "LV-073", // Rēzeknes novads (GeoJSON duplicate — same ISO code)
      "LV0044000": "LV-080", // Ropažu novads
      "LV0045000": "LV-087", // Salaspils novads
      "LV0046000": "LV-088", // Saldus novads
      "LV0047000": "LV-089", // Saulkrastu novads
      "LV0048000": "LV-091", // Siguldas novads
      "LV0049000": "LV-094", // Smiltenes novads
      "LV0051000": "LV-097", // Talsu novads
      "LV0052000": "LV-099", // Tukums novads
      "LV0053000": "LV-101", // Valkas novads
      "LV0054000": "LV-113", // Valmieras novads
      "LV0055000": "LV-102", // Varakļānu novads
      "LV0056000": "LV-106", // Ventspils novads
    };

    return [
      {
        name: "lv-csb-code-to-iso",
        normalizer: (code: string) => CSB_TO_ISO[code] ?? null,
      },
      {
        // Strip trailing whitespace and date qualifiers from CSB dimension labels.
        // API values sometimes have trailing spaces and parenthetical date ranges:
        // "Riga statistical region (Riga) (before 01.01.2024.)  " → "Riga statistical region (Riga)"
        name: "lv-csb-label-cleanup",
        normalizer: (label: string) => {
          const cleaned = label
            .replace(/\s*\((?:from|before)\s+\d{2}\.\d{2}\.\d{4}\.?\)\s*$/, "")
            .trim();
          return cleaned !== label ? cleaned : null;
        },
      },
    ];
  },

  knownTables() {
    // Latvia CSB PxWeb table IDs for common topics.
    // API root: https://data.stat.gov.lv/api/v1/en/OSP_PUB
    return {
      // Population by region/municipality — IRS031 contains the "Territorial unit" dimension
      population: ["IRS031", "IRS051"],
      // Causes of population change by region
      "population change": ["IRS031"],
      // Urban/rural population split by municipality
      "urban rural": ["IRS051"],
    };
  },

  confidenceHints() {
    return [
      {
        target: "detection" as const,
        delta: 0.1,
        condition: {
          sourceId: "lv-csb",
          level: "admin1" as GeographyLevel,
          minUnits: 36,
          maxUnits: 43,
        },
        reason: "Latvia admin data with 36–43 units matches municipality+city structure",
      },
    ];
  },
};

// ═══════════════════════════════════════════════════════════════
// ALL_PLUGINS — canonical list for module consumers
// ═══════════════════════════════════════════════════════════════

/**
 * All built-in plugins in priority order.
 * Import this array instead of the individual exports when you need the
 * full set (e.g. for registration, testing, or serialisation).
 */
export const ALL_PLUGINS: GeographyPlugin[] = [
  swedenScbPlugin,
  norwaySsbPlugin,
  icelandPlugin,
  denmarkDstPlugin,
  finlandPlugin,
  sloveniaPlugin,
  estoniaPlugin,
  latviaCsbPlugin,
  switzerlandFsoPlugin,
  eurostatNutsPlugin,
  usFipsPlugin,
  pxwebGenericPlugin,
  countryAdminPlugin,
];
