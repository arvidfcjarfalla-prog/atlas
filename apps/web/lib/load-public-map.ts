import { createClient } from "@/lib/supabase/client";
import type { MapRow } from "@/lib/supabase/types";
import type { MapManifest } from "@atlas/data-models";

export interface PublicMapData {
  map: MapRow;
  manifest: MapManifest;
  geojson: GeoJSON.FeatureCollection | null;
}

/**
 * Load a public map by slug (or id fallback).
 * Returns null if the map is not found or not public.
 */
export async function loadPublicMap(
  slug: string,
): Promise<PublicMapData | null> {
  const supabase = createClient();
  if (!supabase) return null;

  // Try by slug first, fallback to id
  let { data } = await supabase
    .from("maps")
    .select("*")
    .eq("slug", slug)
    .eq("is_public", true)
    .single();

  if (!data) {
    const byId = await supabase
      .from("maps")
      .select("*")
      .eq("id", slug)
      .eq("is_public", true)
      .single();
    data = byId.data;
  }

  if (!data) return null;

  const map = data as MapRow;
  const manifest = data.manifest as unknown as MapManifest;

  // Fetch GeoJSON: prefer durable artifact, fallback to cache URL
  let geojson: GeoJSON.FeatureCollection | null = null;
  const geoUrl = map.artifact_id
    ? `/api/datasets/${map.artifact_id}/geojson`
    : data.geojson_url ?? manifest?.layers?.[0]?.sourceUrl;
  if (geoUrl) {
    try {
      const res = await fetch(geoUrl);
      if (res.ok) {
        const geo = await res.json();
        if (geo?.type === "FeatureCollection") geojson = geo;
      }
    } catch {
      /* render without inline data */
    }
  }

  return { map, manifest, geojson };
}
