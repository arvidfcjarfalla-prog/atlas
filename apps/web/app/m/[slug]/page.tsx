"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MapShell, CoordinateWidget } from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";
import { createClient } from "@/lib/supabase/client";
import type { MapRow } from "@/lib/supabase/types";
import { MapContent } from "@/components/MapContent";
import { LegendOverlay } from "@/components/LegendOverlay";

export default function PublicSharePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [map, setMap] = useState<MapRow | null>(null);
  const [manifest, setManifest] = useState<MapManifest | null>(null);
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!slug) return;

    async function load() {
      const supabase = createClient();
      if (!supabase) {
        setNotFound(true);
        setLoading(false);
        return;
      }

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

      if (!data) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      setMap(data as MapRow);
      const m = data.manifest as unknown as MapManifest;
      setManifest(m);

      // Fetch GeoJSON if available
      const geoUrl = data.geojson_url ?? m?.layers?.[0]?.sourceUrl;
      if (geoUrl) {
        try {
          const res = await fetch(geoUrl);
          if (res.ok) {
            const geo = await res.json();
            if (geo?.type === "FeatureCollection") setGeojsonData(geo);
          }
        } catch {
          /* render without inline data */
        }
      }

      setLoading(false);
    }

    load();
  }, [slug]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "2px solid rgba(142,203,160,0.3)", borderTop: "2px solid rgba(142,203,160,0.9)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (notFound || !manifest) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, color: "#908c85" }}>Kartan hittades inte</p>
        <a href="/" style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "#5a5752", textDecoration: "none" }}>
          Gå till Atlas
        </a>
      </div>
    );
  }

  const mapData: GeoJSON.FeatureCollection | string =
    geojsonData ?? manifest.layers[0]?.sourceUrl ?? { type: "FeatureCollection" as const, features: [] };
  const layer = manifest.layers[0];
  const title = map?.title ?? manifest.title ?? "Karta";

  return (
    <>
      {/* Floating top bar */}
      <div style={{
        position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 16px",
        background: "rgba(13,18,23,0.72)",
        backdropFilter: "blur(16px)",
        borderBottom: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500, color: "rgba(228,224,216,0.60)" }}>Atlas</span>
          <span style={{ color: "rgba(255,255,255,0.12)" }}>|</span>
          <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "#e4e0d8", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {title}
          </span>
        </div>
        <a
          href="/app"
          style={{
            fontFamily: "'Geist',sans-serif", fontSize: 13, fontWeight: 500,
            color: "#8ecba0", background: "rgba(142,203,160,0.08)",
            border: "1px solid rgba(142,203,160,0.20)", borderRadius: 8,
            padding: "6px 14px", textDecoration: "none",
            transition: "background 150ms ease",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(142,203,160,0.15)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLAnchorElement).style.background = "rgba(142,203,160,0.08)"; }}
        >
          Öppna i Atlas
        </a>
      </div>

      <MapShell manifest={manifest} sidebarOpen={false} overlay={<LegendOverlay layer={layer} legendItems={legendItems} />}>
        <MapContent manifest={manifest} data={mapData} onLegendItems={setLegendItems} />
        <CoordinateWidget />
      </MapShell>
    </>
  );
}
