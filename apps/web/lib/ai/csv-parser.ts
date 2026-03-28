/**
 * CSV-to-GeoJSON converter with automatic lat/lon column detection.
 *
 * No external dependencies — uses a simple state machine parser
 * that handles quoted fields and newlines within quotes.
 */

export interface CSVParseResult {
  featureCollection: GeoJSON.FeatureCollection;
  warnings: string[];
  latColumn: string;
  lngColumn: string;
  skippedRows: number;
}

// ─── Column name heuristics ─────────────────────────────────

/** Exact-match names (after lowercase + trim). */
const LAT_EXACT = new Set([
  "lat", "latitude", "y", "lat_wgs84", "breddgrad", "latitud",
  "lat_dd", "decimallatitude", "lat_y", "geo_lat",
  "coord_lat", "point_y",
]);

const LNG_EXACT = new Set([
  "lon", "lng", "longitude", "x", "lon_wgs84", "long",
  "langd", "längd", "longitud",
  "lng_dd", "lon_dd", "decimallongitude", "lon_x", "geo_lon", "geo_lng",
  "coord_lng", "coord_lon", "point_x",
]);

/**
 * Prefix patterns — a column starting with these (after stripping
 * non-alphanumeric chars) is a lat/lng candidate.
 * Handles "Lat (decimal degrees)", "Longitude_WGS84", etc.
 */
const LAT_PREFIXES = ["latitude", "lat"];
const LNG_PREFIXES = ["longitude", "lng", "lon", "long"];

/** Normalise a header for prefix matching: lowercase, strip parens/brackets/units. */
function normaliseHeader(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_]/g, "").trim();
}

function isLatName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (LAT_EXACT.has(lower)) return true;
  const norm = normaliseHeader(name);
  return LAT_PREFIXES.some((p) => norm.startsWith(p));
}

function isLngName(name: string): boolean {
  const lower = name.toLowerCase().trim();
  if (LNG_EXACT.has(lower)) return true;
  const norm = normaliseHeader(name);
  return LNG_PREFIXES.some((p) => norm.startsWith(p));
}

// ─── CSV parser (state machine) ─────────────────────────────

export function parseCSV(text: string): string[][] {
  const delimiter = detectDelimiter(text);
  return parseWithDelimiter(text, delimiter);
}

/**
 * Detect whether the CSV uses comma or semicolon as delimiter.
 *
 * Checks the first non-empty line (header row). If it contains more
 * semicolons than commas, uses semicolon. This handles European CSVs
 * where comma is the decimal separator and semicolon is the field
 * delimiter.
 */
function detectDelimiter(text: string): string {
  // Get first line
  const firstNewline = text.indexOf("\n");
  const firstLine = firstNewline === -1 ? text : text.slice(0, firstNewline);

  let commas = 0;
  let semicolons = 0;
  let tabs = 0;
  let inQuotes = false;

  for (const ch of firstLine) {
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ",") commas++;
      else if (ch === ";") semicolons++;
      else if (ch === "\t") tabs++;
    }
  }

  // Prefer tab if dominant (TSV files)
  if (tabs > commas && tabs > semicolons) return "\t";
  // Prefer semicolon over comma for European CSVs
  if (semicolons > commas) return ";";
  return ",";
}

function parseWithDelimiter(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++; // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === delimiter) {
        row.push(field);
        field = "";
      } else if (ch === "\n" || (ch === "\r" && next === "\n")) {
        row.push(field);
        field = "";
        if (row.some((f) => f.length > 0)) rows.push(row);
        row = [];
        if (ch === "\r") i++; // skip \n in \r\n
      } else if (ch === "\r") {
        row.push(field);
        field = "";
        if (row.some((f) => f.length > 0)) rows.push(row);
        row = [];
      } else {
        field += ch;
      }
    }
  }

  // Final field/row
  row.push(field);
  if (row.some((f) => f.length > 0)) rows.push(row);

  return rows;
}

// ─── Coordinate detection ───────────────────────────────────

function detectCoordinateColumns(
  headers: string[],
  rows: string[][],
): { latIdx: number; lngIdx: number } | null {
  // Strategy 1: Match by column name
  let latIdx = headers.findIndex((h) => isLatName(h));
  let lngIdx = headers.findIndex((h) => isLngName(h));

  if (latIdx !== -1 && lngIdx !== -1) {
    return { latIdx, lngIdx };
  }

  // Strategy 2: Find numeric columns that look like coordinates
  const sampleSize = Math.min(rows.length, 200);
  const candidates: Array<{
    idx: number;
    isLat: boolean;
    isLng: boolean;
  }> = [];

  for (let col = 0; col < headers.length; col++) {
    let validLat = 0;
    let validLng = 0;
    let total = 0;

    for (let r = 0; r < sampleSize; r++) {
      const val = parseFloat(rows[r]?.[col] ?? "");
      if (isNaN(val)) continue;
      total++;
      if (val >= -90 && val <= 90) validLat++;
      if (val >= -180 && val <= 180) validLng++;
    }

    if (total >= sampleSize * 0.8) {
      candidates.push({
        idx: col,
        isLat: validLat === total && !(validLng === total && Math.abs(parseFloat(rows[0]?.[col] ?? "0")) > 90),
        isLng: validLng === total,
      });
    }
  }

  // Try to find one lat and one lng candidate
  const latCand = candidates.find((c) => c.isLat && !c.isLng);
  const lngCand = candidates.find((c) => c.isLng);

  if (latCand && lngCand && latCand.idx !== lngCand.idx) {
    return { latIdx: latCand.idx, lngIdx: lngCand.idx };
  }

  // If we have at least 2 numeric candidates, use first pair
  if (candidates.length >= 2) {
    return { latIdx: candidates[0].idx, lngIdx: candidates[1].idx };
  }

  return null;
}

// ─── Numeric parsing ────────────────────────────────────────

/**
 * Parse a numeric string, stripping thousands separators.
 *
 * Handles:
 *   "1,234,567"     → 1234567      (US/UK thousands separator)
 *   "1,234.56"      → 1234.56      (US/UK with decimal)
 *   "1234"          → 1234
 *   "-42.5"         → -42.5
 *   "1 234"         → 1234         (space as thousands separator)
 *   ""              → NaN
 *   "abc"           → NaN
 *
 * Does NOT handle European comma-as-decimal ("1.234,56") because
 * that conflicts with the CSV comma delimiter. European decimals
 * require semicolon-delimited CSVs, handled separately.
 */
export function parseNumericValue(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return NaN;

  // Strip spaces used as thousands separators (e.g. "1 234 567")
  let cleaned = trimmed.replace(/\s/g, "");

  // Strip commas used as thousands separators (e.g. "1,234,567")
  // Only strip if the pattern looks like thousands grouping:
  // commas between digit groups, with optional decimal point
  if (/^-?[\d,]+(\.\d+)?$/.test(cleaned)) {
    cleaned = cleaned.replace(/,/g, "");
  }

  const num = parseFloat(cleaned);
  return isFinite(num) ? num : NaN;
}

// ─── Skip reason helper ─────────────────────────────────────

/** Describe why a row's coordinates are invalid — for user-facing warnings. */
function describeSkipReason(
  rawLat: string,
  rawLng: string,
  lat: number,
  lng: number,
): string {
  if (isNaN(lat) && isNaN(lng)) return `lat="${rawLat}", lng="${rawLng}" (not numeric)`;
  if (isNaN(lat)) return `lat="${rawLat}" (not numeric)`;
  if (isNaN(lng)) return `lng="${rawLng}" (not numeric)`;
  if (lat < -90 || lat > 90) return `lat=${lat} (outside -90..90)`;
  if (lng < -180 || lng > 180) return `lng=${lng} (outside -180..180)`;
  return `lat=${lat}, lng=${lng} (invalid)`;
}

// ─── Coordinate cleaning ────────────────────────────────────

/** Parse a coordinate string, handling trailing direction letters (e.g. "59.33N", "18.07W"). */
export function cleanCoordinate(raw: string): number {
  let s = raw.trim().replace(/[°'"]/g, "");
  const dir = s.slice(-1).toUpperCase();
  if ("NSEW".includes(dir) && s.length > 1) {
    s = s.slice(0, -1).trim();
    const num = parseFloat(s);
    return dir === "S" || dir === "W" ? -num : num;
  }
  return parseFloat(s);
}

// ─── Main converter ─────────────────────────────────────────

/**
 * Convert CSV text to a GeoJSON FeatureCollection.
 *
 * Automatically detects latitude/longitude columns by name heuristic
 * or by inspecting value ranges. Skips rows with invalid coordinates.
 */
export function csvToGeoJSON(csvText: string): CSVParseResult {
  const warnings: string[] = [];
  const allRows = parseCSV(csvText);

  if (allRows.length < 2) {
    return {
      featureCollection: { type: "FeatureCollection", features: [] },
      warnings: ["CSV has no data rows"],
      latColumn: "",
      lngColumn: "",
      skippedRows: 0,
    };
  }

  // Strip UTF-8 BOM from first header (common in Excel exports)
  const headers = allRows[0].map((h, i) =>
    (i === 0 ? h.replace(/^\uFEFF/, "") : h).trim(),
  );
  const dataRows = allRows.slice(1);

  const coords = detectCoordinateColumns(headers, dataRows);
  if (!coords) {
    const colList = headers.slice(0, 8).join(", ");
    const suffix = headers.length > 8 ? `, ... (${headers.length} columns total)` : "";
    return {
      featureCollection: { type: "FeatureCollection", features: [] },
      warnings: [
        `Could not detect latitude/longitude columns. ` +
        `Available columns: ${colList}${suffix}`,
      ],
      latColumn: "",
      lngColumn: "",
      skippedRows: dataRows.length,
    };
  }

  const latColumn = headers[coords.latIdx];
  const lngColumn = headers[coords.lngIdx];
  let skippedRows = 0;
  const skippedSamples: string[] = []; // first few skip reasons

  warnings.push(`Coordinates: using "${latColumn}" (lat) and "${lngColumn}" (lng)`);

  const features: GeoJSON.Feature[] = [];

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const row = dataRows[rowIdx];
    const rawLat = row[coords.latIdx] ?? "";
    const rawLng = row[coords.lngIdx] ?? "";
    const lat = cleanCoordinate(rawLat);
    const lng = cleanCoordinate(rawLng);

    if (
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      skippedRows++;
      if (skippedSamples.length < 3) {
        const reason = describeSkipReason(rawLat, rawLng, lat, lng);
        skippedSamples.push(`Row ${rowIdx + 2}: ${reason}`);
      }
      continue;
    }

    const properties: Record<string, string | number> = {};
    for (let i = 0; i < headers.length; i++) {
      if (i === coords.latIdx || i === coords.lngIdx) continue;
      const val = row[i]?.trim() ?? "";
      const num = parseNumericValue(val);
      // Store as number if parseable, otherwise keep as string
      properties[headers[i]] = !isNaN(num) ? num : val;
    }

    features.push({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [lng, lat],
      },
      properties,
    });
  }

  if (skippedRows > 0) {
    const pct = Math.round((skippedRows / dataRows.length) * 100);
    warnings.push(
      `Skipped ${skippedRows} of ${dataRows.length} rows (${pct}%) with invalid coordinates ` +
      `in columns "${latColumn}" and "${lngColumn}"`,
    );
    if (skippedSamples.length > 0) {
      warnings.push(`Sample issues: ${skippedSamples.join("; ")}`);
    }
  }

  if (skippedRows > dataRows.length * 0.5 && features.length < 10) {
    throw new Error(
      `${skippedRows} of ${dataRows.length} rows had invalid coordinates. ` +
      `Using columns "${latColumn}" (lat) and "${lngColumn}" (lng). ` +
      `Check that these are the correct coordinate columns.`,
    );
  }

  if (features.length > 100_000) {
    warnings.push(
      `Dataset has ${features.length.toLocaleString()} features. Consider using PMTiles for better performance.`,
    );
  }

  return {
    featureCollection: { type: "FeatureCollection", features },
    warnings,
    latColumn,
    lngColumn,
    skippedRows,
  };
}
