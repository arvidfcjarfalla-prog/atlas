import { NextRequest, NextResponse } from "next/server";
import { queryOverpass, resolveAmenityQuery } from "../../../../lib/ai/tools/overpass";

/**
 * GET /api/geo/overpass?type=restaurant&bbox=55.5,12.9,55.7,13.1
 *
 * Proxies an Overpass API query and returns GeoJSON.
 * Used by the clarification pipeline to serve OSM data.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;

  const type = searchParams.get("type");
  const bboxParam = searchParams.get("bbox");

  if (!type) {
    return NextResponse.json(
      { error: "Missing required parameter: type" },
      { status: 400 },
    );
  }

  if (!bboxParam) {
    return NextResponse.json(
      { error: "Missing required parameter: bbox (south,west,north,east)" },
      { status: 400 },
    );
  }

  const parts = bboxParam.split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !isFinite(n))) {
    return NextResponse.json(
      { error: "Invalid bbox format. Expected: south,west,north,east" },
      { status: 400 },
    );
  }

  const bbox = parts as [number, number, number, number];
  const query = resolveAmenityQuery(type, bbox);

  if (!query) {
    return NextResponse.json(
      { error: `Unknown type: ${type}. Try: restaurant, hotel, school, park, etc.` },
      { status: 400 },
    );
  }

  const result = await queryOverpass(query);

  if (!result) {
    return NextResponse.json(
      { error: "Overpass query failed or returned no results" },
      { status: 502 },
    );
  }

  return NextResponse.json(result);
}
