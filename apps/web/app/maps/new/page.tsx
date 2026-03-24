"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { MapShell, CoordinateWidget } from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";
import { MapContent } from "../../../components/MapContent";
import { LegendOverlay } from "../../../components/LegendOverlay";
import { createClient } from "../../../lib/supabase/client";
import { decideClarifyAction } from "../../../lib/ai/clarify-action";
import type { ClarifyResponse } from "../../../lib/ai/types";

// ─── Pipeline stages ─────────────────────────────────────────

type Stage = "clarifying" | "generating" | "fetching" | "ready" | "saving" | "error";

const STAGE_LABELS: Record<Stage, string> = {
  clarifying: "Söker data…",
  generating: "Genererar karta…",
  fetching: "Hämtar geodata…",
  ready: "Klar!",
  saving: "Sparar…",
  error: "Något gick fel",
};

// ─── Page ────────────────────────────────────────────────────

export default function NewMapPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const prompt = searchParams.get("prompt") ?? "";

  const [stage, setStage] = useState<Stage>("clarifying");
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [manifest, setManifest] = useState<MapManifest | null>(null);
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const pipelineRanRef = useRef(false);

  // Auth
  useEffect(() => {
    const supabase = createClient();
    if (supabase) {
      supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    }
  }, []);

  // ── Run pipeline once on mount ──────────────────────────────
  const runPipeline = useCallback(async (promptText: string) => {
    if (!promptText.trim()) return;

    try {
      // Step 1: Clarify
      setStage("clarifying");
      const clarifyRes = await fetch("/api/ai/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: promptText }),
      });
      if (!clarifyRes.ok) throw new Error("Data search failed");
      const clarifyData: ClarifyResponse = await clarifyRes.json();
      const action = decideClarifyAction(clarifyData, promptText);

      if (action.kind !== "generate") {
        // Can't auto-generate — show error with context
        if (action.kind === "tabular_warning") {
          setError(action.message);
        } else if (action.kind === "ask_questions") {
          setError("Behöver mer information: " + (action.questions[0]?.question ?? "Försök formulera om."));
        }
        setStage("error");
        return;
      }

      // Step 2: Generate manifest
      setStage("generating");
      const { resolvedPrompt, dataUrl, dataProfile, scopeHint } = action;
      const genRes = await fetch("/api/ai/generate-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: resolvedPrompt,
          ...(dataUrl ? { sourceUrl: dataUrl, dataUrl } : {}),
          ...(dataProfile ? { dataProfile } : {}),
          ...(scopeHint ? { scopeHint } : {}),
        }),
      });
      if (!genRes.ok) throw new Error("Map generation failed");
      const genData = await genRes.json();
      const generatedManifest: MapManifest = genData.manifest;
      if (!generatedManifest) throw new Error("No manifest returned");

      // Step 3: Fetch GeoJSON
      setStage("fetching");
      const geoUrl = dataUrl ?? generatedManifest.layers[0]?.sourceUrl;
      let geojson: GeoJSON.FeatureCollection | null = null;
      if (geoUrl) {
        try {
          const geoRes = await fetch(geoUrl);
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo?.type === "FeatureCollection") geojson = geo;
          }
        } catch { /* non-fatal */ }
      }

      setManifest(generatedManifest);
      setGeojsonData(geojson);
      setStage("ready");

      // Step 4: Auto-save if logged in
      if (userId) {
        setStage("saving");
        try {
          const saveRes = await fetch("/api/maps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: generatedManifest.title ?? promptText.slice(0, 60),
              prompt: promptText,
              manifest: generatedManifest as unknown as Record<string, unknown>,
              geojson_url: geoUrl ?? null,
              is_public: false,
            }),
          });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            const mapId = saveData.map?.id;
            if (mapId) {
              // Redirect to the real editor
              router.replace(`/maps/${mapId}/edit`);
              return;
            }
          }
        } catch { /* save failed, stay on this page */ }
      }

      setStage("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      const retryable =
        message.includes("Rate limited") ||
        message.includes("429") ||
        message.includes("timeout") ||
        message.includes("Failed to fetch") ||
        message.includes("network");
      setError(message);
      setRetryable(retryable);
      setStage("error");
    }
  }, [userId, router]);

  useEffect(() => {
    if (!prompt || pipelineRanRef.current) return;
    pipelineRanRef.current = true;
    runPipeline(prompt);
  }, [prompt, runPipeline]);

  // ── Loading state ──────────────────────────────────────────
  if (!manifest || stage === "clarifying" || stage === "generating" || stage === "fetching" || stage === "saving") {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0d14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <div style={{ width: 32, height: 32, border: "2px solid rgba(99,130,255,0.3)", borderTop: "2px solid rgba(99,130,255,0.9)", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.50)" }}>
          {STAGE_LABELS[stage]}
        </p>
        {prompt && (
          <p style={{ fontFamily: "'Geist Mono',monospace", fontSize: 12, color: "rgba(248,249,251,0.25)", maxWidth: 400, textAlign: "center" }}>
            {prompt.slice(0, 80)}{prompt.length > 80 ? "…" : ""}
          </p>
        )}
        {error && (
          <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 13, color: "rgba(239,68,68,0.8)", maxWidth: 400, textAlign: "center" }}>
            {error}
          </p>
        )}
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────
  if (stage === "error") {
    return (
      <div style={{ minHeight: "100vh", background: "#0a0d14", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
        <p style={{ fontFamily: "'Geist',sans-serif", fontSize: 16, color: "rgba(239,68,68,0.8)", maxWidth: 500, textAlign: "center" }}>
          {error ?? "Något gick fel"}
        </p>
        <div style={{ display: "flex", gap: 12 }}>
          {retryable && (
            <button
              onClick={() => {
                setError(null);
                setRetryable(false);
                pipelineRanRef.current = false;
                runPipeline(prompt);
              }}
              style={{
                fontFamily: "'Geist',sans-serif",
                fontSize: 14,
                color: "rgba(99,130,255,0.9)",
                background: "rgba(99,130,255,0.1)",
                border: "1px solid rgba(99,130,255,0.3)",
                borderRadius: 6,
                padding: "8px 16px",
                cursor: "pointer",
              }}
            >
              Försök igen
            </button>
          )}
          <button
            onClick={() => router.push("/")}
            style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "rgba(248,249,251,0.40)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Tillbaka
          </button>
        </div>
      </div>
    );
  }

  // ── Map rendered (fallback if save failed — user stays here) ──
  const mapData: GeoJSON.FeatureCollection | string = geojsonData ?? manifest.layers[0]?.sourceUrl ?? { type: "FeatureCollection" as const, features: [] };
  const layer = manifest.layers[0];

  return (
    <MapShell
      manifest={manifest}
      sidebarOpen={false}
      overlay={<LegendOverlay layer={layer} legendItems={legendItems} />}
    >
      <MapContent manifest={manifest} data={mapData} onLegendItems={setLegendItems} />
      <CoordinateWidget />
    </MapShell>
  );
}
