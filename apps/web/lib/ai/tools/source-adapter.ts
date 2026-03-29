/**
 * Universal source adapter contract.
 *
 * Defines the shared interface all data source adapters must implement,
 * plus the first concrete adapter: PxWeb → NormalizedSourceResult.
 *
 * Adapters are responsible for:
 *   1. Fetching data from their source
 *   2. Normalizing it into dimensions + rows
 *   3. Providing country/geography hints
 *   4. Reporting query diagnostics
 *
 * Adapters must NOT:
 *   - Attempt geometry joins
 *   - Claim map readiness
 *   - Load boundary layers
 *
 * Geography detection, join planning, and join execution are
 * separate pipeline stages that operate on NormalizedSourceResult.
 */

import type {
  NormalizedSourceResult,
  NormalizedDimension,
  NormalizedRow,
  SourceMetadata,
  QueryDiagnostics,
  GeographyLevel,
  DatasetCandidate,
} from "./normalized-result";
import {
  sourceOk,
  sourceNoData,
  sourceError,
  sourceCandidates,
  toCanonicalLevel,
} from "./normalized-result";
import type {
  PxTableMetadata,
  PxDimension,
  PxDataRecord,
  PxTableInfo,
  PxDimensionSelection,
} from "./pxweb-client";

// ═══════════════════════════════════════════════════════════════
// Adapter contract
// ═══════════════════════════════════════════════════════════════

/** Supported adapter families. */
export type AdapterFamily =
  | "pxweb"
  | "public_api"
  | "csv"
  | "overpass"
  | "geojson";

/**
 * The universal source adapter interface.
 *
 * Every data source adapter implements this contract. The pipeline
 * calls `fetch()` and receives a NormalizedSourceResult regardless
 * of the underlying source type.
 */
export interface SourceAdapter {
  /** Which family this adapter belongs to. */
  readonly family: AdapterFamily;
  /** Human-readable adapter name. */
  readonly name: string;

  /**
   * Fetch and normalize data from this source.
   *
   * @param prompt - The user's original prompt (used for query building)
   * @param context - Additional context the pipeline provides
   * @returns Normalized source result (never throws — errors returned in result)
   */
  fetch(
    prompt: string,
    context: AdapterContext,
  ): Promise<NormalizedSourceResult>;
}

/** Context provided by the pipeline to adapters. */
export interface AdapterContext {
  /** ISO country codes inferred from prompt or source config. */
  countryHints: string[];
  /** Geography level hints from the source registry. */
  geographyHints: GeographyLevel[];
  /** Language preference (ISO 639-1). */
  language?: string;
}

// ═══════════════════════════════════════════════════════════════
// PxWeb adapter — pure normalization functions
// ═══════════════════════════════════════════════════════════════

/**
 * Convert PxWeb dimension type to NormalizedDimension role.
 */
export function pxDimTypeToRole(
  type: PxDimension["type"],
): NormalizedDimension["role"] {
  switch (type) {
    case "geo":
      return "geo";
    case "time":
      return "time";
    case "contents":
      return "metric";
    case "regular":
      return "filter";
  }
}

/**
 * Normalize PxWeb dimensions into NormalizedDimension[].
 */
export function normalizePxDimensions(
  dimensions: PxDimension[],
): NormalizedDimension[] {
  return dimensions.map((d) => ({
    id: d.id,
    label: d.label,
    role: pxDimTypeToRole(d.type),
    values: d.values.map((v) => ({ code: v.code, label: v.label })),
  }));
}

/**
 * Convert PxDataRecord[] into NormalizedRow[].
 *
 * Maps the flat PxWeb records back into dimension-keyed rows.
 * Requires the geo dimension ID and contents dimension ID to
 * reconstruct the dimension values correctly.
 *
 * @param records - Parsed PxWeb data records
 * @param geoDimId - The dimension ID classified as "geo"
 * @param contentsDimId - The dimension ID classified as "contents"
 * @param timeDimId - The dimension ID classified as "time"
 * @param selections - The dimension selections used in the query (for regular dims)
 */
export function normalizePxRecords(
  records: PxDataRecord[],
  geoDimId: string,
  contentsDimId: string,
  timeDimId: string,
  selections?: PxDimensionSelection[],
): NormalizedRow[] {
  return records.map((r) => {
    const dimensionValues: Record<string, string> = {
      [geoDimId]: r.regionCode,
      [contentsDimId]: r.metricCode,
      [timeDimId]: r.timePeriod,
    };

    // Include regular dimension selections as fixed values
    if (selections) {
      for (const sel of selections) {
        if (
          sel.dimensionId !== geoDimId &&
          sel.dimensionId !== contentsDimId &&
          sel.dimensionId !== timeDimId &&
          sel.valueCodes.length === 1
        ) {
          dimensionValues[sel.dimensionId] = sel.valueCodes[0];
        }
      }
    }

    return {
      dimensionValues,
      value: r.value,
    };
  });
}

/**
 * Infer geography level hints from PxWeb geo dimension values.
 *
 * Uses code patterns (e.g. 4-digit = municipality in Sweden,
 * 2-digit = county/län). These are hints only — the geography
 * detector makes the final determination.
 */
export function inferPxGeographyHints(
  geoDim: PxDimension,
  countryCode: string | null,
): GeographyLevel[] {
  const hints: GeographyLevel[] = [];

  // Check dimension label/id for level hints
  const idLower = geoDim.id.toLowerCase();
  const labelLower = geoDim.label.toLowerCase();

  if (idLower.includes("kommun") || labelLower.includes("kommun")) {
    hints.push("municipality");
  } else if (idLower.includes("län") || labelLower.includes("län")) {
    hints.push("county");
  } else if (idLower.includes("fylke") || labelLower.includes("fylke")) {
    hints.push("county");
  } else if (idLower.includes("kommune") || labelLower.includes("kommune")) {
    hints.push("municipality");
  } else if (idLower.includes("maakunta") || labelLower.includes("maakunta")) {
    hints.push("admin1");
  } else if (idLower === "kunta" || labelLower === "kunta") {
    hints.push("municipality");
  }

  // If no label hints, infer from code length for known countries
  if (hints.length === 0 && geoDim.values.length > 0) {
    const sampleCodes = geoDim.values
      .slice(0, Math.min(10, geoDim.values.length))
      .map((v) => v.code);

    // Filter out known aggregate codes
    const nonAggCodes = sampleCodes.filter(
      (c) => c !== "00" && c !== "0" && c.length > 0,
    );

    if (nonAggCodes.length > 0) {
      const lengths = new Set(nonAggCodes.map((c) => c.length));

      if (countryCode === "SE") {
        if (lengths.has(4)) hints.push("municipality");
        else if (lengths.has(2)) hints.push("county");
      } else if (countryCode === "NO") {
        if (lengths.has(4)) hints.push("municipality");
        else if (lengths.has(2)) hints.push("county");
      }
    }
  }

  // Fallback: if geo dimension has values, it's at least some sub-national level
  if (hints.length === 0 && geoDim.values.length > 1) {
    hints.push("unknown");
  }

  return hints;
}

/**
 * Identify candidate metric fields from PxWeb metadata.
 *
 * The "contents" dimension holds the available metrics.
 * Returns the value labels as candidate field names.
 */
export function identifyPxMetricFields(
  metadata: PxTableMetadata,
): string[] {
  const contentsDim = metadata.dimensions.find((d) => d.type === "contents");
  if (!contentsDim) return [];
  return contentsDim.values.map((v) => v.label);
}

/**
 * Build alternative dataset candidates from PxWeb search results.
 *
 * The first table is the one we actually fetch. The rest become
 * candidates the user could choose instead.
 */
export function buildPxCandidates(
  tables: PxTableInfo[],
  sourceName: string,
  skip: number = 1,
): DatasetCandidate[] {
  return tables.slice(skip, skip + 5).map((t) => ({
    id: t.id,
    label: t.label,
    description: t.description || undefined,
    source: sourceName,
    timeCoverage: t.firstPeriod && t.lastPeriod
      ? `${t.firstPeriod}–${t.lastPeriod}`
      : undefined,
  }));
}

/**
 * Build a complete NormalizedSourceResult from PxWeb artifacts.
 *
 * This is the main normalization entry point. It takes all the
 * artifacts produced by the PxWeb client pipeline and assembles
 * them into a NormalizedSourceResult.
 *
 * Pure function — no I/O, no side effects.
 */
export function normalizePxWebResult(opts: {
  metadata: PxTableMetadata;
  records: PxDataRecord[];
  selections: PxDimensionSelection[];
  geoDimId: string;
  contentsDimId: string;
  timeDimId: string;
  sourceId: string;
  sourceName: string;
  countryCode: string | null;
  prompt: string;
  searchQuery: string;
  tables: PxTableInfo[];
  language: string;
  apiType?: string;
}): NormalizedSourceResult {
  const {
    metadata,
    records,
    selections,
    geoDimId,
    contentsDimId,
    timeDimId,
    sourceId,
    sourceName,
    countryCode,
    prompt,
    searchQuery,
    tables,
    language,
  } = opts;
  const resolvedApiType = opts.apiType ?? "pxweb-v2";

  // No records → no_data
  if (records.length === 0) {
    return sourceNoData({
      sourceMetadata: {
        sourceId,
        sourceName,
        tableId: metadata.id,
        tableLabel: metadata.label,
        apiType: resolvedApiType,
        fetchedAt: Date.now(),
        language,
      },
      diagnostics: {
        originalPrompt: prompt,
        searchQuery,
        tablesFound: tables.length,
        tableSelected: metadata.id,
      },
      error: "No records in PxWeb response",
    });
  }

  // Check for geo dimension
  const geoDim = metadata.dimensions.find((d) => d.id === geoDimId);
  if (!geoDim) {
    return sourceError({
      sourceMetadata: {
        sourceId,
        sourceName,
        tableId: metadata.id,
        tableLabel: metadata.label,
        apiType: resolvedApiType,
        fetchedAt: Date.now(),
        language,
      },
      diagnostics: {
        originalPrompt: prompt,
        searchQuery,
        tablesFound: tables.length,
        tableSelected: metadata.id,
      },
      error: `Geo dimension "${geoDimId}" not found in metadata`,
    });
  }

  // Build dimension selections map for filtering
  const selectionsByDim: Record<string, Set<string>> = {};
  for (const sel of selections) {
    selectionsByDim[sel.dimensionId] = new Set(sel.valueCodes);
  }

  // Normalize dimensions, filtering geo dimension values to only selected codes.
  // This is critical: if we pass all metadata values (e.g. 9835 mixed DeSO/municipality/county
  // codes), classifyCodeShape sees mixed formats and returns pattern="unknown", causing
  // inferRenderHint to return "non_geographic" and aborting the join. By filtering to the
  // actually selected codes (e.g. 21 county codes ["01".."25"]), the detector sees clean codes.
  const dimensionsRaw = metadata.dimensions.map((d) => {
    const selectedCodes = selectionsByDim[d.id];
    if (selectedCodes && selectedCodes.size > 0) {
      return { ...d, values: d.values.filter((v) => selectedCodes.has(v.code)) };
    }
    return d;
  });
  const dimensions = normalizePxDimensions(dimensionsRaw);
  const rows = normalizePxRecords(
    records,
    geoDimId,
    contentsDimId,
    timeDimId,
    selections,
  );
  const candidateMetricFields = identifyPxMetricFields(metadata);
  const countryHints = countryCode ? [countryCode] : [];
  // Use filtered geo dim so hints reflect selected codes, not all metadata values
  const filteredGeoDim = dimensionsRaw.find((d) => d.id === geoDimId) ?? geoDim;
  const geographyHints = inferPxGeographyHints(filteredGeoDim, countryCode);
  const candidates = buildPxCandidates(tables, sourceName);

  // Confidence: PxWeb is structured, so base is decent
  // Reduce if we have few records or no geo dimension values
  let confidence = 0.7;
  if (records.length < 3) confidence -= 0.2;
  if (geoDim.values.length < 2) confidence -= 0.15;

  const dimensionSelections: Record<string, string[]> = {};
  for (const sel of selections) {
    dimensionSelections[sel.dimensionId] = sel.valueCodes;
  }

  return sourceOk({
    dimensions,
    rows,
    candidateMetricFields,
    countryHints,
    geographyHints,
    sourceMetadata: {
      sourceId,
      sourceName,
      tableId: metadata.id,
      tableLabel: metadata.label,
      apiType: resolvedApiType,
      fetchedAt: Date.now(),
      language,
    },
    diagnostics: {
      originalPrompt: prompt,
      searchQuery,
      tablesFound: tables.length,
      tableSelected: metadata.id,
      dimensionSelections,
      cellCount: records.length,
    },
    confidence: Math.max(0, confidence),
    candidates: candidates.length > 0 ? candidates : undefined,
  });
}

/**
 * Build a NormalizedSourceResult for PxWeb tables that have no
 * geographic dimension at all.
 *
 * This is a valid outcome — the data exists but can't be mapped.
 * The pipeline should present it as tabular_only.
 */
export function normalizePxNoGeoDimension(opts: {
  metadata: PxTableMetadata;
  sourceId: string;
  sourceName: string;
  prompt: string;
  searchQuery: string;
  tables: PxTableInfo[];
  language: string;
  apiType?: string;
}): NormalizedSourceResult {
  const { metadata, sourceId, sourceName, prompt, searchQuery, tables, language } = opts;
  const resolvedApiType = opts.apiType ?? "pxweb-v2";

  return {
    adapterStatus: "no_geo_dimension",
    dimensions: normalizePxDimensions(metadata.dimensions),
    rows: [],
    candidateMetricFields: identifyPxMetricFields(metadata),
    countryHints: [],
    geographyHints: [],
    sourceMetadata: {
      sourceId,
      sourceName,
      tableId: metadata.id,
      tableLabel: metadata.label,
      apiType: resolvedApiType,
      fetchedAt: Date.now(),
      language,
    },
    diagnostics: {
      originalPrompt: prompt,
      searchQuery,
      tablesFound: tables.length,
      tableSelected: metadata.id,
      warnings: ["Table has no geographic dimension — data is national aggregate or non-spatial"],
    },
    confidence: 0.3,
    candidates: buildPxCandidates(tables, sourceName),
  };
}

// ═══════════════════════════════════════════════════════════════
// Adapter contract validation
// ═══════════════════════════════════════════════════════════════

/** Validation errors for adapter output. */
export interface AdapterValidationError {
  field: string;
  message: string;
}

/**
 * Validate that a NormalizedSourceResult meets the adapter contract.
 *
 * Returns an empty array if valid, or a list of violations.
 * Useful for testing and debugging adapters.
 */
export function validateAdapterOutput(
  result: NormalizedSourceResult,
): AdapterValidationError[] {
  const errors: AdapterValidationError[] = [];

  // Required fields
  if (!result.adapterStatus) {
    errors.push({ field: "adapterStatus", message: "missing" });
  }
  if (!result.sourceMetadata) {
    errors.push({ field: "sourceMetadata", message: "missing" });
  } else {
    if (!result.sourceMetadata.sourceId) {
      errors.push({ field: "sourceMetadata.sourceId", message: "missing" });
    }
    if (!result.sourceMetadata.sourceName) {
      errors.push({ field: "sourceMetadata.sourceName", message: "missing" });
    }
    if (!result.sourceMetadata.fetchedAt) {
      errors.push({ field: "sourceMetadata.fetchedAt", message: "missing or zero" });
    }
  }
  if (!result.diagnostics) {
    errors.push({ field: "diagnostics", message: "missing" });
  } else if (!result.diagnostics.originalPrompt && result.diagnostics.originalPrompt !== "") {
    errors.push({ field: "diagnostics.originalPrompt", message: "missing" });
  }

  // Arrays must exist (even if empty)
  if (!Array.isArray(result.dimensions)) {
    errors.push({ field: "dimensions", message: "must be array" });
  }
  if (!Array.isArray(result.rows)) {
    errors.push({ field: "rows", message: "must be array" });
  }
  if (!Array.isArray(result.candidateMetricFields)) {
    errors.push({ field: "candidateMetricFields", message: "must be array" });
  }
  if (!Array.isArray(result.countryHints)) {
    errors.push({ field: "countryHints", message: "must be array" });
  }
  if (!Array.isArray(result.geographyHints)) {
    errors.push({ field: "geographyHints", message: "must be array" });
  }

  // Confidence bounds
  if (typeof result.confidence !== "number" || result.confidence < 0 || result.confidence > 1) {
    errors.push({ field: "confidence", message: "must be 0.0–1.0" });
  }

  // Status-specific validation
  if (result.adapterStatus === "ok") {
    if (result.rows.length === 0 && !result.candidates?.length) {
      errors.push({ field: "rows", message: "ok status requires rows or candidates" });
    }
  }
  if (result.adapterStatus === "error" && !result.error) {
    errors.push({ field: "error", message: "error status requires error message" });
  }

  // Dimension structure
  for (let i = 0; i < (result.dimensions?.length ?? 0); i++) {
    const dim = result.dimensions[i];
    if (!dim.id) {
      errors.push({ field: `dimensions[${i}].id`, message: "missing" });
    }
    if (!dim.role) {
      errors.push({ field: `dimensions[${i}].role`, message: "missing" });
    }
    const validRoles = ["geo", "time", "metric", "filter"];
    if (dim.role && !validRoles.includes(dim.role)) {
      errors.push({ field: `dimensions[${i}].role`, message: `invalid: "${dim.role}"` });
    }
  }

  // Row structure
  for (let i = 0; i < Math.min(result.rows?.length ?? 0, 5); i++) {
    const row = result.rows[i];
    if (!row.dimensionValues || typeof row.dimensionValues !== "object") {
      errors.push({ field: `rows[${i}].dimensionValues`, message: "must be object" });
    }
    if (row.value !== null && typeof row.value !== "number") {
      errors.push({ field: `rows[${i}].value`, message: "must be number or null" });
    }
  }

  return errors;
}
