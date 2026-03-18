"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  MapShell,
  useBasemapLayers,
  useManifestRenderer,
} from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import { Legend, GradientLegend, ProportionalLegend } from "@atlas/map-modules";
import type { MapManifest } from "@atlas/data-models";
import type { MapRow } from "../../../lib/supabase/types";

// ─── Map content (inside MapShell context) ────────────────────

function MapContent({
  manifest,
  data,
  onLegendItems,
}: {
  manifest: MapManifest;
  data: GeoJSON.FeatureCollection | string;
  onLegendItems: (items: CompiledLegendItem[]) => void;
}) {
  useBasemapLayers({ basemap: manifest.basemap });

  const layer = manifest.layers[0];
  const { legendItems } = useManifestRenderer({ layer, data });

  useEffect(() => {
    onLegendItems(legendItems);
  }, [legendItems, onLegendItems]);

  return null;
}

// ─── Public map view ─────────────────────────────────────────

export default function PublicMapPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [map, setMap] = useState<MapRow | null>(null);
  const [geojson, setGeojson] = useState<GeoJSON.FeatureCollection | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!id) return;
    async function load() {
      const res = await fetch(`/api/maps/${id}`);
      if (!res.ok) { setNotFound(true); setLoading(false); return; }

      const json = await res.json();
      const row: MapRow = json.map;
      setMap(row);

      // Pre-fetch GeoJSON if we have a URL
      if (row.geojson_url) {
        try {
          const geoRes = await fetch(row.geojson_url);
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo?.type === "FeatureCollection") setGeojson(geo);
          }
        } catch { /* non-fatal */ }
      }

      setLoading(false);
    }
    load();
  }, [id]);

  async function handleCopyLink() {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0d14", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "rgba(248,249,251,0.35)" }}>Laddar…</span>
      </div>
    );
  }

  if (notFound || !map) {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0d14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, color: "rgba(248,249,251,0.50)" }}>Kartan hittades inte eller är inte publik.</p>
        <button onClick={() => router.push("/")} style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.40)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          Tillbaka till startsidan
        </button>
      </div>
    );
  }

  const manifest = map.manifest as unknown as MapManifest;
  const layer = manifest.layers[0];
  const mapData: GeoJSON.FeatureCollection = geojson ?? { type: "FeatureCollection", features: [] };

  const sidebar = (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-4 border-b border-border">
        <h1 className="text-heading mb-1">{map.title}</h1>
        {map.description && (
          <p className="text-caption text-muted-foreground">{map.description}</p>
        )}
      </div>

      <div className="p-4 border-b border-border">
        <h3 className="text-label font-mono uppercase text-muted-foreground mb-2">Prompt</h3>
        <p className="text-caption text-muted-foreground">{map.prompt}</p>
      </div>

      <div className="p-4 border-b border-border">
        <h3 className="text-label font-mono uppercase text-muted-foreground mb-1">Skapad</h3>
        <p className="text-caption text-muted-foreground">
          {new Date(map.created_at).toLocaleDateString("sv-SE", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>

      <div className="p-4 space-y-2 mt-auto">
        <button
          onClick={handleCopyLink}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-muted-foreground hover:bg-background/80 hover:text-foreground transition-colors duration-fast"
        >
          {copied ? "✓ Länk kopierad!" : "Kopiera länk"}
        </button>
        <a
          href="/"
          className="w-full block text-center rounded-md border border-primary/40 bg-card px-3 py-2 text-body text-primary hover:bg-primary/10 transition-colors duration-fast"
        >
          Skapa en liknande karta →
        </a>
      </div>
    </div>
  );

  return (
    <MapShell
      manifest={manifest}
      sidebar={sidebar}
      sidebarOpen
      overlay={
        layer?.legend?.type === "gradient" ? (
          <GradientLegend
            items={legendItems}
            title={layer?.legend?.title ?? layer?.label}
          />
        ) : layer?.legend?.type === "proportional" ? (
          <ProportionalLegend
            items={legendItems.filter((i) => i.radius != null) as { label: string; color: string; radius: number }[]}
            title={layer?.legend?.title ?? layer?.label}
          />
        ) : (
          <Legend
            items={legendItems}
            title={layer?.legend?.title ?? layer?.label}
          />
        )
      }
    >
      <MapContent
        manifest={manifest}
        data={mapData}
        onLegendItems={setLegendItems}
      />
    </MapShell>
  );
}
