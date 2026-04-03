"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { MapShell, CoordinateWidget, useMap, GeocoderControl, MeasureControl, CompareView } from "@atlas/map-core";
import type { CompiledLegendItem, TimelinePlaybackState, ChartOverlayMetadata } from "@atlas/map-core";
import { TimelinePlaybackBar, ChartOverlay } from "@atlas/map-modules";
import type { MapManifest } from "@atlas/data-models";
import { useAuth } from "@/lib/auth/use-auth";
import type { MapRow } from "@/lib/supabase/types";
import { MapContent } from "@/components/MapContent";
import { LegendOverlay } from "@/components/LegendOverlay";
import { ChatPanel } from "@/components/ChatPanel";
import { useAgentChat, type AgentMessage } from "@/lib/hooks/use-agent-chat";
import { useToast } from "@/lib/hooks/use-toast";
import { Toast } from "@/components/Toast";
import type { DatasetProfile } from "@/lib/ai/types";
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

function EmbedPanel({ slug }: { slug: string }) {
  const [embedCopied, setEmbedCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const host = typeof window !== "undefined" ? window.location.host : "atlas.app";
  const embedCode = `<iframe src="${window.location.protocol}//${host}/m/${slug}/embed" width="100%" height="500" frameborder="0" style="border-radius:8px;border:none"></iframe>`;

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

// ─── Chart overlay wrapper (needs map context) ──────────────

function ChartOverlayWrapper({ metadata }: { metadata: ChartOverlayMetadata }) {
  const { map, isReady } = useMap();
  if (!map || !isReady) return null;
  return <ChartOverlay map={map as any} metadata={metadata} />;
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
  const [legacyDataMissing, setLegacyDataMissing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const handleSaveView = useCallback((view: SavedView) => setSavedViews((prev) => [...prev, view]), []);
  const [mode, setMode] = useState<"interactive" | "presentation" | "compare">("interactive");
  const [compareManifest, setCompareManifest] = useState<MapManifest | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Creative rendering state
  const [timelineState, setTimelineState] = useState<TimelinePlaybackState | null>(null);
  const [chartOverlayMeta, setChartOverlayMeta] = useState<ChartOverlayMetadata | null>(null);

  // Chat state (only for owner)
  const [chatInput, setChatInput] = useState("");
  const [manifestHistory, setManifestHistory] = useState<MapManifest[]>([]);
  const [redoStack, setRedoStack] = useState<MapManifest[]>([]);
  const [dataProfile, setDataProfile] = useState<DatasetProfile | null>(null);
  const [initialChatMessages, setInitialChatMessages] = useState<AgentMessage[] | undefined>(undefined);
  const { toast, show: showToast } = useToast();
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const lastSaveFailedRef = useRef(false);
  const manifestRef = useRef<MapManifest | null>(null);
  manifestRef.current = manifest;
  const chatMessagesRef = useRef<AgentMessage[]>([]);
  const [draftRestore, setDraftRestore] = useState<{
    manifest: MapManifest;
    geojsonUrl: string | null;
    timestamp: number;
  } | null>(null);

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
      setCompareManifest(structuredClone(m));

      // Restore chat history
      if (Array.isArray(row.chat_history) && row.chat_history.length > 0) {
        setInitialChatMessages(row.chat_history as unknown as AgentMessage[]);
      }

      // Check for localStorage draft newer than DB
      try {
        const draftRaw = localStorage.getItem(`atlas:draft:${id}`);
        if (draftRaw) {
          const draft = JSON.parse(draftRaw);
          const dbUpdated = new Date(row.updated_at).getTime();
          if (draft.timestamp > dbUpdated && draft.manifest) {
            setDraftRestore(draft);
          } else {
            localStorage.removeItem(`atlas:draft:${id}`);
          }
        }
      } catch { /* ignore parse errors */ }

      // Prefer durable artifact, fallback to legacy cache URL
      const dataUrl = row.artifact_id
        ? `/api/datasets/${row.artifact_id}/geojson`
        : row.geojson_url ?? m.layers[0]?.sourceUrl;
      let dataLoaded = false;
      if (dataUrl) {
        try {
          const geoRes = await fetch(dataUrl);
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo?.type === "FeatureCollection") {
              setGeojsonData(geo);
              setDataProfile(profileDataset(geo));
              dataLoaded = true;
            }
          }
        } catch { /* non-fatal */ }
      }
      // Legacy maps without artifact: data is gone when cache expires
      if (!dataLoaded && row.data_status === "legacy") {
        setLegacyDataMissing(true);
      }
      setLoading(false);
    }
    load();
  }, [id, authLoading]);

  // ── Warn on navigation if dirty ────────────────────────────
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  // ── Reconnect: sync localStorage draft to Supabase ────────
  useEffect(() => {
    if (!id) return;
    const handleOnline = () => {
      if (isDirtyRef.current && manifestRef.current) {
        const m = manifestRef.current;
        fetch(`/api/maps/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifest: m as unknown as Record<string, unknown>,
            title: m.title,
          }),
        })
          .then((res) => {
            if (res.status === 401) {
              showToast("Sessionen har gått ut — logga in igen", "error");
              lastSaveFailedRef.current = true;
            } else if (!res.ok) {
              showToast("Kunde inte spara", "error");
              lastSaveFailedRef.current = true;
            } else {
              isDirtyRef.current = false;
              try { localStorage.removeItem(`atlas:draft:${id}`); } catch {}
              if (lastSaveFailedRef.current) {
                showToast("Sparad", "success");
                lastSaveFailedRef.current = false;
              }
            }
          })
          .catch(() => {
            showToast("Kunde inte spara", "error");
            lastSaveFailedRef.current = true;
          });
      }
    };
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [id]);

  // ── Save version (fire-and-forget) ─────────────────────────
  const saveVersion = useCallback(
    (m: MapManifest, prompt?: string) => {
      if (!id) return;
      fetch(`/api/maps/${id}/versions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifest: m as unknown as Record<string, unknown>,
          ...(prompt ? { prompt } : {}),
        }),
      }).catch(() => {});
    },
    [id],
  );

  // ── Auto-save ───────────────────────────────────────────────
  const autoSave = useCallback((m: MapManifest, dataUrl?: string) => {
    if (!id) return;
    isDirtyRef.current = true;

    // Write draft to localStorage immediately (offline-safe)
    try {
      localStorage.setItem(
        `atlas:draft:${id}`,
        JSON.stringify({ manifest: m, geojsonUrl: dataUrl ?? null, timestamp: Date.now() }),
      );
    } catch { /* localStorage might be full or unavailable */ }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/maps/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifest: m as unknown as Record<string, unknown>,
            title: m.title,
            ...(dataUrl ? { geojson_url: dataUrl } : {}),
            chat_history: chatMessagesRef.current
              .filter((msg) => msg.content)
              .map((msg) => ({ role: msg.role, content: msg.content })),
          }),
        });
        if (res.status === 401) {
          showToast("Sessionen har gått ut — logga in igen", "error");
          lastSaveFailedRef.current = true;
        } else if (!res.ok) {
          showToast("Kunde inte spara", "error");
          lastSaveFailedRef.current = true;
        } else {
          isDirtyRef.current = false;
          try { localStorage.removeItem(`atlas:draft:${id}`); } catch {}
          if (lastSaveFailedRef.current) {
            showToast("Sparad", "success");
            lastSaveFailedRef.current = false;
          }
        }
      } catch {
        showToast("Kunde inte spara", "error");
        lastSaveFailedRef.current = true;
      }
    }, 1000);
  }, [id, showToast]);

  // ── Periodic auto-save (30s) ────────────────────────────────
  useEffect(() => {
    if (!id) return;
    const interval = setInterval(() => {
      if (isDirtyRef.current && manifestRef.current) {
        const m = manifestRef.current;
        fetch(`/api/maps/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifest: m as unknown as Record<string, unknown>,
            title: m.title,
          }),
        })
          .then((res) => {
            if (res.status === 401) {
              showToast("Sessionen har gått ut — logga in igen", "error");
              lastSaveFailedRef.current = true;
            } else if (!res.ok) {
              showToast("Kunde inte spara", "error");
              lastSaveFailedRef.current = true;
            } else {
              isDirtyRef.current = false;
              try { localStorage.removeItem(`atlas:draft:${id}`); } catch {}
              if (lastSaveFailedRef.current) {
                showToast("Sparad", "success");
                lastSaveFailedRef.current = false;
              }
            }
          })
          .catch(() => {
            showToast("Kunde inte spara", "error");
            lastSaveFailedRef.current = true;
          });
      }
    }, 30_000);
    return () => clearInterval(interval);
  }, [id, showToast]);

  const [mapWarnings, setMapWarnings] = useState<string[]>([]);

  // ── Agent chat ──────────────────────────────────────────────
  const handleManifestUpdate = useCallback(
    (newManifest: MapManifest, dataUrl?: string) => {
      if (!manifest) return;
      saveVersion(manifest, "agent-update");
      setManifestHistory((h) => [...h, manifest]);
      setRedoStack([]);
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
    [manifest, mapRow, autoSave, saveVersion],
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

  const handleUndo = useCallback(() => {
    if (manifestHistory.length === 0 || !manifest) return;
    const prev = manifestHistory[manifestHistory.length - 1];
    setRedoStack((r) => [...r, manifest]);
    setManifest(prev);
    setManifestHistory((h) => h.slice(0, -1));
    autoSave(prev);
  }, [manifest, manifestHistory, autoSave]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0 || !manifest) return;
    const next = redoStack[redoStack.length - 1];
    setManifestHistory((h) => [...h, manifest]);
    setManifest(next);
    setRedoStack((r) => r.slice(0, -1));
    autoSave(next);
  }, [manifest, redoStack, autoSave]);

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
      setManifestHistory((h) => [...h, manifest]);
      setRedoStack([]);
      setManifest(data.manifest);
      autoSave(data.manifest);

      // Re-fetch GeoJSON for the new manifest
      const geoUrl = sourceUrl ?? data.manifest.layers[0]?.sourceUrl;
      if (geoUrl) {
        try {
          const geoRes = await fetch(
            mapRow.artifact_id
              ? `/api/datasets/${mapRow.artifact_id}/geojson`
              : geoUrl,
          );
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo?.type === "FeatureCollection") {
              setGeojsonData(geo);
              setDataProfile(profileDataset(geo));
            }
          }
        } catch { /* non-fatal */ }
      }

      showToast("Karta regenererad", "success");
    } catch {
      showToast("Regenerering misslyckades", "error");
    } finally {
      setIsRegenerating(false);
    }
  }, [mapRow, manifest, dataProfile, isRegenerating, autoSave, saveVersion, showToast]);

  // ── Keyboard shortcuts: Cmd+Z / Cmd+Shift+Z ────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if (mod && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleUndo, handleRedo]);

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
      setRedoStack([]);
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
        <ChatPanel messages={chatMessages} input={chatInput} isStreaming={chatStreaming} onInputChange={setChatInput} onSend={handleSend} onStop={abortStream} onUndo={handleUndo} canUndo={manifestHistory.length > 0} />
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
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            padding: "8px 16px",
            background: "rgba(234,179,8,0.10)",
            borderBottom: "1px solid rgba(234,179,8,0.20)",
            fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(234,179,8,0.9)",
          }}>
            <span>Osparade ändringar hittades ({new Date(draftRestore.timestamp).toLocaleTimeString("sv-SE")})</span>
            <button
              onClick={() => {
                setManifestHistory((h) => [...h, manifest]);
                setManifest(draftRestore.manifest);
                autoSave(draftRestore.manifest, draftRestore.geojsonUrl ?? undefined);
                setDraftRestore(null);
              }}
              style={{
                background: "rgba(234,179,8,0.18)", border: "1px solid rgba(234,179,8,0.35)",
                borderRadius: 6, padding: "4px 12px", fontSize: 12, fontWeight: 600,
                color: "rgba(234,179,8,0.95)", cursor: "pointer",
              }}
            >
              Återställ
            </button>
            <button
              onClick={() => {
                setDraftRestore(null);
                try { localStorage.removeItem(`atlas:draft:${id}`); } catch {}
              }}
              style={{
                background: "none", border: "none", padding: "4px 8px",
                fontSize: 12, color: "#908c85", cursor: "pointer",
              }}
            >
              Ignorera
            </button>
          </div>
        )}
        {legacyDataMissing && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
            padding: "10px 16px",
            background: "rgba(239,68,68,0.08)",
            borderBottom: "1px solid rgba(239,68,68,0.20)",
            fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(239,68,68,0.9)",
          }}>
            <span>Datan för den här kartan är inte längre tillgänglig.</span>
            {mapRow?.prompt && (
              <button
                onClick={() => router.push(`/app/map/new?prompt=${encodeURIComponent(mapRow.prompt)}`)}
                style={{
                  background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.30)",
                  borderRadius: 6, padding: "4px 14px", fontSize: 12, fontWeight: 600,
                  color: "rgba(239,68,68,0.95)", cursor: "pointer",
                }}
              >
                Skapa ny med samma fråga
              </button>
            )}
          </div>
        )}
        {mapWarnings.length > 0 && (
          <div style={{
            display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 16px",
            background: "rgba(234,179,8,0.08)", borderBottom: "1px solid rgba(234,179,8,0.20)",
            fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "rgba(234,179,8,0.85)",
          }}>
            <div style={{ flex: 1 }}>
              {mapWarnings.map((w, i) => <div key={i}>{w}</div>)}
            </div>
            <button onClick={() => setMapWarnings([])} style={{ background: "none", border: "none", color: "rgba(234,179,8,0.5)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }} title="Dismiss">&times;</button>
          </div>
        )}
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
