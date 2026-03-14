import { NextRequest, NextResponse } from "next/server";
import { getCachedDataSync, getCachedData } from "../../../../../lib/ai/tools/data-search";

/**
 * GET /api/geo/cached/:key
 *
 * Serves GeoJSON from the data-search cache.
 * Used by MapLibre to fetch data that was found via World Bank
 * or other public API searches during clarification.
 *
 * Checks L1 (memory) first for speed, then falls back to L2 (file).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ key: string }> },
): Promise<NextResponse> {
  const { key } = await params;

  if (!key) {
    return NextResponse.json(
      { error: "Missing cache key" },
      { status: 400 },
    );
  }

  const decodedKey = decodeURIComponent(key);

  // Try L1 (sync, fast)
  const memEntry = getCachedDataSync(decodedKey);
  if (memEntry) {
    return NextResponse.json(memEntry.data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  // Try L2 (async, file-based — promotes to L1 on hit)
  const fileEntry = await getCachedData(decodedKey);
  if (fileEntry) {
    return NextResponse.json(fileEntry.data, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  }

  return NextResponse.json(
    { error: "Cache entry not found or expired" },
    { status: 404 },
  );
}
