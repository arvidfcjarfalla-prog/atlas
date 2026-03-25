import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "../../../lib/supabase/server";
import type { Json } from "../../../lib/supabase/types";

// GET /api/maps — list the current user's maps, newest first
// Supports ?limit=20&offset=0 query params
export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 20, 1), 100);
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  const { data, error, count } = await supabase
    .from("maps")
    .select("id, title, description, prompt, manifest, geojson_url, thumbnail_url, is_public, created_at, updated_at", { count: "exact" })
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ maps: data, total: count ?? 0 });
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
    thumbnail_url?: string;
    is_public?: boolean;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate prompt
  if (typeof body.prompt !== "string" || body.prompt.length === 0 || body.prompt.length > 2000) {
    return NextResponse.json({ error: "prompt must be a non-empty string (max 2000 chars)" }, { status: 400 });
  }

  // Validate manifest structure
  const m = body.manifest;
  if (typeof m !== "object" || m === null || Array.isArray(m)) {
    return NextResponse.json({ error: "manifest must be a JSON object" }, { status: 400 });
  }
  const mObj = m as Record<string, unknown>;
  if (
    !("version" in mObj) ||
    !Array.isArray(mObj.layers) ||
    typeof mObj.title !== "string"
  ) {
    return NextResponse.json({ error: "manifest must contain version, layers (array), and title (string)" }, { status: 400 });
  }

  // Validate optional string fields
  for (const field of ["title", "geojson_url", "thumbnail_url"] as const) {
    const val = body[field];
    if (val !== undefined && val !== null) {
      if (typeof val !== "string" || val.length > 2000) {
        return NextResponse.json({ error: `${field} must be a string (max 2000 chars)` }, { status: 400 });
      }
    }
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
      thumbnail_url: body.thumbnail_url ?? null,
      is_public: body.is_public ?? false,
    })
    .select("id, title, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ map: data }, { status: 201 });
}
