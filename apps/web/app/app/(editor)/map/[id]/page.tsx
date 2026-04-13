"use client";

import { useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { MapShell, CoordinateWidget, GeocoderControl, MeasureControl, CompareView } from "@atlas/map-core";
import type { CompiledLegendItem, TimelinePlaybackState, ChartOverlayMetadata } from "@atlas/map-core";
import { TimelinePlaybackBar } from "@atlas/map-modules";
import type { MapManifest } from "@atlas/data-models";
import { useAuth } from "@/lib/auth/use-auth";
import { MapContent } from "@/components/MapContent";
import { LegendOverlay } from "@/components/LegendOverlay";
import { ChatPanel } from "@/components/ChatPanel";
import { useAgentChat, type AgentMessage } from "@/lib/hooks/use-agent-chat";
import { useMapLoader } from "@/lib/hooks/use-map-loader";
import { useMapAutosave } from "@/lib/hooks/use-map-autosave";
import { useManifestHistory } from "@/lib/hooks/use-manifest-history";
import { useToast } from "@/lib/hooks/use-toast";
import { Toast } from "@/components/Toast";
import { profileDataset } from "@/lib/ai/profiler";
import { EditorToolbar } from "@/components/EditorToolbar";
import { LayerList } from "@/components/LayerList";
import { StylePanel } from "@/components/StylePanel";
import { MapTooltip } from "@/components/MapTooltip";
import { MapQualityBar } from "@/components/MapQualityBar";
import { ZoomControls } from "@/components/ZoomControls";
import { ShareModal } from "@/components/ShareModal";
import { exportPNG, exportGeoJSON, exportPDF, exportSVG } from "@/lib/utils/export";
import { KeyboardShortcutsOverlay } from "@/components/KeyboardShortcutsOverlay";
import { PILL_STYLE } from "../_lib/pill-style";
import { ViewsBar, type SavedView } from "../_lib/ViewsBar";
import { HeatmapControls } from "../_lib/HeatmapControls";
import { EmbedPanel } from "../_lib/EmbedPanel";
import { ChartOverlayWrapper } from "../_lib/ChartOverlayWrapper";
import { DraftRestoreBanner } from "../_lib/DraftRestoreBanner";
import { LegacyDataBanner } from "../_lib/LegacyDataBanner";
import { WarningsBanner } from "../_lib/WarningsBanner";
import { fetchGeoJSON } from "../_lib/fetch-geojson";

// ─── Map page (view + edit merged) ───────────────────────────

export default function MapPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const {
    mapRow, setMapRow,
    manifest, setManifest,
    geojsonData, setGeojsonData,
    dataProfile, setDataProfile,
    initialChatMessages,
    compareManifest,
    draftRestore, setDraftRestore,
    legacyDataMissing,
    loading,
    notFound,
  } = useMapLoader(id, authLoading);

  // View-only state (not persisted, not shared with hooks)
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const handleSaveView = useCallback((view: SavedView) => setSavedViews((prev) => [...prev, view]), []);
  const [mode, setMode] = useState<"interactive" | "presentation" | "compare">("interactive");
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [timelineState, setTimelineState] = useState<TimelinePlaybackState | null>(null);
  const [chartOverlayMeta, setChartOverlayMeta] = useState<ChartOverlayMetadata | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [mapWarnings, setMapWarnings] = useState<string[]>([]);

  const { toast, show: showToast } = useToast();
  const chatMessagesRef = useRef<AgentMessage[]>([]);

  const { autoSave, saveVersion } = useMapAutosave({
    id,
    manifest,
    chatMessagesRef,
    showToast,
  });

  const { canUndo, pushHistory, handleUndo, handleRedo } = useManifestHistory({
    manifest,
    setManifest,
    autoSave,
  });

  const isOwner = user && mapRow && mapRow.user_id === user.id;


  // ── Agent chat ──────────────────────────────────────────────
  const handleManifestUpdate = useCallback(
    (newManifest: MapManifest, dataUrl?: string) => {
      if (!manifest) return;
      saveVersion(manifest, "agent-update");
      pushHistory(manifest);
      setManifest(newManifest);
      if (dataUrl && dataUrl !== mapRow?.geojson_url) {
        // Save manifest immediately (without new data URL).
        // The data URL is only persisted after fetch validates it,
        // to prevent saving a broken geojson_url that triggers
        // artifact_id = null in PATCH.
        autoSave(newManifest);
        fetch(dataUrl)
          .then((r) => (r.ok ? r.json() : null))
          .then((geo) => {
            if (geo?.type === "FeatureCollection") {
              setGeojsonData(geo);
              setDataProfile(profileDataset(geo));
              // Data validated — persist the new URL and update mapRow
              // so handleRegenerate reads fresh values in this session.
              // The PATCH endpoint nulls artifact_id when geojson_url
              // changes, so mirror that here for in-session consistency.
              setMapRow((prev) =>
                prev
                  ? { ...prev, geojson_url: dataUrl, artifact_id: null, data_status: "legacy" as const }
                  : prev,
              );
              autoSave(newManifest, dataUrl);
            }
          })
          .catch(() => {});
      } else {
        autoSave(newManifest);
      }
    },
    [manifest, mapRow, autoSave, saveVersion, pushHistory, setManifest, setMapRow, setGeojsonData, setDataProfile],
  );

  const {
    messages: chatMessages,
    sendMessage,
    isStreaming: chatStreaming,
    abortStream,
  } = useAgentChat({
    manifest: manifest ?? ({ layers: [], basemap: "light" } as unknown as MapManifest),
    dataProfile,
    onManifestUpdate: handleManifestUpdate,
    initialMessages: initialChatMessages,
  });

  chatMessagesRef.current = chatMessages;

  const handleSend = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput("");
    sendMessage(msg);
  }, [chatInput, sendMessage]);

  // ── Regenerate map ─────────────────────────────────────────
  const [isRegenerating, setIsRegenerating] = useState(false);
  const handleRegenerate = useCallback(async () => {
    if (!mapRow?.prompt || !manifest || isRegenerating) return;
    setIsRegenerating(true);
    try {
      // sourceUrl: pass geojson_url unchanged (already encoded).
      // artifactId is the primary signal — generate-map uses it for
      // deterministic fallback when cache is cold.
      const sourceUrl = mapRow.geojson_url ?? manifest.layers[0]?.sourceUrl;

      const res = await fetch("/api/ai/generate-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: mapRow.prompt,
          ...(sourceUrl ? { sourceUrl, dataUrl: sourceUrl } : {}),
          ...(dataProfile ? { dataProfile } : {}),
          ...(mapRow.artifact_id ? { artifactId: mapRow.artifact_id } : {}),
        }),
      });

      if (!res.ok) {
        showToast("Kunde inte regenerera kartan", "error");
        return;
      }

      const data = await res.json();
      if (!data.manifest) {
        showToast("Ingen karta genererades", "error");
        return;
      }

      // Push current to history for undo
      saveVersion(manifest, "before-regenerate");
      pushHistory(manifest);
      setManifest(data.manifest);
      autoSave(data.manifest);

      // Re-fetch GeoJSON for the new manifest
      const geoUrl = sourceUrl ?? data.manifest.layers[0]?.sourceUrl;
      if (geoUrl) {
        const fetchUrl = mapRow.artifact_id
          ? `/api/datasets/${mapRow.artifact_id}/geojson`
          : geoUrl;
        const geo = await fetchGeoJSON(fetchUrl);
        if (geo) {
          setGeojsonData(geo);
          setDataProfile(profileDataset(geo));
        }
      }

      showToast("Karta regenererad", "success");
    } catch {
      showToast("Regenerering misslyckades", "error");
    } finally {
      setIsRegenerating(false);
    }
  }, [mapRow, manifest, dataProfile, isRegenerating, autoSave, saveVersion, showToast, pushHistory, setManifest, setGeojsonData, setDataProfile]);

  async function handleCopyLink() {
    const slug = mapRow?.slug ?? id;
    const url = `${window.location.origin}/m/${slug}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const handleStyleChange = useCallback(
    (updated: MapManifest) => {
      if (!manifest) return;
      pushHistory(manifest);
      setManifest(updated);
      autoSave(updated);
    },
    [manifest, autoSave, pushHistory, setManifest],
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

  const handleTogglePublic = useCallback(
    async (nextPublic: boolean): Promise<{ slug: string | null }> => {
      const res = await fetch(`/api/maps/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: nextPublic }),
      });
      if (!res.ok) return { slug: mapRow?.slug ?? null };
      const data = await res.json();
      setMapRow((prev) =>
        prev
          ? { ...prev, is_public: nextPublic, slug: data.map?.slug ?? prev.slug }
          : prev,
      );
      return { slug: data.map?.slug ?? mapRow?.slug ?? null };
    },
    [id, mapRow],
  );

  const handleExportPNG = useCallback((scale?: number) => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas");
    if (canvas) exportPNG(canvas, manifest?.title ?? "map", scale);
  }, [manifest]);

  const handleExportPDF = useCallback(async () => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas");
    if (canvas) {
      const attribution = manifest?.layers[0]?.attribution;
      await exportPDF(canvas, manifest?.title ?? "map", attribution);
    }
  }, [manifest]);

  const handleExportSVG = useCallback(() => {
    const canvas = document.querySelector<HTMLCanvasElement>("canvas.maplibregl-canvas");
    if (canvas) exportSVG(canvas, manifest?.title ?? "map");
  }, [manifest]);

  const handleExportGeoJSON = useCallback(() => {
    if (geojsonData) exportGeoJSON(geojsonData, manifest?.title ?? "map");
  }, [geojsonData, manifest]);

  const handlePromptGenerate = useCallback((prompt: string) => {
    if (!manifest || chatStreaming) return;
    sendMessage(prompt);
  }, [manifest, chatStreaming, sendMessage]);

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

    const ownerSidebar = (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "'Geist',sans-serif" }}>
        <LayerList layers={manifest.layers} onGenerate={handlePromptGenerate} />
        <div style={{ padding: "10px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 13, color: "#5a5752", flexShrink: 0 }}>&#x1F50D;</span>
          <input type="search" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Sök features…" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#e4e0d8", width: "100%", outline: "none", fontFamily: "'Geist',sans-serif" }} />
        </div>
        <ChatPanel messages={chatMessages} input={chatInput} isStreaming={chatStreaming} onInputChange={setChatInput} onSend={handleSend} onStop={abortStream} onUndo={handleUndo} canUndo={canUndo} />
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
          onShare={() => setShareModalOpen(true)}
          onBack={() => router.push("/app")}
          onExportPNG={handleExportPNG}
          onExportGeoJSON={handleExportGeoJSON}
          onExportPDF={handleExportPDF}
          onRegenerate={mapRow?.prompt ? handleRegenerate : undefined}
          isRegenerating={isRegenerating}
          onExportSVG={handleExportSVG}
          hasCompareManifest={!!compareManifest}
        />
        <ShareModal
          open={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          mapId={id}
          mapTitle={manifest.title ?? "Namnlös karta"}
          isPublic={mapRow?.is_public ?? false}
          slug={mapRow?.slug ?? null}
          onTogglePublic={handleTogglePublic}
        />
        {draftRestore && (
          <DraftRestoreBanner
            timestamp={draftRestore.timestamp}
            onRestore={() => {
              pushHistory(manifest);
              setManifest(draftRestore.manifest);
              autoSave(draftRestore.manifest, draftRestore.geojsonUrl ?? undefined);
              setDraftRestore(null);
            }}
            onDismiss={() => {
              setDraftRestore(null);
              try { localStorage.removeItem(`atlas:draft:${id}`); } catch {}
            }}
          />
        )}
        {legacyDataMissing && (
          <LegacyDataBanner
            onCreateNew={
              mapRow?.prompt
                ? () => router.push(`/app/map/new?prompt=${encodeURIComponent(mapRow.prompt)}`)
                : undefined
            }
          />
        )}
        <WarningsBanner warnings={mapWarnings} onDismiss={() => setMapWarnings([])} />

        <div
          style={{ flex: 1, minHeight: 0, position: "relative" }}
        >
          {mode === "compare" && compareManifest ? (
            <CompareView
              manifestA={compareManifest}
              manifestB={manifest}
              childrenA={
                <div style={{ position: "absolute", top: 12, left: 12, zIndex: 5, ...PILL_STYLE }}>
                  Saved
                </div>
              }
              childrenB={
                <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5, ...PILL_STYLE }}>
                  Current
                </div>
              }
            />
          ) : (
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
              <MapContent manifest={manifest} data={mapData} onLegendItems={setLegendItems} onTimelineState={setTimelineState} onChartOverlayMetadata={setChartOverlayMeta} onWarnings={setMapWarnings} />
              <MapTooltip layerId={layer?.id} />
              <MapQualityBar legendItems={legendItems} data={typeof mapData === "string" ? null : mapData} colorField={layer?.style?.colorField} />
              <ZoomControls />
              <CoordinateWidget />
              <GeocoderControl />
              <MeasureControl />
              <ViewsBar savedViews={savedViews} onSaveView={handleSaveView} />
              <HeatmapControls manifest={manifest} />
              {timelineState && <TimelinePlaybackBar state={timelineState} />}
              {chartOverlayMeta && <ChartOverlayWrapper metadata={chartOverlayMeta} />}
            </MapShell>
          )}
        </div>
        <Toast toast={toast} />
        <KeyboardShortcutsOverlay />
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
        {mapRow?.is_public && mapRow.slug && <EmbedPanel slug={mapRow.slug} />}
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
          <MapContent manifest={manifest} data={mapData} onLegendItems={setLegendItems} onTimelineState={setTimelineState} onChartOverlayMetadata={setChartOverlayMeta} />
          <MapTooltip layerId={layer?.id} />
          <MapQualityBar legendItems={legendItems} data={typeof mapData === "string" ? null : mapData} colorField={layer?.style?.colorField} />
          <ZoomControls />
          <CoordinateWidget />
          <GeocoderControl />
          {timelineState && <TimelinePlaybackBar state={timelineState} />}
          {chartOverlayMeta && <ChartOverlayWrapper metadata={chartOverlayMeta} />}
        </MapShell>
      </div>
    </>
  );
}
