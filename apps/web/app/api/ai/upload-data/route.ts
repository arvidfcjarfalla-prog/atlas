import { NextResponse } from "next/server";
import { csvToGeoJSON } from "../../../../lib/ai/csv-parser";
import { profileDataset } from "../../../../lib/ai/profiler";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

/**
 * POST /api/ai/upload-data
 *
 * Accepts a CSV file upload, converts to GeoJSON, and profiles the data.
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
    if (!name.endsWith(".csv") && !name.endsWith(".tsv") && !name.endsWith(".txt")) {
      return NextResponse.json(
        { error: "Only CSV files are supported (.csv, .tsv, .txt)" },
        { status: 400 },
      );
    }

    const text = await file.text();
    const result = csvToGeoJSON(text);

    if (result.featureCollection.features.length === 0) {
      return NextResponse.json(
        {
          error: "No valid features could be extracted",
          warnings: result.warnings,
        },
        { status: 422 },
      );
    }

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
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to process file", detail: message },
      { status: 500 },
    );
  }
}
