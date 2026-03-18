import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";

// GET /api/maps/public — all public maps, no auth required.
// Returns fields needed for the explore gallery (no geojson_url — not needed for thumbnails).
// Future: add ?sort=trending|top_rated|newest, ?family=choropleth etc.
export async function GET() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("maps")
    .select("id, title, description, prompt, manifest, is_public, created_at, updated_at")
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ maps: data ?? [] });
}
