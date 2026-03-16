/**
 * CSV geography resolver.
 *
 * When a CSV has no lat/lng columns but contains geographic identifiers
 * (ISO codes, region codes, country names), this module detects the
 * geography column and runs the full pipeline to join rows to polygon
 * geometry — producing a choropleth-ready FeatureCollection.
 *
 * Reuses the existing geography pipeline:
 *   detectGeoColumn → NormalizedSourceResult → detect → plan → load → join
 */

import { parseCSV } from "./csv-parser";
import type {
  NormalizedSourceResult,
  NormalizedDimension,
  NormalizedRow,
  GeographyLevel,
} from "./tools/normalized-result";
import { resolveGeometryForNormalized } from "./tools/pxweb-resolution";
import { detectGeographyWithPlugins } from "./tools/geography-detector";
import { planJoinWithPlugins } from "./tools/join-planner";
import { executeJoin } from "./tools/geometry-join";
import { collectJoinEnrichment } from "./tools/geography-plugins";

// ═══════════════════════════════════════════════════════════════
// Column detection
// ═══════════════════════════════════════════════════════════════

/** Column name patterns for known geo identifiers. */
const ISO3_NAMES = new Set([
  "iso3", "iso_a3", "iso3code", "country_code_iso3", "iso_alpha3", "cca3",
]);
const ISO2_NAMES = new Set([
  "iso2", "iso_a2", "iso2code", "country_code", "iso_alpha2", "cca2",
]);
const NAME_NAMES = new Set([
  "country", "country_name", "nation", "countryname", "country_or_area",
]);
const ADMIN1_NAME_NAMES = new Set([
  "state", "state_name", "statename", "province", "province_name",
  "region", "region_name", "regionname", "department", "bundesland",
  "admin1", "admin1_name", "estado", "uf_name", "prefecture",
  "län", "fylke", "département", "comunidad",
]);
const ISO_3166_2_NAMES = new Set([
  "iso_3166_2", "iso3166_2", "subdivision", "region_code", "state_code",
  "province_code", "admin1_code",
]);

/** Regex for ISO 3166-2 subdivision codes: XX-YYY */
const ISO_3166_2_RE = /^[A-Z]{2}-[A-Z0-9]{1,3}$/;

export type GeoColumnType = "iso3" | "iso2" | "iso_3166_2" | "name" | "admin1_name";

export interface GeoColumnDetection {
  column: string;
  columnIndex: number;
  type: GeoColumnType;
}

/**
 * Detect which CSV column contains geographic identifiers.
 *
 * Priority: ISO3 > ISO2 > ISO 3166-2 (header or values) > country name.
 */
export function detectGeoColumn(
  headers: string[],
  sampleRows: string[][],
): GeoColumnDetection | null {
  const lower = headers.map((h) => h.toLowerCase().trim());

  // ISO3 by header name
  for (let i = 0; i < headers.length; i++) {
    if (ISO3_NAMES.has(lower[i])) {
      return { column: headers[i], columnIndex: i, type: "iso3" };
    }
  }

  // ISO2 by header name
  for (let i = 0; i < headers.length; i++) {
    if (ISO2_NAMES.has(lower[i])) {
      return { column: headers[i], columnIndex: i, type: "iso2" };
    }
  }

  // ISO 3166-2 by header name
  for (let i = 0; i < headers.length; i++) {
    if (ISO_3166_2_NAMES.has(lower[i])) {
      return { column: headers[i], columnIndex: i, type: "iso_3166_2" };
    }
  }

  // ISO 3166-2 by value pattern: check if any column has >80% XX-YYY values
  const sampleSize = Math.min(sampleRows.length, 30);
  for (let col = 0; col < headers.length; col++) {
    let matches = 0;
    for (let r = 0; r < sampleSize; r++) {
      const val = sampleRows[r]?.[col]?.trim() ?? "";
      if (ISO_3166_2_RE.test(val)) matches++;
    }
    if (sampleSize > 0 && matches / sampleSize >= 0.8) {
      return { column: headers[col], columnIndex: col, type: "iso_3166_2" };
    }
  }

  // Admin1 (state/province/region) name by header name
  for (let i = 0; i < headers.length; i++) {
    if (ADMIN1_NAME_NAMES.has(lower[i])) {
      return { column: headers[i], columnIndex: i, type: "admin1_name" };
    }
  }

  // Country name by header name
  for (let i = 0; i < headers.length; i++) {
    if (NAME_NAMES.has(lower[i])) {
      return { column: headers[i], columnIndex: i, type: "name" };
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════
// Geo resolution result
// ═══════════════════════════════════════════════════════════════

export interface CsvGeoResult {
  /** Joined GeoJSON FeatureCollection (null if join failed). */
  features: GeoJSON.FeatureCollection | null;
  /** Human-readable warnings/info. */
  warnings: string[];
  /** Which column was detected as geographic. */
  geoColumn?: string;
  /** What type of codes were found. */
  geoType?: GeoColumnType;
}

// ═══════════════════════════════════════════════════════════════
// Main resolver
// ═══════════════════════════════════════════════════════════════

/**
 * Attempt to convert a CSV with geographic codes (no coordinates)
 * into a polygon FeatureCollection via the geography pipeline.
 *
 * @param csvText - Raw CSV text
 * @param countryHint - Optional ISO2 country code (e.g. "BR") to help
 *   resolve admin1 name columns when no ISO codes are present.
 *
 * Returns `{ features: null }` when no geographic column is found
 * or the join fails — never throws.
 */
export async function csvToGeoFeatures(
  csvText: string,
  countryHint?: string,
): Promise<CsvGeoResult> {
  const warnings: string[] = [];

  // ── Parse CSV ───────────────────────────────────────────────
  const allRows = parseCSV(csvText);
  if (allRows.length < 2) {
    return { features: null, warnings: ["CSV has no data rows"] };
  }

  // Strip BOM from first header
  const headers = allRows[0].map((h, i) =>
    (i === 0 ? h.replace(/^\uFEFF/, "") : h).trim(),
  );
  const dataRows = allRows.slice(1);

  // ── Detect geo column ───────────────────────────────────────
  const geo = detectGeoColumn(headers, dataRows);
  if (!geo) {
    return {
      features: null,
      warnings: ["No geographic column detected (country codes, ISO 3166-2, or country names)"],
    };
  }
  warnings.push(`Detected geographic column: "${geo.column}" (${geo.type})`);

  // ── Find first numeric column for the metric value ──────────
  const metricIdx = findMetricColumn(headers, dataRows, geo.columnIndex);
  const metricColumn = metricIdx !== -1 ? headers[metricIdx] : undefined;

  // ── Build NormalizedSourceResult ────────────────────────────
  const normalized = buildNormalized(
    headers,
    dataRows,
    geo,
    metricColumn,
    countryHint,
  );

  // ── Run geography pipeline: detect → plan → load → join ────
  try {
    const detection = detectGeographyWithPlugins(normalized);

    if (detection.renderHint === "non_geographic") {
      warnings.push("Geography detection classified data as non-geographic");
      return { features: null, warnings, geoColumn: geo.column, geoType: geo.type };
    }

    const plan = planJoinWithPlugins(detection, normalized.countryHints, normalized);

    if (!plan.mapReady || !plan.geometryLayerId) {
      warnings.push(
        `Join planner: not map-ready (strategy=${plan.strategy}, ` +
        `confidence=${plan.confidence.toFixed(2)})`,
      );
      return { features: null, warnings, geoColumn: geo.column, geoType: geo.type };
    }

    // Load geometry
    const { geometry, geometryStatus } = await resolveGeometryForNormalized(normalized);
    if (!geometry) {
      warnings.push(
        `Could not load geometry for join. The geography pipeline detected ` +
        `${geo.type} codes but no matching boundary layer could be loaded.`,
      );
      return { features: null, warnings, geoColumn: geo.column, geoType: geo.type };
    }

    // Execute join
    const enrichment = collectJoinEnrichment(normalized);
    const normalizers = enrichment.aliasNormalizers.map(({ name, normalizer }) => ({
      name,
      normalizer,
    }));

    const joinResult = executeJoin(
      plan,
      normalized.rows,
      geometry,
      geometryStatus,
      "first",
      normalizers,
    );

    if (joinResult.status !== "map_ready" || joinResult.features.length === 0) {
      warnings.push(
        `Join: ${joinResult.status} (matched=${joinResult.diagnostics.matched}, ` +
        `unmatched=${joinResult.diagnostics.unmatched}, ` +
        `coverage=${(joinResult.diagnostics.coverageRatio * 100).toFixed(0)}%)`,
      );
      if (joinResult.diagnostics.unmatchedCodes.length > 0) {
        warnings.push(
          `Unmatched codes: ${joinResult.diagnostics.unmatchedCodes.slice(0, 5).join(", ")}`,
        );
      }
      return { features: null, warnings, geoColumn: geo.column, geoType: geo.type };
    }

    // ── Attach all CSV columns to joined features ──────────────
    const fc = attachCsvProperties(
      joinResult.features,
      headers,
      dataRows,
      geo,
    );

    warnings.push(
      `Joined ${joinResult.diagnostics.matched} of ` +
      `${joinResult.diagnostics.matched + joinResult.diagnostics.unmatched} regions ` +
      `(${(joinResult.diagnostics.coverageRatio * 100).toFixed(0)}% coverage)`,
    );

    return { features: fc, warnings, geoColumn: geo.column, geoType: geo.type };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    warnings.push(`Geography pipeline error: ${msg}`);
    return { features: null, warnings, geoColumn: geo.column, geoType: geo.type };
  }
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/**
 * Find the first numeric column (not the geo column) for the metric value.
 */
function findMetricColumn(
  headers: string[],
  rows: string[][],
  skipIdx: number,
): number {
  const sampleSize = Math.min(rows.length, 20);

  for (let col = 0; col < headers.length; col++) {
    if (col === skipIdx) continue;

    let numericCount = 0;
    for (let r = 0; r < sampleSize; r++) {
      const val = rows[r]?.[col]?.trim() ?? "";
      if (val.length > 0 && isFinite(parseFloat(val))) numericCount++;
    }

    if (numericCount >= sampleSize * 0.7) return col;
  }

  return -1;
}

/**
 * Extract country hints from ISO codes.
 */
function extractCountryHints(
  dataRows: string[][],
  geo: GeoColumnDetection,
): string[] {
  const hints = new Set<string>();
  const sampleSize = Math.min(dataRows.length, 50);

  for (let r = 0; r < sampleSize; r++) {
    const val = dataRows[r]?.[geo.columnIndex]?.trim().toUpperCase() ?? "";
    switch (geo.type) {
      case "iso2":
        if (val.length === 2) hints.add(val);
        break;
      case "iso3":
        // Can't directly use as country hint (need alpha2), skip
        break;
      case "iso_3166_2":
        // Extract country prefix: "BR-SP" → "BR"
        if (val.includes("-")) hints.add(val.split("-")[0]);
        break;
      case "name":
      case "admin1_name":
        // No reliable way to get ISO2 from name
        break;
    }
  }

  return Array.from(hints);
}

/**
 * Infer geography level from the detected column type.
 */
function inferLevel(type: GeoColumnType): GeographyLevel {
  switch (type) {
    case "iso3":
    case "iso2":
    case "name":
      return "country";
    case "iso_3166_2":
    case "admin1_name":
      return "admin1";
  }
}

/**
 * Build a NormalizedSourceResult from CSV data.
 */
function buildNormalized(
  headers: string[],
  dataRows: string[][],
  geo: GeoColumnDetection,
  metricColumn: string | undefined,
  countryHint?: string,
): NormalizedSourceResult {
  // Unique geo codes
  const uniqueCodes = new Map<string, string>();
  for (const row of dataRows) {
    const raw = row[geo.columnIndex]?.trim() ?? "";
    if (raw.length > 0) {
      const key = raw.toUpperCase();
      if (!uniqueCodes.has(key)) uniqueCodes.set(key, raw);
    }
  }

  const geoDim: NormalizedDimension = {
    id: geo.column,
    label: geo.column,
    role: "geo",
    values: Array.from(uniqueCodes.entries()).map(([_key, raw]) => ({
      code: raw,
      label: raw,
    })),
  };

  const rows: NormalizedRow[] = [];
  for (const row of dataRows) {
    const geoVal = row[geo.columnIndex]?.trim() ?? "";
    if (geoVal.length === 0) continue;

    const numVal = metricColumn
      ? parseFloat(row[headers.indexOf(metricColumn)] ?? "")
      : null;

    rows.push({
      dimensionValues: { [geo.column]: geoVal },
      value: numVal !== null && isFinite(numVal) ? numVal : null,
    });
  }

  const countryHints = extractCountryHints(dataRows, geo);
  // Merge explicit country hint if provided (e.g. from search query context)
  if (countryHint && !countryHints.includes(countryHint.toUpperCase())) {
    countryHints.push(countryHint.toUpperCase());
  }
  const level = inferLevel(geo.type);

  return {
    adapterStatus: "ok",
    dimensions: [geoDim],
    rows,
    candidateMetricFields: metricColumn ? [metricColumn] : [],
    countryHints,
    geographyHints: [level],
    sourceMetadata: {
      sourceId: "csv-upload",
      sourceName: "User CSV",
      fetchedAt: Date.now(),
    },
    diagnostics: {
      originalPrompt: "CSV upload",
      cellCount: dataRows.length * headers.length,
    },
    confidence: 0.5,
  };
}

/**
 * Attach all CSV properties to joined geometry features.
 *
 * The join executor only attaches `value` from NormalizedRow.
 * We re-attach all CSV columns from the original data.
 */
function attachCsvProperties(
  joinedFeatures: GeoJSON.Feature[],
  headers: string[],
  dataRows: string[][],
  geo: GeoColumnDetection,
): GeoJSON.FeatureCollection {
  // Build lookup: geoCode → full row data
  const rowsByCode = new Map<string, Record<string, string | number>>();
  for (const row of dataRows) {
    const code = row[geo.columnIndex]?.trim() ?? "";
    if (code.length === 0 || rowsByCode.has(code.toUpperCase())) continue;

    const props: Record<string, string | number> = {};
    for (let i = 0; i < headers.length; i++) {
      const val = row[i]?.trim() ?? "";
      const num = parseFloat(val);
      props[headers[i]] =
        val.length > 0 && isFinite(num) && String(num) === val ? num : val;
    }
    rowsByCode.set(code.toUpperCase(), props);
  }

  // Merge CSV properties into joined features
  const features: GeoJSON.Feature[] = joinedFeatures.map((f) => {
    const existingProps = f.properties ?? {};
    // Find the geo code in existing properties to look up CSV data
    const geoCode =
      String(existingProps[geo.column] ?? existingProps["name"] ?? "").toUpperCase();
    const csvProps = rowsByCode.get(geoCode);

    return {
      ...f,
      properties: csvProps
        ? { ...existingProps, ...csvProps }
        : existingProps,
    };
  });

  return { type: "FeatureCollection", features };
}
