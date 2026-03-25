import { NextResponse } from "next/server";
import { createClient } from "../../../../../lib/supabase/server";
import type { Json } from "../../../../../lib/supabase/types";

type Params = { params: Promise<{ id: string }> };

// GET /api/maps/:id/versions — list versions for a map (newest first)
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const { data: map } = await supabase
    .from("maps")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!map) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("map_versions")
    .select("id, version, prompt, manifest, created_at")
    .eq("map_id", id)
    .order("version", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: data });
}

// POST /api/maps/:id/versions — create a new version snapshot
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify ownership
  const { data: map } = await supabase
    .from("maps")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!map) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { manifest: Json; prompt?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.manifest || typeof body.manifest !== "object") {
    return NextResponse.json(
      { error: "manifest is required" },
      { status: 400 },
    );
  }

  // Atomic version insert — version number computed inside a single statement
  const { data, error } = await supabase.rpc("insert_map_version", {
    p_map_id: id,
    p_manifest: body.manifest,
    p_prompt: body.prompt ?? undefined,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ version: row }, { status: 201 });
}
