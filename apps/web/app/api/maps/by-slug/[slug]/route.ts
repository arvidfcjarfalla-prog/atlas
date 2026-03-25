import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import { getServiceClient } from "../../../../../lib/supabase/service";
import type { MapRow } from "../../../../../lib/supabase/types";

type Params = { params: Promise<{ slug: string }> };

// GET /api/maps/by-slug/:slug — fetch a public map by slug with visibility status
// Returns: { map, status: "public"|"owner" } or { status: "private"|"not_found" }
export async function GET(_request: Request, { params }: Params) {
  const { slug } = await params;
  const supabase = await createClient();

  // Try to fetch via RLS (returns public maps + user's own maps)
  let { data } = await supabase
    .from("maps")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!data) {
    const byId = await supabase
      .from("maps")
      .select("*")
      .eq("id", slug)
      .single();
    data = byId.data;
  }

  if (data) {
    const row = data as unknown as MapRow;
    if (row.is_public) {
      return NextResponse.json({ map: row, status: "public" });
    }
    // Visible but not public → user is the owner
    return NextResponse.json({ map: row, status: "owner" });
  }

  // Not visible via RLS — check if it exists but is private (requires service role)
  const service = getServiceClient();
  if (service) {
    let { count } = await service
      .from("maps")
      .select("id", { count: "exact", head: true })
      .eq("slug", slug);

    if (!count) {
      const byId = await service
        .from("maps")
        .select("id", { count: "exact", head: true })
        .eq("id", slug);
      count = byId.count;
    }

    if (count && count > 0) {
      return NextResponse.json({ status: "private" }, { status: 403 });
    }
  }

  return NextResponse.json({ status: "not_found" }, { status: 404 });
}
