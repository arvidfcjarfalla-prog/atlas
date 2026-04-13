"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MapShell, CoordinateWidget } from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";
import { MapContent } from "@/components/MapContent";
import { LegendOverlay } from "@/components/LegendOverlay";
import { ChatPanel } from "@/components/ChatPanel";
import { EditorToolbar } from "@/components/EditorToolbar";
import { LayerList } from "@/components/LayerList";
import { StylePanel } from "@/components/StylePanel";
import { MapTooltip } from "@/components/MapTooltip";
import { MapQualityBar } from "@/components/MapQualityBar";
import { ZoomControls } from "@/components/ZoomControls";
import { AuthModal } from "@/components/AuthModal";
import { useAgentChat } from "@/lib/hooks/use-agent-chat";
import { useToast } from "@/lib/hooks/use-toast";
import { Toast } from "@/components/Toast";
import { useAuth } from "@/lib/auth/use-auth";
import type { User } from "@supabase/supabase-js";
import { type Stage, STAGE_LABELS } from "../_lib/pipeline-stages";
import { useMapPersist } from "@/lib/hooks/use-map-persist";
import { useMapPipeline } from "@/lib/hooks/use-map-pipeline";

// ─── Page ────────────────────────────────────────────────────

export default function NewMapPageWrapper() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "'Geist Mono',monospace", fontSize: 13, color: "#5a5752" }}>Laddar…</span>
      </div>
    }>
      <NewMapPage />
    </Suspense>
  );
}

function NewMapPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prompt = searchParams.get("prompt") ?? "";
  const templateId = searchParams.get("template");
  const artifactId = searchParams.get("artifactId");
  const { user } = useAuth();
  const { saveAndRedirect } = useMapPersist();
  const { toast, show: showToast } = useToast();

  const {
    stage,
    error,
    retryable,
    manifest,
    geojsonData,
    clarifyQuestions,
    clarifyWarning,
    tabularSuggestions,
    agencyHint,
    confirmQuestions,
    confirmAnswers,
    setManifest,
    setConfirmAnswers,
    handleAnswer,
    handleSuggestion,
    handleConfirmSubmit,
    retry,
  } = useMapPipeline({ prompt, templateId, artifactId, user, saveAndRedirect, showToast });

  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // Show auth modal after 10s for anonymous users
  useEffect(() => {
    if (stage !== "ready" || user) return;
    const timer = setTimeout(() => setAuthModalOpen(true), 10_000);
    return () => clearTimeout(timer);
  }, [stage, user]);

  // After inline auth, save the map and redirect to the persisted editor
  const handleAuthSuccess = useCallback(
    async (_authedUser: User) => {
      setAuthModalOpen(false);
      if (!manifest) return;
      const result = await saveAndRedirect({
        title: manifest.title ?? prompt.slice(0, 60),
        prompt,
        manifest,
        geojsonUrl: manifest.layers[0]?.sourceUrl,
      });
      if (!result.ok) {
        showToast("Kunde inte spara — försök igen", "error");
      }
    },
    [manifest, prompt, saveAndRedirect, showToast],
  );

  // ── Confirming ──────────────────────────────────────────
  if (stage === "confirming") {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24, padding: 24 }}>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, color: "#e4e0d8", marginBottom: 4 }}>
          {STAGE_LABELS.confirming}
        </p>
        <div style={{ maxWidth: 500, width: "100%" }}>
          {confirmQuestions.map((q) => (
            <div key={q.id} style={{ marginBottom: 20 }}>
              <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "#908c85", marginBottom: 10, textAlign: "center" }}>{q.question}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {q.options?.map((option: string) => {
                  const selected = confirmAnswers[q.id] === option;
                  return (
                    <button
                      key={option}
                      onClick={() => setConfirmAnswers((prev) => ({ ...prev, [q.id]: option }))}
                      style={{
                        fontFamily: "'Geist',sans-serif", fontSize: 13,
                        color: selected ? "#8ecba0" : "#908c85",
                        background: selected ? "rgba(142,203,160,0.10)" : "rgba(255,255,255,0.04)",
                        border: `1px solid ${selected ? "rgba(142,203,160,0.30)" : "rgba(255,255,255,0.08)"}`,
                        borderRadius: 20, padding: "7px 16px", cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                    >
                      {selected ? `\u2713 ${option}` : option}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={handleConfirmSubmit}
          style={{
            fontFamily: "'Geist',sans-serif", fontSize: 14, fontWeight: 500,
            color: "#0d1217", background: "#8ecba0",
            border: "none", borderRadius: 8, padding: "10px 28px",
            cursor: "pointer", marginTop: 4,
          }}
        >
          Skapa karta &rarr;
        </button>
        <button onClick={() => router.push("/app")} style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "#5a5752", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginTop: 4 }}>
          Tillbaka
        </button>
        <Toast toast={toast} />
      </div>
    );
  }

  // ── Needs input ──────────────────────────────────────────
  if (stage === "needs_input") {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20, padding: 24 }}>
        {clarifyWarning && (
          <div style={{ maxWidth: 500, background: "rgba(234,179,8,0.08)", border: "1px solid rgba(234,179,8,0.25)", borderRadius: 10, padding: "16px 20px", textAlign: "center" }}>
            <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(234,179,8,0.85)", margin: 0 }}>{clarifyWarning}</p>
            {agencyHint && (
              <a
                href={agencyHint.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(94,197,212,0.9)", background: "rgba(94,197,212,0.08)", border: "1px solid rgba(94,197,212,0.25)", borderRadius: 20, padding: "6px 14px", textDecoration: "none", cursor: "pointer" }}
              >
                Open {agencyHint.agencyName} portal &#x2197;
              </a>
            )}
          </div>
        )}
        {tabularSuggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", maxWidth: 500 }}>
            <p style={{ width: "100%", fontFamily: "'Geist',sans-serif", fontSize: 12, color: "#5a5752", textAlign: "center", margin: "0 0 4px" }}>Prova istället:</p>
            {tabularSuggestions.map((s, i) => (
              <button key={i} onClick={() => handleSuggestion(s)} style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(234,179,8,0.9)", background: "rgba(234,179,8,0.06)", border: "1px solid rgba(234,179,8,0.2)", borderRadius: 20, padding: "6px 14px", cursor: "pointer" }}>
                {s}
              </button>
            ))}
          </div>
        )}
        {clarifyQuestions.length > 0 && (
          <div style={{ maxWidth: 500, width: "100%" }}>
            {clarifyQuestions.map((q) => (
              <div key={q.id} style={{ marginBottom: 16 }}>
                <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "#e4e0d8", marginBottom: 10, textAlign: "center" }}>{q.question}</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                  {q.options?.map((option: string) => (
                    <button key={option} onClick={() => handleAnswer(q.id, option)} style={{
                      fontFamily: "'Geist',sans-serif", fontSize: 13,
                      color: option === q.recommended ? "#8ecba0" : "#908c85",
                      background: option === q.recommended ? "rgba(142,203,160,0.10)" : "rgba(255,255,255,0.04)",
                      border: `1px solid ${option === q.recommended ? "rgba(142,203,160,0.30)" : "rgba(255,255,255,0.08)"}`,
                      borderRadius: 20, padding: "7px 16px", cursor: "pointer",
                    }}>
                      {option === q.recommended ? `\u2713 ${option}` : option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <button onClick={() => router.push("/app")} style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "#5a5752", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", marginTop: 8 }}>
          Tillbaka
        </button>
        <Toast toast={toast} />
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────
  if (!manifest || stage === "clarifying" || stage === "generating" || stage === "fetching" || stage === "saving") {
    const PIPELINE_STEPS: { key: Stage; label: string }[] = [
      { key: "clarifying", label: "Söker data" },
      { key: "generating", label: "Genererar karta" },
      { key: "fetching", label: "Hämtar geodata" },
      { key: "saving", label: "Renderar" },
    ];
    const activeIdx = PIPELINE_STEPS.findIndex((s) => s.key === stage);

    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 32 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {PIPELINE_STEPS.map((step, i) => {
            const isDone = i < activeIdx;
            const isActive = i === activeIdx;
            const isPending = i > activeIdx;
            return (
              <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 0", opacity: isPending ? 0.35 : 1, transition: "opacity 0.4s ease" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, ...(isDone ? { background: "rgba(142,203,160,0.15)" } : isActive ? { border: "2px solid rgba(142,203,160,0.4)" } : { border: "2px solid rgba(255,255,255,0.08)" }) }}>
                  {isDone && <span style={{ color: "#8ecba0", fontSize: 13, lineHeight: 1 }}>{"\u2713"}</span>}
                  {isActive && <div style={{ width: 10, height: 10, border: "2px solid transparent", borderTop: "2px solid #8ecba0", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />}
                </div>
                <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: isDone ? "#8ecba0" : isActive ? "#e4e0d8" : "#5a5752", transition: "color 0.4s ease" }}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        {prompt && (
          <p style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "#5a5752", maxWidth: 400, textAlign: "center" }}>
            {prompt.slice(0, 80)}{prompt.length > 80 ? "\u2026" : ""}
          </p>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <Toast toast={toast} />
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────
  if (stage === "error") {
    return (
      <div style={{ minHeight: "100vh", background: "#0d1217", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, color: "rgba(239,68,68,0.8)", maxWidth: 500, textAlign: "center" }}>
          {error ?? "Något gick fel"}
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          {retryable && (
            <button onClick={retry} style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "#8ecba0", background: "rgba(142,203,160,0.1)", border: "1px solid rgba(142,203,160,0.3)", borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>
              Försök igen
            </button>
          )}
          <button onClick={() => router.push("/app")} style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "#5a5752", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
            Tillbaka
          </button>
        </div>
      </div>
    );
  }

  // ── Map rendered (fallback when save/redirect didn't happen) ──
  return <NewMapReady manifest={manifest} geojsonData={geojsonData} legendItems={legendItems} setLegendItems={setLegendItems} setManifest={setManifest} authModalOpen={authModalOpen} setAuthModalOpen={setAuthModalOpen} handleAuthSuccess={handleAuthSuccess} router={router} toast={toast} />;
}

// ─── Ready state sub-component (uses hooks) ─────────────────

function NewMapReady({
  manifest: initialManifest,
  geojsonData: initialGeojson,
  legendItems,
  setLegendItems,
  setManifest: setParentManifest,
  authModalOpen,
  setAuthModalOpen,
  handleAuthSuccess,
  router,
  toast,
}: {
  manifest: MapManifest;
  geojsonData: GeoJSON.FeatureCollection | null;
  legendItems: CompiledLegendItem[];
  setLegendItems: (items: CompiledLegendItem[]) => void;
  setManifest: (m: MapManifest) => void;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  handleAuthSuccess: (user: User) => Promise<void>;
  router: ReturnType<typeof useRouter>;
  toast: import("@/lib/hooks/use-toast").Toast | null;
}) {
  const [manifest, setManifest] = useState(initialManifest);
  const [geojsonData, setGeojsonData] = useState(initialGeojson);
  const [chatInput, setChatInput] = useState("");
  const [mapWarnings, setMapWarnings] = useState<string[]>([]);
  const [warningsDismissed, setWarningsDismissed] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleManifestUpdate = useCallback(
    (newManifest: MapManifest, dataUrl?: string) => {
      setManifest(newManifest);
      setParentManifest(newManifest);
      if (dataUrl) {
        fetch(dataUrl)
          .then((r) => r.ok ? r.json() : null)
          .then((geo) => {
            if (geo?.type === "FeatureCollection") setGeojsonData(geo);
          })
          .catch(() => {});
      }
    },
    [setParentManifest],
  );

  const handleFileUpload = useCallback(async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    try {
      const res = await fetch("/api/ai/upload-data", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMapWarnings([err.error ?? "Upload failed"]);
        return;
      }
      const data = await res.json();
      if (data.geojson) {
        setGeojsonData(data.geojson);
        if (data.warnings?.length) setMapWarnings(data.warnings);
      }
    } catch {
      setMapWarnings(["File upload failed"]);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }, [handleFileUpload]);

  const { messages, sendMessage, isStreaming, abortStream } = useAgentChat({
    manifest,
    onManifestUpdate: handleManifestUpdate,
  });

  const handleSend = useCallback(() => {
    const msg = chatInput.trim();
    if (!msg) return;
    setChatInput("");
    sendMessage(msg);
  }, [chatInput, sendMessage]);

  const mapData: GeoJSON.FeatureCollection | string =
    geojsonData ?? manifest.layers[0]?.sourceUrl ?? { type: "FeatureCollection" as const, features: [] };
  const layer = manifest.layers[0];

  const newSidebar = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: "'Geist',sans-serif" }}>
      <LayerList layers={manifest.layers} onGenerate={sendMessage} />
      <ChatPanel
        messages={messages}
        input={chatInput}
        isStreaming={isStreaming}
        onInputChange={setChatInput}
        onSend={handleSend}
        onStop={abortStream}
        onFileUpload={handleFileUpload}
      />
    </div>
  );

  const newStylePanel = (
    <StylePanel
      manifest={manifest}
      onManifestChange={(updated) => {
        setManifest(updated);
        setParentManifest(updated);
      }}
    />
  );

  const openAuth = () => setAuthModalOpen(true);

  return (
    <>
      <EditorToolbar
        title={manifest.title ?? "Ny karta"}
        onTitleChange={() => {}}
        mode="interactive"
        onModeChange={() => {}}
        onShare={openAuth}
        onBack={() => router.push("/")}
        onExportPNG={openAuth}
        onExportGeoJSON={openAuth}
      />
      {mapWarnings.length > 0 && !warningsDismissed && (
        <div style={{
          display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 16px",
          background: "rgba(234,179,8,0.08)", borderBottom: "1px solid rgba(234,179,8,0.20)",
          fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "rgba(234,179,8,0.85)",
        }}>
          <div style={{ flex: 1 }}>
            {mapWarnings.map((w, i) => <div key={i}>{w}</div>)}
          </div>
          <button onClick={() => setWarningsDismissed(true)} style={{ background: "none", border: "none", color: "rgba(234,179,8,0.5)", cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0, flexShrink: 0 }} title="Dismiss">&times;</button>
        </div>
      )}
      <div
        style={{ flex: 1, minHeight: 0, position: "relative" }}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
      >
        {isDragOver && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 50,
            background: "rgba(99,130,255,0.12)", border: "2px dashed rgba(99,130,255,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <span style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, color: "rgba(99,130,255,0.9)" }}>
              Släpp fil för att ladda data
            </span>
          </div>
        )}
        <MapShell
          manifest={manifest}
          sidebar={newSidebar}
          sidebarOpen
          sidebarWidth={230}
          panelWidth={230}
          detailPanel={newStylePanel}
          panelOpen
          overlay={<LegendOverlay layer={layer} legendItems={legendItems} />}
        >
          <MapContent manifest={manifest} data={mapData} onLegendItems={setLegendItems} onWarnings={setMapWarnings} />
          <MapTooltip layerId={layer?.id} />
          <MapQualityBar legendItems={legendItems} data={typeof mapData === "string" ? null : mapData} colorField={layer?.style?.colorField} />
          <ZoomControls />
          <CoordinateWidget />
        </MapShell>
      </div>
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
        reason="för att spara kartan"
      />
      <Toast toast={toast} />
    </>
  );
}
