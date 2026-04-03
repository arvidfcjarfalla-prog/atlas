"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { MapShell } from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";
import { loadPublicMap } from "@/lib/load-public-map";
import { MapContent } from "@/components/MapContent";
import { LegendOverlay } from "@/components/LegendOverlay";

export default function EmbedPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const [manifest, setManifest] = useState<MapManifest | null>(null);
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!slug) return;

    loadPublicMap(slug).then((result) => {
      if (result) {
        setManifest(result.manifest);
        setGeojsonData(result.geojson);
      }
      setLoading(false);
    });
  }, [slug]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 32, height: 32, border: "2px solid rgba(142,203,160,0.3)", borderTop: "2px solid rgba(142,203,160,0.9)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!manifest) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "#5a5752" }}>Map could not be loaded</p>
      </div>
    );
  }

  const mapData: GeoJSON.FeatureCollection | string =
    geojsonData ?? manifest.layers[0]?.sourceUrl ?? { type: "FeatureCollection" as const, features: [] };
  const layer = manifest.layers[0];

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw" }}>
      <MapShell
        manifest={manifest}
        sidebarOpen={false}
        overlay={<LegendOverlay layer={layer} legendItems={legendItems} />}
      >
        <MapContent manifest={manifest} data={mapData} onLegendItems={setLegendItems} />
      </MapShell>

      {/* Powered by Atlas — bottom-right corner */}
      <a
        href="/"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          position: "fixed",
          bottom: 8,
          right: 8,
          zIndex: 50,
          fontFamily: "'Geist',sans-serif",
          fontSize: 10,
          color: "rgba(144,140,133,0.6)",
          textDecoration: "none",
          padding: "3px 8px",
          background: "rgba(13,18,23,0.5)",
          borderRadius: 4,
          backdropFilter: "blur(4px)",
        }}
      >
        Powered by Atlas
      </a>
    </div>
  );
}
