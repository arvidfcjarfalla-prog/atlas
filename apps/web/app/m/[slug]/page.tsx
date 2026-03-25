"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { MapShell, CoordinateWidget } from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";
import type { MapRow } from "@/lib/supabase/types";
import { useAuth } from "@/lib/auth/use-auth";
import { loadPublicMap } from "@/lib/load-public-map";
import { MapContent } from "@/components/MapContent";
import { LegendOverlay } from "@/components/LegendOverlay";

export default function PublicSharePage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [map, setMap] = useState<MapRow | null>(null);
  const [manifest, setManifest] = useState<MapManifest | null>(null);
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  useEffect(() => {
    if (!slug) return;

    loadPublicMap(slug).then(async (result) => {
      if (result) {
        setMap(result.map);
        setManifest(result.manifest);
        setGeojsonData(result.geojson);
        setLoading(false);
        return;
      }
      // Map not visible via RLS — check if it's private or doesn't exist
      try {
        const res = await fetch(`/api/maps/by-slug/${encodeURIComponent(slug)}`);
        if (res.status === 403) {
          setIsPrivate(true);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      }
      setLoading(false);
    });
  }, [slug]);

  const handleOpenInAtlas = useCallback(async () => {
    if (!map) return;

    // Not logged in → redirect to login, then back here
    if (!user) {
      router.push(`/auth/login?redirect=/m/${slug}`);
      return;
    }

    // Owner → open directly in editor
    if (user.id === map.user_id) {
      router.push(`/app/map/${map.id}`);
      return;
    }

    // Non-owner → duplicate, then open the copy
    setDuplicating(true);
    try {
      const res = await fetch(`/api/maps/${map.id}/duplicate`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        router.push(`/app/map/${data.map.id}`);
      }
    } catch {
      /* fall through */
    }
    setDuplicating(false);
  }, [map, user, slug, router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "2px solid rgba(142,203,160,0.3)", borderTop: "2px solid rgba(142,203,160,0.9)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (isPrivate) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12 }}>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, color: "#908c85" }}>Den här kartan är privat</p>
        <a href="/" style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "#5a5752", textDecoration: "none" }}>
          Gå till Atlas
        </a>
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
        <button
          onClick={handleOpenInAtlas}
          disabled={duplicating || authLoading}
          style={{
            fontFamily: "'Geist',sans-serif", fontSize: 13, fontWeight: 500,
            color: "#8ecba0", background: "rgba(142,203,160,0.08)",
            border: "1px solid rgba(142,203,160,0.20)", borderRadius: 8,
            padding: "6px 14px", cursor: duplicating ? "wait" : "pointer",
            transition: "background 150ms ease",
            opacity: duplicating ? 0.6 : 1,
          }}
          onMouseEnter={(e) => { if (!duplicating) (e.currentTarget as HTMLButtonElement).style.background = "rgba(142,203,160,0.15)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "rgba(142,203,160,0.08)"; }}
        >
          {duplicating ? "Kopierar…" : "Öppna i Atlas"}
        </button>
      </div>

      <MapShell manifest={manifest} sidebarOpen={false} overlay={<LegendOverlay layer={layer} legendItems={legendItems} />}>
        <MapContent manifest={manifest} data={mapData} onLegendItems={setLegendItems} />
        <CoordinateWidget />
      </MapShell>
    </>
  );
}
