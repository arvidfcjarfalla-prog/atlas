"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import {
  MapShell,
  useBasemapLayers,
  useManifestRenderer,
} from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import { Legend } from "@atlas/map-modules";
import type { MapManifest } from "@atlas/data-models";
import type { DatasetProfile } from "../../../lib/ai/types";

// ─── Types ──────────────────────────────────────────────────

type FlowState = "idle" | "uploading" | "profiled" | "generating" | "rendered" | "error";

interface UploadResult {
  geojson: GeoJSON.FeatureCollection;
  profile: DatasetProfile;
  warnings: string[];
  stats: {
    featureCount: number;
    skippedRows: number;
    latColumn: string;
    lngColumn: string;
  };
}

interface GenerateResult {
  manifest: MapManifest;
  validation: { valid: boolean; errors: string[]; warnings: string[] };
  attempts: number;
  usage: { inputTokens: number; outputTokens: number };
}

// ─── Map content (inside MapContext) ────────────────────────

function MapContent({
  manifest,
  data,
  onLegendItems,
}: {
  manifest: MapManifest;
  data: GeoJSON.FeatureCollection;
  onLegendItems: (items: CompiledLegendItem[]) => void;
}) {
  useBasemapLayers({ basemap: manifest.basemap });

  const layer = manifest.layers[0];
  const { legendItems } = useManifestRenderer({
    layer,
    data,
  });

  useEffect(() => {
    onLegendItems(legendItems);
  }, [legendItems, onLegendItems]);

  return null;
}

// ─── Root page ──────────────────────────────────────────────

export default function CreateMapPage() {
  const [state, setState] = useState<FlowState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Prompt state
  const [prompt, setPrompt] = useState("");

  // Result state
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);

  const handleLegendItems = useCallback((items: CompiledLegendItem[]) => {
    setLegendItems(items);
  }, []);

  // ── Upload handler ──────────────────────────────────────

  const handleUpload = useCallback(async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setState("uploading");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/ai/upload-data", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Upload failed");
      }

      setUploadResult(data);
      setState("profiled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  }, []);

  // ── Generate handler ────────────────────────────────────

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !uploadResult) return;

    setState("generating");
    setError(null);

    try {
      const res = await fetch("/api/ai/generate-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: prompt.trim(),
          dataProfile: uploadResult.profile,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Generation failed");
      }

      setGenerateResult(data);
      setState("rendered");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setState("error");
    }
  }, [prompt, uploadResult]);

  // ── Reset ───────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setState("idle");
    setError(null);
    setUploadResult(null);
    setGenerateResult(null);
    setPrompt("");
    setLegendItems([]);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ── Rendered state: show map ────────────────────────────

  if (state === "rendered" && generateResult && uploadResult) {
    const manifest = generateResult.manifest;
    const layer = manifest.layers[0];
    const validation = generateResult.validation;

    const sidebar = (
      <div className="flex flex-col h-full overflow-auto">
        <div className="p-4 border-b border-border">
          <h1 className="text-heading mb-1">{manifest.title}</h1>
          <p className="text-caption text-muted-foreground">{manifest.description}</p>
        </div>

        {/* Validation warnings */}
        {validation.warnings.length > 0 && (
          <div className="p-4 border-b border-border">
            <h3 className="text-label font-mono uppercase text-muted-foreground mb-2">
              Warnings
            </h3>
            <ul className="space-y-1">
              {validation.warnings.map((w, i) => (
                <li key={i} className="text-caption text-yellow-400/80">⚠ {w}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Metadata */}
        <div className="p-4 border-b border-border space-y-2">
          <h3 className="text-label font-mono uppercase text-muted-foreground">
            Details
          </h3>
          <div className="text-caption text-muted-foreground space-y-1">
            <p>Family: <span className="text-foreground">{layer?.style.mapFamily ?? "—"}</span></p>
            <p>Features: <span className="text-foreground">{uploadResult.stats.featureCount}</span></p>
            <p>Attempts: <span className="text-foreground">{generateResult.attempts}</span></p>
            <p>Tokens: <span className="text-foreground">{generateResult.usage.inputTokens + generateResult.usage.outputTokens}</span></p>
            {manifest.intent?.confidence != null && (
              <p>Confidence: <span className="text-foreground">{Math.round(manifest.intent.confidence * 100)}%</span></p>
            )}
          </div>
        </div>

        {/* Assumptions */}
        {manifest.intent?.assumptions && manifest.intent.assumptions.length > 0 && (
          <div className="p-4 border-b border-border">
            <h3 className="text-label font-mono uppercase text-muted-foreground mb-2">
              Assumptions
            </h3>
            <ul className="space-y-1">
              {manifest.intent.assumptions.map((a, i) => (
                <li key={i} className="text-caption text-muted-foreground">• {a}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 space-y-2">
          <button
            onClick={() => { setState("profiled"); setGenerateResult(null); setLegendItems([]); }}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground hover:bg-background/80 transition-colors duration-fast"
          >
            Edit prompt
          </button>
          <button
            onClick={handleReset}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-muted-foreground hover:bg-background/80 transition-colors duration-fast"
          >
            Start over
          </button>
        </div>
      </div>
    );

    return (
      <MapShell
        manifest={manifest}
        sidebar={sidebar}
        sidebarOpen
        overlay={
          <Legend
            items={legendItems}
            title={layer?.legend?.title ?? layer?.label}
          />
        }
      >
        <MapContent
          manifest={manifest}
          data={uploadResult.geojson}
          onLegendItems={handleLegendItems}
        />
      </MapShell>
    );
  }

  // ── Pre-render states: upload / prompt / loading ────────

  return (
    <div data-theme="explore" className="h-full overflow-auto bg-background text-foreground">
      <div className="max-w-xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Create Map</h1>
        <p className="text-muted-foreground text-lg mb-8">
          Upload a CSV and describe the map you want.
        </p>

        {/* Error banner */}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
            <p className="text-body text-red-400">{error}</p>
            <button
              onClick={() => { setError(null); setState(uploadResult ? "profiled" : "idle"); }}
              className="text-caption text-red-400/60 hover:text-red-400 mt-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Step 1: Upload */}
        <div className="mb-8">
          <h2 className="text-heading mb-3">1. Upload data</h2>
          <div className="flex gap-3 items-end">
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.tsv,.txt"
              disabled={state === "uploading" || state === "generating"}
              onChange={handleUpload}
              className="flex-1 text-body file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-body file:text-foreground file:cursor-pointer hover:file:bg-background/80"
            />
          </div>

          {state === "uploading" && (
            <p className="text-caption text-muted-foreground mt-2 animate-pulse">
              Processing file…
            </p>
          )}

          {/* Profile summary */}
          {uploadResult && (
            <div className="mt-4 rounded-md border border-border bg-card p-4">
              <h3 className="text-label font-mono uppercase text-muted-foreground mb-2">
                Dataset profile
              </h3>
              <div className="text-caption text-muted-foreground space-y-1">
                <p>{uploadResult.stats.featureCount} features · {uploadResult.profile.geometryType}</p>
                <p>Columns: {uploadResult.profile.attributes.map((a) => a.name).join(", ")}</p>
                {uploadResult.warnings.length > 0 && (
                  <p className="text-yellow-400/80">
                    {uploadResult.warnings.length} warning{uploadResult.warnings.length > 1 ? "s" : ""}: {uploadResult.warnings[0]}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Step 2: Prompt */}
        {(state === "profiled" || state === "generating" || state === "error") && uploadResult && (
          <div className="mb-8">
            <h2 className="text-heading mb-3">2. Describe your map</h2>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={state === "generating"}
              placeholder="e.g. Visa befolkning per region, färgade efter densitet"
              rows={3}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <div className="flex gap-3 mt-3">
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || state === "generating"}
                className="rounded-md bg-primary px-4 py-2 text-body text-primary-foreground hover:bg-primary/90 transition-colors duration-fast disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {state === "generating" ? "Generating…" : "Generate map"}
              </button>
              <button
                onClick={handleReset}
                disabled={state === "generating"}
                className="rounded-md border border-border bg-card px-4 py-2 text-body text-muted-foreground hover:bg-background/80 transition-colors duration-fast"
              >
                Reset
              </button>
            </div>

            {state === "generating" && (
              <p className="text-caption text-muted-foreground mt-3 animate-pulse">
                AI is generating your map (this may take a few seconds)…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
