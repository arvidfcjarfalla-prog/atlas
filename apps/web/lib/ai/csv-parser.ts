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

const LAT_NAMES = new Set([
  "lat", "latitude", "y", "lat_wgs84", "breddgrad", "latitud",
]);

const LNG_NAMES = new Set([
  "lon", "lng", "longitude", "x", "lon_wgs84", "long",
  "langd", "längd", "longitud",
]);

function isLatName(name: string): boolean {
  return LAT_NAMES.has(name.toLowerCase().trim());
}

function isLngName(name: string): boolean {
  return LNG_NAMES.has(name.toLowerCase().trim());
}

// ─── CSV parser (state machine) ─────────────────────────────

function parseCSV(text: string): string[][] {
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
      } else if (ch === ",") {
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
  const sampleSize = Math.min(rows.length, 20);
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

  const headers = allRows[0].map((h) => h.trim());
  const dataRows = allRows.slice(1);

  const coords = detectCoordinateColumns(headers, dataRows);
  if (!coords) {
    return {
      featureCollection: { type: "FeatureCollection", features: [] },
      warnings: ["Could not detect latitude/longitude columns"],
      latColumn: "",
      lngColumn: "",
      skippedRows: dataRows.length,
    };
  }

  const latColumn = headers[coords.latIdx];
  const lngColumn = headers[coords.lngIdx];
  let skippedRows = 0;

  const features: GeoJSON.Feature[] = [];

  for (const row of dataRows) {
    const lat = parseFloat(row[coords.latIdx] ?? "");
    const lng = parseFloat(row[coords.lngIdx] ?? "");

    if (
      isNaN(lat) ||
      isNaN(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      skippedRows++;
      continue;
    }

    const properties: Record<string, string | number> = {};
    for (let i = 0; i < headers.length; i++) {
      if (i === coords.latIdx || i === coords.lngIdx) continue;
      const val = row[i]?.trim() ?? "";
      const num = parseFloat(val);
      // Store as number if it's a valid number, otherwise keep as string
      properties[headers[i]] = val.length > 0 && !isNaN(num) && String(num) === val
        ? num
        : val;
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
    warnings.push(`Skipped ${skippedRows} rows (${pct}%) with invalid coordinates`);
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
