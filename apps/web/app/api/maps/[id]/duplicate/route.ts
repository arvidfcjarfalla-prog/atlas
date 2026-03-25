import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import type { Json } from "../../../../../lib/supabase/types";

type Params = { params: Promise<{ id: string }> };

// POST /api/maps/:id/duplicate — create a copy of a public map for the current user
export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Fetch the source map — RLS allows reading public maps
  const { data: source, error: fetchError } = await supabase
    .from("maps")
    .select("title, manifest, geojson_url, prompt")
    .eq("id", id)
    .single();

  if (fetchError || !source) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Create a copy owned by the current user
  const { data: copy, error: insertError } = await supabase
    .from("maps")
    .insert({
      user_id: user.id,
      title: `${source.title} (kopia)`,
      prompt: source.prompt ?? "",
      manifest: source.manifest as Json,
      geojson_url: source.geojson_url,
      is_public: false,
    })
    .select("id")
    .single();

  if (insertError || !copy) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to duplicate" },
      { status: 500 },
    );
  }

  return NextResponse.json({ map: { id: copy.id } }, { status: 201 });
}
