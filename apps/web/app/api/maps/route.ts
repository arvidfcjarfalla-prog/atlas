import { NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import type { Json } from "../../../lib/supabase/types";

// GET /api/maps — list the current user's maps, newest first
export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("maps")
    .select("id, title, description, prompt, manifest, geojson_url, is_public, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ maps: data });
}

// POST /api/maps — save a new map
export async function POST(request: Request) {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    title?: string;
    description?: string;
    prompt: string;
    manifest: Json;
    geojson_url?: string;
    is_public?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.prompt || !body.manifest) {
    return NextResponse.json({ error: "prompt and manifest are required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("maps")
    .insert({
      user_id: user.id,
      title: body.title ?? "Namnlös karta",
      description: body.description ?? null,
      prompt: body.prompt,
      manifest: body.manifest,
      geojson_url: body.geojson_url ?? null,
      is_public: body.is_public ?? false,
    })
    .select("id, title, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ map: data }, { status: 201 });
}
