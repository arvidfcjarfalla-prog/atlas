import { NextResponse } from "next/server";
import { csvToGeoJSON } from "../../../../lib/ai/csv-parser";
import { csvToGeoFeatures } from "../../../../lib/ai/csv-geo-resolver";
import { profileDataset } from "../../../../lib/ai/profiler";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * POST /api/ai/upload-data
 *
 * Accepts a CSV file upload, converts to GeoJSON, and profiles the data.
 *
 * Two-tier conversion:
 *   Tier 1: Detect lat/lng columns → Point features (sync)
 *   Tier 2: Detect geo codes (ISO, country names) → join to polygon
 *           geometry via the geography pipeline (async)
 *
 * Request: multipart/form-data with a "file" field (.csv)
 * Response: { geojson, profile, warnings, stats }
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { error: "Missing 'file' field in form data" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` },
        { status: 400 },
      );
    }

    const name = file.name.toLowerCase();
    const isGeoJSON = name.endsWith(".geojson") || name.endsWith(".json");
    if (!isGeoJSON && !name.endsWith(".csv") && !name.endsWith(".tsv") && !name.endsWith(".txt")) {
      return NextResponse.json(
        { error: "Supported formats: .csv, .tsv, .txt, .geojson, .json" },
        { status: 400 },
      );
    }

    const text = await file.text();

    // ── GeoJSON passthrough ─────────────────────────────────
    if (isGeoJSON) {
      try {
        const parsed = JSON.parse(text);
        if (parsed?.type === "FeatureCollection" && Array.isArray(parsed.features)) {
          const profile = profileDataset(parsed);
          return NextResponse.json({
            geojson: parsed,
            profile,
            warnings: [],
            stats: { featureCount: parsed.features.length },
          });
        }
        return NextResponse.json(
          { error: "Invalid GeoJSON: expected a FeatureCollection" },
          { status: 422 },
        );
      } catch {
        return NextResponse.json(
          { error: "Failed to parse JSON file" },
          { status: 422 },
        );
      }
    }

    // ── Tier 1: lat/lng → Point features ─────────────────────
    const result = csvToGeoJSON(text);

    if (result.featureCollection.features.length > 0) {
      const profile = profileDataset(result.featureCollection);
      return NextResponse.json({
        geojson: result.featureCollection,
        profile,
        warnings: result.warnings,
        stats: {
          featureCount: result.featureCollection.features.length,
          skippedRows: result.skippedRows,
          latColumn: result.latColumn,
          lngColumn: result.lngColumn,
        },
      });
    }

    // ── Tier 2: geo codes → polygon join ─────────────────────
    const geoResult = await csvToGeoFeatures(text);

    if (geoResult.features && geoResult.features.features.length > 0) {
      const profile = profileDataset(geoResult.features);
      return NextResponse.json({
        geojson: geoResult.features,
        profile,
        warnings: geoResult.warnings,
        stats: {
          featureCount: geoResult.features.features.length,
          geoColumn: geoResult.geoColumn,
          geoType: geoResult.geoType,
        },
      });
    }

    // ── Both tiers failed ────────────────────────────────────
    return NextResponse.json(
      {
        error: "No valid features could be extracted",
        warnings: [...result.warnings, ...geoResult.warnings],
      },
      { status: 422 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to process file", detail: message },
      { status: 500 },
    );
  }
}
