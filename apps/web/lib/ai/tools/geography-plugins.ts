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
