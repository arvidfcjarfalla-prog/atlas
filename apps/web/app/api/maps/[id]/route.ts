import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import type { MapRow, MapUpdate } from "../../../../lib/supabase/types";
import { slugify } from "../../../../lib/utils/slugify";

type Params = { params: Promise<{ id: string }> };

// GET /api/maps/:id — fetch a single map (own or public)
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  // Fetch the map — RLS ensures only own maps and public maps are visible
  const { data, error } = await supabase
    .from("maps")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cast to MapRow so TypeScript knows the full shape
  const row = data as unknown as MapRow;

  // Extra check: non-public maps only visible to owner
  if (!row.is_public && row.user_id !== user?.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ map: row });
}

// PATCH /api/maps/:id — update title, description or is_public
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    is_public?: boolean;
    manifest?: Record<string, unknown>;
    geojson_url?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: MapUpdate = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.is_public !== undefined) patch.is_public = body.is_public;
  if (body.manifest !== undefined) patch.manifest = body.manifest as MapUpdate["manifest"];
  if (body.geojson_url !== undefined) patch.geojson_url = body.geojson_url;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Auto-generate slug when making a map public for the first time
  if (body.is_public === true) {
    const { data: current } = await supabase
      .from("maps")
      .select("slug, title")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (current && !current.slug) {
      patch.slug = slugify(current.title ?? "map");
    }
  }

  // RLS policy ensures only the owner can update
  const { data, error } = await supabase
    .from("maps")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, title, is_public, slug, updated_at")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Not found or unauthorized" }, { status: 404 });
  }

  return NextResponse.json({ map: data });
}

// DELETE /api/maps/:id — delete a map (owner only)
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { error } = await supabase
    .from("maps")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
