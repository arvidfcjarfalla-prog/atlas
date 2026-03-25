"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { MapShell, CoordinateWidget, useMap } from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";
import { useAuth } from "@/lib/auth/use-auth";
import type { MapRow } from "@/lib/supabase/types";
import { MapContent } from "@/components/MapContent";
import { LegendOverlay } from "@/components/LegendOverlay";
import { ChatPanel } from "@/components/ChatPanel";
import type { ChatMsg } from "@/components/ChatPanel";
import { EditorToolbar } from "@/components/EditorToolbar";
import { LayerList } from "@/components/LayerList";
import { StylePanel } from "@/components/StylePanel";
import { MapTooltip } from "@/components/MapTooltip";
import { ZoomControls } from "@/components/ZoomControls";

// ─── Saved views ─────────────────────────────────────────────

interface SavedView {
  name: string;
  center: [number, number];
  zoom: number;
  pitch: number;
  bearing: number;
}

const PILL_STYLE: React.CSSProperties = {
  background: "rgba(12,16,24,0.75)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 6,
  padding: "4px 10px",
  fontSize: 11,
  fontFamily: "'Geist',sans-serif",
  color: "rgba(200,210,225,0.7)",
  cursor: "pointer",
  whiteSpace: "nowrap" as const,
  lineHeight: 1.4,
};

function ViewsBar({ savedViews, onSaveView }: { savedViews: SavedView[]; onSaveView: (view: SavedView) => void }) {
  const { map, isReady } = useMap();

  const handleSave = useCallback(() => {
    if (!map || !isReady) return;
    const center = map.getCenter();
    const name = window.prompt("Namnge vyn:");
    if (!name?.trim()) return;
    onSaveView({ name: name.trim(), center: [center.lng, center.lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing() });
  }, [map, isReady, onSaveView]);

  const handleFly = useCallback((view: SavedView) => {
    if (!map || !isReady) return;
    map.flyTo({ center: view.center, zoom: view.zoom, pitch: view.pitch, bearing: view.bearing, duration: 1200 });
  }, [map, isReady]);

  return (
    <div style={{ position: "absolute", top: 12, left: 12, display: "flex", gap: 6, zIndex: 5 }}>
      {savedViews.map((view, i) => (
        <button key={i} style={PILL_STYLE} onClick={() => handleFly(view)}>{view.name}</button>
      ))}
      <button style={PILL_STYLE} onClick={handleSave} title="Spara nuvarande vy">+</button>
    </div>
  );
}

// ─── Heatmap controls ────────────────────────────────────────

function HeatmapControls({ manifest }: { manifest: MapManifest }) {
  const { map, isReady } = useMap();
  const [radius, setRadius] = useState(30);
  const [intensity, setIntensity] = useState(1.0);

  if (manifest.layers[0]?.style.mapFamily !== "heatmap") return null;

  const layerId = manifest.layers[0].id;

  function updateRadius(val: number) {
    setRadius(val);
    if (!map || !isReady) return;
    const style = map.getStyle();
    const heatLayer = style?.layers?.find((l) => l.id.includes(layerId) && l.type === "heatmap");
    if (heatLayer) map.setPaintProperty(heatLayer.id, "heatmap-radius", val);
  }

  function updateIntensity(val: number) {
    setIntensity(val);
    if (!map || !isReady) return;
    const style = map.getStyle();
    const heatLayer = style?.layers?.find((l) => l.id.includes(layerId) && l.type === "heatmap");
    if (heatLayer) map.setPaintProperty(heatLayer.id, "heatmap-intensity", val);
  }

  return (
    <div style={{ position: "absolute", bottom: 40, left: 12, background: "rgba(12,16,24,0.82)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 16px", width: 180, display: "flex", flexDirection: "column", gap: 12, zIndex: 10 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, color: "rgba(200,210,225,0.6)" }}>Radie</label>
          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "rgba(200,210,225,0.45)" }}>{radius}</span>
        </div>
        <input type="range" min={5} max={80} step={1} value={radius} onChange={(e) => updateRadius(Number(e.target.value))} style={{ width: "100%", accentColor: "#8ecba0", cursor: "pointer" }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <label style={{ fontFamily: "'Geist',sans-serif", fontSize: 11, color: "rgba(200,210,225,0.6)" }}>Intensitet</label>
          <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "rgba(200,210,225,0.45)" }}>{intensity.toFixed(1)}</span>
        </div>
        <input type="range" min={0.1} max={3.0} step={0.1} value={intensity} onChange={(e) => updateIntensity(Number(e.target.value))} style={{ width: "100%", accentColor: "#8ecba0", cursor: "pointer" }} />
      </div>
    </div>
  );
}

// ─── Embed panel ─────────────────────────────────────────────

function EmbedPanel({ mapId }: { mapId: string }) {
  const [embedCopied, setEmbedCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const host = typeof window !== "undefined" ? window.location.host : "atlas.app";
  const embedCode = `<iframe src="https://${host}/maps/${mapId}?embed=true" width="100%" height="500" frameborder="0" style="border-radius:8px;border:none"></iframe>`;

  async function handleCopyEmbed() {
    await navigator.clipboard.writeText(embedCode).catch(() => {});
    setEmbedCopied(true);
    setTimeout(() => setEmbedCopied(false), 2000);
  }

  return (
    <div>
      <button onClick={() => setOpen((v) => !v)} style={{ width: "100%", padding: "7px 12px", fontSize: 12, fontFamily: "'Geist',sans-serif", color: "#908c85", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, cursor: "pointer" }}>
        {open ? "Stäng embed" : "Bädda in karta"}
      </button>
      {open && (
        <div style={{ marginTop: 8, background: "#0d1217", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", padding: "10px 12px" }}>
          <pre style={{ fontFamily: "'Geist Mono',monospace", fontSize: 11, color: "#908c85", whiteSpace: "pre-wrap", wordBreak: "break-all", margin: 0, lineHeight: 1.6 }}>
            {embedCode}
          </pre>
          <button onClick={handleCopyEmbed} style={{ marginTop: 8, width: "100%", fontFamily: "'Geist',sans-serif", fontSize: 12, padding: "5px 0", borderRadius: 4, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: embedCopied ? "#8ecba0" : "#908c85", cursor: "pointer" }}>
            {embedCopied ? "\u2713 Kopierad!" : "Kopiera"}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Map page (view + edit merged) ───────────────────────────

export default function MapPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [mapRow, setMapRow] = useState<MapRow | null>(null);
  const [manifest, setManifest] = useState<MapManifest | null>(null);
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const handleSaveView = useCallback((view: SavedView) => setSavedViews((prev) => [...prev, view]), []);
  const [mode, setMode] = useState<"interactive" | "presentation">("interactive");

  // Chat state (only for owner)
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Kartan är redo! Beskriv vad du vill ändra — färger, zoom, data, lager, etc." },
  ]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [manifestHistory, setManifestHistory] = useState<MapManifest[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isOwner = user && mapRow && mapRow.user_id === user.id;

  // ── Load map ────────────────────────────────────────────────
  useEffect(() => {
    if (!id || authLoading) return;
    async function load() {
      const res = await fetch(`/api/maps/${id}`);
      if (!res.ok) { setNotFound(true); setLoading(false); return; }
      const json = await res.json();
      const row: MapRow = json.map;
      setMapRow(row);
      const m = row.manifest as unknown as MapManifest;
      setManifest(m);

      const dataUrl = row.geojson_url ?? m.layers[0]?.sourceUrl;
      if (dataUrl) {
        try {
          const geoRes = await fetch(dataUrl);
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo?.type === "FeatureCollection") setGeojsonData(geo);
          }
        } catch { /* non-fatal */ }
      }
      setLoading(false);
    }
    load();
  }, [id, authLoading]);

  // ── Auto-save ───────────────────────────────────────────────
  const autoSave = useCallback((m: MapManifest, dataUrl?: string) => {
    if (!id) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await fetch(`/api/maps/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manifest: m as unknown as Record<string, unknown>, title: m.title, ...(dataUrl ? { geojson_url: dataUrl } : {}) }),
        });
      } catch { /* non-critical */ }
    }, 1000);
  }, [id]);

  // ── Chat ────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || !manifest || chatLoading) return;
    setChatInput("");
    setChatMessages((prev) => [...prev, { role: "user", content: msg }]);
    setChatLoading(true);

    try {
      const res = await fetch("/api/ai/edit-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ manifest, message: msg, chatHistory: chatMessages.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();

      if (data.undo && manifestHistory.length > 0) {
        const prev = manifestHistory[manifestHistory.length - 1];
        setManifest(prev);
        setManifestHistory((h) => h.slice(0, -1));
        autoSave(prev);
      } else if (data.manifest) {
        setManifestHistory((h) => [...h, manifest]);
        setManifest(data.manifest);
        const newDataUrl = data.dataUrl ?? data.manifest?.layers?.[0]?.sourceUrl;
        if (newDataUrl && newDataUrl !== mapRow?.geojson_url) {
          try {
            const geoRes = await fetch(newDataUrl);
            if (geoRes.ok) {
              const geo = await geoRes.json();
              if (geo?.type === "FeatureCollection") setGeojsonData(geo);
            }
          } catch { /* non-fatal */ }
          autoSave(data.manifest, newDataUrl);
        } else {
          autoSave(data.manifest);
        }
      }

      setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "Klart.", changes: data.changes }]);
    } catch {
      setChatMessages((prev) => [...prev, { role: "assistant", content: "Något gick fel. Försök igen." }]);
    }
    setChatLoading(false);
  }, [chatInput, manifest, chatLoading, chatMessages, manifestHistory, mapRow, autoSave]);

  const handleUndo = useCallback(() => {
    if (manifestHistory.length === 0 || !manifest) return;
    const prev = manifestHistory[manifestHistory.length - 1];
    setManifest(prev);
    setManifestHistory((h) => h.slice(0, -1));
    setChatMessages((p) => [...p, { role: "assistant", content: "Ångrade senaste ändringen." }]);
    autoSave(prev);
  }, [manifest, manifestHistory, autoSave]);

  async function handleCopyLink() {
    const slug = mapRow?.slug ?? id;
    const url = `${window.location.origin}/m/${slug}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const handleStyleChange = useCallback(
    (updated: MapManifest) => {
      setManifestHistory((h) => [...h, manifest!]);
      setManifest(updated);
      autoSave(updated);
    },
    [manifest, autoSave],
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      if (!manifest) return;
      const updated = { ...manifest, title: newTitle };
      setManifest(updated);
      setMapRow((prev) => (prev ? { ...prev, title: newTitle } : prev));
      autoSave(updated);
    },
    [manifest, autoSave],
  );

  // ── Loading / not found ──────────────────────────────────────
  if (loading || authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#5a5752" }}>Laddar…</span>
      </div>
    );
  }

  if (notFound || !manifest) {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, color: "#908c85" }}>Kartan hittades inte.</p>
        <button onClick={() => router.push("/app/gallery")} style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "#5a5752", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
          Tillbaka till galleri
        </button>
      </div>
    );
  }

  const filteredData = (() => {
    if (!geojsonData) return null;
    if (!searchQuery.trim()) return geojsonData;
    const lower = searchQuery.toLowerCase();
    return { ...geojsonData, features: geojsonData.features.filter((f) => { const name = (f.properties?.name ?? f.properties?.NAME ?? "").toString().toLowerCase(); return name.includes(lower); }) };
  })();

  const mapData: GeoJSON.FeatureCollection | string = filteredData ?? manifest.layers[0]?.sourceUrl ?? { type: "FeatureCollection" as const, features: [] };
  const layer = manifest.layers[0];

  // ── Owner: show edit sidebar with chat ──────────────────────
  if (isOwner) {
    const isInteractive = mode === "interactive";

    const handlePromptGenerate = useCallback(async (prompt: string) => {
      if (!manifest || chatLoading) return;
      setChatMessages((prev) => [...prev, { role: "user", content: prompt }]);
      setChatLoading(true);
      try {
        const res = await fetch("/api/ai/edit-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ manifest, message: prompt, chatHistory: chatMessages.map((m) => ({ role: m.role, content: m.content })) }),
        });
        const data = await res.json();
        if (data.manifest) {
          setManifestHistory((h) => [...h, manifest]);
          setManifest(data.manifest);
          autoSave(data.manifest);
        }
        setChatMessages((prev) => [...prev, { role: "assistant", content: data.reply ?? "Klart." }]);
      } catch {
        setChatMessages((prev) => [...prev, { role: "assistant", content: "Något gick fel. Försök igen." }]);
      }
      setChatLoading(false);
    }, [manifest, chatLoading, chatMessages, autoSave]);

    const ownerSidebar = (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "'Geist',sans-serif" }}>
        <LayerList layers={manifest.layers} onGenerate={handlePromptGenerate} />
        <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#5a5752", flexShrink: 0 }}>&#x1F50D;</span>
          <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Sök features…" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#e4e0d8", width: "100%", outline: "none", fontFamily: "'Geist',sans-serif" }} />
        </div>
        <ChatPanel messages={chatMessages} input={chatInput} loading={chatLoading} onInputChange={setChatInput} onSend={handleSend} onUndo={handleUndo} canUndo={manifestHistory.length > 0} />
      </div>
    );

    const stylePanel = <StylePanel manifest={manifest} onManifestChange={handleStyleChange} />;

    return (
      <>
        <EditorToolbar
          title={manifest.title ?? "Namnlös karta"}
          onTitleChange={handleTitleChange}
          mode={mode}
          onModeChange={setMode}
          onShare={handleCopyLink}
          onBack={() => router.push("/app")}
        />
        <div style={{ flex: 1, minHeight: 0 }}>
          <MapShell
            manifest={manifest}
            sidebar={isInteractive ? ownerSidebar : undefined}
            sidebarOpen={isInteractive}
            detailPanel={isInteractive ? stylePanel : undefined}
            panelOpen={isInteractive}
            sidebarWidth={230}
            panelWidth={230}
            overlay={<LegendOverlay layer={layer} legendItems={legendItems} />}
          >
            <MapContent manifest={manifest} data={mapData} onLegendItems={setLegendItems} />
            <MapTooltip layerId={layer?.id} />
            <ZoomControls />
            <CoordinateWidget />
            <ViewsBar savedViews={savedViews} onSaveView={handleSaveView} />
            <HeatmapControls manifest={manifest} />
          </MapShell>
        </div>
      </>
    );
  }

  // ── Non-owner: read-only view sidebar ──────────────────────
  const sidebar = (
    <div className="flex flex-col h-full overflow-auto">
      <div className="p-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "#e4e0d8", marginBottom: 4 }}>{mapRow?.title}</h1>
        {mapRow?.description && <p style={{ fontSize: 13, color: "#908c85" }}>{mapRow.description}</p>}
      </div>
      <div className="p-4 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <h3 style={{ fontFamily: "'Geist Mono',monospace", fontSize: 10, color: "#5a5752", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Prompt</h3>
        <p style={{ fontSize: 13, color: "#908c85" }}>{mapRow?.prompt}</p>
      </div>
      <div className="p-4 space-y-2 mt-auto">
        <button onClick={handleCopyLink} style={{ width: "100%", padding: "8px 12px", fontSize: 13, fontFamily: "'Geist',sans-serif", color: copied ? "#8ecba0" : "#908c85", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, cursor: "pointer" }}>
          {copied ? "\u2713 Länk kopierad!" : "Kopiera länk"}
        </button>
        {mapRow?.is_public && <EmbedPanel mapId={id} />}
        <a href="/app" style={{ display: "block", width: "100%", padding: "8px 12px", fontSize: 13, fontFamily: "'Geist',sans-serif", color: "#908c85", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, textDecoration: "none", textAlign: "center" }}>
          Skapa en liknande karta →
        </a>
      </div>
    </div>
  );

  return (
    <>
      <EditorToolbar
        title={manifest.title ?? "Karta"}
        onTitleChange={() => {}}
        mode="interactive"
        onModeChange={() => {}}
        onShare={handleCopyLink}
        onBack={() => router.push("/app")}
      />
      <div style={{ flex: 1, minHeight: 0 }}>
        <MapShell manifest={manifest} sidebar={sidebar} sidebarOpen overlay={<LegendOverlay layer={layer} legendItems={legendItems} />}>
          <MapContent manifest={manifest} data={mapData} onLegendItems={setLegendItems} />
          <MapTooltip layerId={layer?.id} />
          <ZoomControls />
          <CoordinateWidget />
        </MapShell>
      </div>
    </>
  );
}
