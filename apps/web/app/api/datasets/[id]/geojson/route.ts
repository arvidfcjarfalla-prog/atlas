import { NextResponse } from "next/server";
import { readDurableDataset } from "../../../../../lib/ai/tools/dataset-storage";
import { createClient } from "../../../../../lib/supabase/server";

type Params = { params: Promise<{ id: string }> };

/**
 * GET /api/datasets/:id/geojson
 *
 * Serves GeoJSON from durable Supabase Storage via artifact lookup.
 * Public artifacts: served to anyone. Private artifacts: owner only.
 */
export async function GET(
  _request: Request,
  { params }: Params,
): Promise<NextResponse> {
  const { id } = await params;

  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json(
      { error: "Invalid artifact ID" },
      { status: 400 },
    );
  }

  // Optional auth — public artifacts don't require it
  let userId: string | undefined;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userId = user?.id;
  } catch {
    /* unauthenticated is fine for public artifacts */
  }

  const geojson = await readDurableDataset(id, { userId });
  if (!geojson) {
    return NextResponse.json(
      { error: "Dataset not found or not yet stored" },
      { status: 404 },
    );
  }

  // Public artifacts (no auth needed) can be CDN-cached.
  // Private artifacts must stay private.
  const cacheControl = !userId
    ? "public, max-age=3600, s-maxage=86400"
    : "private, max-age=3600";

  return NextResponse.json(geojson, {
    headers: { "Cache-Control": cacheControl },
  });
}
