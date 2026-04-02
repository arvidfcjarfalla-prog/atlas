import { NextResponse } from "next/server";
import { createClient } from "../../../../lib/supabase/server";
import type { MapRow, MapUpdate } from "../../../../lib/supabase/types";
import { slugify } from "../../../../lib/utils/slugify";
import { promoteArtifactToPublic } from "../../../../lib/ai/tools/dataset-storage";
import { log } from "../../../../lib/logger";

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
    chat_history?: Array<{ role: string; content: string }>;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // artifact_id is NOT accepted via PATCH — only set server-side in POST
  const patch: MapUpdate = {};
  if (body.title !== undefined) patch.title = body.title;
  if (body.description !== undefined) patch.description = body.description;
  if (body.is_public !== undefined) patch.is_public = body.is_public;
  if (body.manifest !== undefined) patch.manifest = body.manifest as MapUpdate["manifest"];
  if (body.geojson_url !== undefined) patch.geojson_url = body.geojson_url;
  if (body.chat_history !== undefined) patch.chat_history = body.chat_history as MapUpdate["chat_history"];

  // When the dataset URL changes, the old artifact no longer matches.
  // Break the link so reopen uses the new geojson_url until a fresh
  // durable save creates a new artifact.
  if (body.geojson_url !== undefined) {
    const { data: current } = await supabase
      .from("maps")
      .select("geojson_url, artifact_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (current?.artifact_id && body.geojson_url !== current.geojson_url) {
      patch.artifact_id = null;
      patch.data_status = "legacy";
      log("maps.patch.artifact-unlinked", {
        mapId: id,
        oldUrl: current.geojson_url,
        newUrl: body.geojson_url,
      });
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // When publishing: auto-slug + ensure artifact is public
  if (body.is_public === true) {
    const { data: current } = await supabase
      .from("maps")
      .select("slug, title, artifact_id")
      .eq("id", id)
      .eq("user_id", user.id)
      .single();

    if (current && !current.slug) {
      patch.slug = slugify(current.title ?? "map");
    }

    // Use the in-flight artifact decision: if we already nulled it (dataset
    // URL changed in this same request), don't re-read the stale DB value.
    const effectiveArtifactId = patch.artifact_id !== undefined
      ? patch.artifact_id
      : current?.artifact_id ?? null;

    // Ensure artifact is public before allowing publish.
    // Legacy maps (no artifact_id) can still be published — degraded but functional.
    if (!effectiveArtifactId) {
      log("maps.publish.no-artifact", { mapId: id });
    } else {
      const publicArtifactId = await promoteArtifactToPublic(
        effectiveArtifactId,
        user.id,
      );
      if (!publicArtifactId) {
        return NextResponse.json(
          { error: "Could not prepare dataset for publishing" },
          { status: 500 },
        );
      }
      if (publicArtifactId !== effectiveArtifactId) {
        patch.artifact_id = publicArtifactId;
      }
    }
  }

  // RLS policy ensures only the owner can update.
  // Retry with a new slug suffix on unique constraint violation (max 3 attempts).
  let attempts = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempts++;
    const { data, error } = await supabase
      .from("maps")
      .update(patch)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id, title, is_public, slug, updated_at")
      .single();

    if (!error && data) {
      return NextResponse.json({ map: data });
    }

    // Retry slug collision (Postgres unique violation = code 23505)
    if (patch.slug && error?.code === "23505" && attempts < 3) {
      patch.slug = slugify(body.title ?? "map");
      continue;
    }

    return NextResponse.json(
      { error: error?.message ?? "Not found or unauthorized" },
      { status: error?.code === "23505" ? 409 : 404 },
    );
  }
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
