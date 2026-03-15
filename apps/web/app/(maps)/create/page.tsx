"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  MapShell,
  useBasemapLayers,
  useManifestRenderer,
} from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import { Legend, GradientLegend, ProportionalLegend } from "@atlas/map-modules";
import type { MapManifest } from "@atlas/data-models";
import type {
  DatasetProfile,
  ClarifyResponse,
  ClarificationQuestion,
  RefinementSuggestion,
} from "../../../lib/ai/types";

// ─── Types ──────────────────────────────────────────────────

type FlowState =
  | "idle"
  | "clarifying"
  | "uploading"
  | "profiled"
  | "generating"
  | "fetching-data"
  | "rendered"
  | "error";

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
  caseId?: string;
  suggestions?: RefinementSuggestion[];
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
  data: GeoJSON.FeatureCollection | string;
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
  return (
    <Suspense>
      <CreateMapPageInner />
    </Suspense>
  );
}

function CreateMapPageInner() {
  const searchParams = useSearchParams();
  const urlPrompt = searchParams.get("prompt")?.trim() ?? "";
  const [state, setState] = useState<FlowState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Prompt state
  const [prompt, setPrompt] = useState(urlPrompt);

  // Clarification state
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarifyWarning, setClarifyWarning] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Resolved data from clarification
  const [resolvedDataUrl, setResolvedDataUrl] = useState<string | null>(null);
  const [resolvedProfile, setResolvedProfile] = useState<DatasetProfile | null>(null);

  // Result state
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);

  // Pre-fetched GeoJSON data (so the compiler has real data for expressions)
  const [fetchedGeoJSON, setFetchedGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  // Track whether we've auto-submitted the URL prompt
  const autoSubmittedRef = useRef(false);

  const handleLegendItems = useCallback((items: CompiledLegendItem[]) => {
    setLegendItems(items);
  }, []);

  // ── Clarify handler ───────────────────────────────────────

  const handleClarify = useCallback(
    async (promptText: string, currentAnswers?: Record<string, string>) => {
      if (!promptText.trim()) return;

      setState("clarifying");
      setError(null);
      setClarifyQuestions([]);
      setClarifyWarning(null);

      try {
        const res = await fetch("/api/ai/clarify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptText.trim(),
            answers: currentAnswers ?? answers,
          }),
        });

        const data: ClarifyResponse = await res.json();

        if (!res.ok) {
          throw new Error(
            (data as unknown as { error?: string }).error ?? "Clarification failed",
          );
        }

        if (data.ready) {
          // Data resolved — proceed to generation
          if (data.dataUrl) setResolvedDataUrl(data.dataUrl);
          if (data.dataProfile) setResolvedProfile(data.dataProfile);

          // Auto-generate with resolved data
          await handleGenerateWithData(
            data.resolvedPrompt ?? promptText,
            data.dataUrl ?? null,
            data.dataProfile ?? null,
          );
        } else {
          // Need more info — show questions
          if (data.questions) setClarifyQuestions(data.questions);
          if (data.dataWarning) setClarifyWarning(data.dataWarning);
          setState("clarifying");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Clarification failed");
        setState("error");
      }
    },
    [answers],
  );

  // Auto-submit URL prompt on mount
  useEffect(() => {
    if (!urlPrompt) return;
    if (autoSubmittedRef.current) return;
    autoSubmittedRef.current = true;
    // setTimeout(0) ensures the call survives React 18 strict-mode's
    // unmount/remount cycle (synchronous calls get discarded).
    const id = setTimeout(() => handleClarify(urlPrompt), 0);
    return () => {
      clearTimeout(id);
      autoSubmittedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlPrompt]);

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
      setResolvedProfile(data.profile);
      setState("profiled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  }, []);

  // ── Generate handler (with resolved data) ─────────────

  const handleGenerateWithData = useCallback(
    async (
      promptText: string,
      dataUrl: string | null,
      profile: DatasetProfile | null,
      parentCaseId?: string,
    ) => {
      setState("generating");
      setError(null);

      try {
        const res = await fetch("/api/ai/generate-map", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: promptText.trim(),
            ...(dataUrl ? { sourceUrl: dataUrl, dataUrl } : {}),
            ...(profile ? { dataProfile: profile } : {}),
            ...(parentCaseId ? { parentCaseId } : {}),
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error ?? "Generation failed");
        }

        setGenerateResult(data);

        // Pre-fetch GeoJSON so the compiler has real data for color expressions
        const dataSourceUrl =
          dataUrl ?? data.manifest?.layers?.[0]?.sourceUrl;
        if (dataSourceUrl && typeof dataSourceUrl === "string") {
          setState("fetching-data");
          try {
            const geoRes = await fetch(dataSourceUrl);
            if (geoRes.ok) {
              const geojson = await geoRes.json();
              if (
                geojson?.type === "FeatureCollection" &&
                Array.isArray(geojson.features)
              ) {
                setFetchedGeoJSON(geojson);
              }
            }
          } catch {
            // Non-fatal — will fall back to URL-based loading
          }
        }
        setState("rendered");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
        setState("error");
      }
    },
    [],
  );

  // ── Generate handler (from UI button) ─────────────────

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;

    // If we have upload data, use it directly
    if (uploadResult) {
      await handleGenerateWithData(
        prompt,
        null,
        uploadResult.profile,
      );
      return;
    }

    // If we have resolved data from clarification, use it
    if (resolvedDataUrl || resolvedProfile) {
      await handleGenerateWithData(prompt, resolvedDataUrl, resolvedProfile);
      return;
    }

    // Otherwise, run clarification first
    await handleClarify(prompt);
  }, [prompt, uploadResult, resolvedDataUrl, resolvedProfile, handleClarify, handleGenerateWithData]);

  // ── Answer a clarification question ───────────────────

  const handleAnswer = useCallback(
    (questionId: string, answer: string) => {
      const newAnswers = { ...answers, [questionId]: answer };
      setAnswers(newAnswers);

      // If user chose to upload, switch to upload mode
      if (answer === "Upload CSV" || answer === "Upload my own data") {
        setState("idle");
        setClarifyQuestions([]);
        return;
      }

      // Re-submit with answers
      handleClarify(prompt, newAnswers);
    },
    [answers, prompt, handleClarify],
  );

  // ── Case outcome tracking ────────────────────────────────

  const sendOutcome = useCallback(
    (outcome: "edited" | "reset") => {
      const caseId = generateResult?.caseId;
      if (!caseId) return;
      fetch("/api/ai/case-memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: caseId, outcome }),
      }).catch(() => {});
    },
    [generateResult],
  );

  const sendRefinementEvent = useCallback(
    (type: "chat" | "ui", action: string, detail: string) => {
      const caseId = generateResult?.caseId;
      if (!caseId) return;
      fetch("/api/ai/case-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: caseId,
          event: { type, action, detail, timestamp: new Date().toISOString() },
        }),
      }).catch(() => {});
    },
    [generateResult],
  );

  // ── Suggestion chip handler ─────────────────────────────

  const handleRefine = useCallback(
    (suggestion: RefinementSuggestion) => {
      const parentId = generateResult?.caseId;
      sendRefinementEvent("ui", suggestion.action, suggestion.promptSuffix);
      sendOutcome("edited");
      const refined = `${prompt.trim()} ${suggestion.promptSuffix}`;
      setPrompt(refined);
      setGenerateResult(null);
      setLegendItems([]);
      setState("generating");
      // Re-generate with the appended instruction, linking back to parent case
      if (resolvedDataUrl || resolvedProfile) {
        handleGenerateWithData(refined, resolvedDataUrl, resolvedProfile, parentId);
      } else {
        handleClarify(refined);
      }
    },
    [prompt, generateResult, resolvedDataUrl, resolvedProfile, sendRefinementEvent, sendOutcome, handleGenerateWithData, handleClarify],
  );

  // ── Reset ───────────────────────────────────────────────

  const handleReset = useCallback(() => {
    setState("idle");
    setError(null);
    setUploadResult(null);
    setGenerateResult(null);
    setPrompt("");
    setLegendItems([]);
    setClarifyQuestions([]);
    setClarifyWarning(null);
    setAnswers({});
    setResolvedDataUrl(null);
    setResolvedProfile(null);
    setFetchedGeoJSON(null);
    autoSubmittedRef.current = false;
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ── Rendered state: show map ────────────────────────────

  if (state === "rendered" && generateResult) {
    const manifest = generateResult.manifest;
    const layer = manifest.layers[0];
    const validation = generateResult.validation;

    // Determine data source: uploaded GeoJSON, pre-fetched GeoJSON, or empty
    const mapData: GeoJSON.FeatureCollection =
      uploadResult?.geojson ??
      fetchedGeoJSON ??
      { type: "FeatureCollection" as const, features: [] };

    const sidebar = (
      <div className="flex flex-col h-full overflow-auto">
        <div className="p-4 border-b border-border">
          <h1 className="text-heading mb-1">{manifest.title}</h1>
          <p className="text-caption text-muted-foreground">
            {manifest.description}
          </p>
        </div>

        {/* Validation warnings */}
        {validation.warnings.length > 0 && (
          <div className="p-4 border-b border-border">
            <h3 className="text-label font-mono uppercase text-muted-foreground mb-2">
              Warnings
            </h3>
            <ul className="space-y-1">
              {validation.warnings.map((w, i) => (
                <li key={i} className="text-caption text-yellow-400/80">
                  {w}
                </li>
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
            <p>
              Family:{" "}
              <span className="text-foreground">
                {layer?.style.mapFamily ?? "\u2014"}
              </span>
            </p>
            <p>
              Attempts:{" "}
              <span className="text-foreground">{generateResult.attempts}</span>
            </p>
            <p>
              Tokens:{" "}
              <span className="text-foreground">
                {generateResult.usage.inputTokens +
                  generateResult.usage.outputTokens}
              </span>
            </p>
            {manifest.intent?.confidence != null && (
              <p>
                Confidence:{" "}
                <span className="text-foreground">
                  {Math.round(manifest.intent.confidence * 100)}%
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Assumptions */}
        {manifest.intent?.assumptions &&
          manifest.intent.assumptions.length > 0 && (
            <div className="p-4 border-b border-border">
              <h3 className="text-label font-mono uppercase text-muted-foreground mb-2">
                Assumptions
              </h3>
              <ul className="space-y-1">
                {manifest.intent.assumptions.map((a, i) => (
                  <li
                    key={i}
                    className="text-caption text-muted-foreground"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

        {/* Refinement suggestions */}
        {generateResult.suggestions && generateResult.suggestions.length > 0 && (
          <div className="p-4 border-b border-border">
            <h3 className="text-label font-mono uppercase text-muted-foreground mb-2">
              Refine this map
            </h3>
            <div className="flex flex-wrap gap-2">
              {generateResult.suggestions.map((s) => (
                <button
                  key={s.action}
                  onClick={() => handleRefine(s)}
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-caption text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 space-y-2">
          <button
            onClick={() => {
              sendOutcome("edited");
              setState("idle");
              setGenerateResult(null);
              setLegendItems([]);
            }}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground hover:bg-background/80 transition-colors duration-fast"
          >
            Edit prompt
          </button>
          <button
            onClick={() => {
              sendOutcome("reset");
              handleReset();
            }}
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
          onLegendItems={handleLegendItems}
        />
      </MapShell>
    );
  }

  // ── Pre-render states ─────────────────────────────────────

  const isLoading = state === "clarifying" || state === "generating" || state === "uploading" || state === "fetching-data";

  return (
    <div
      data-theme="explore"
      className="h-full overflow-auto bg-background text-foreground"
    >
      <div className="max-w-xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold tracking-tight mb-2">Create Map</h1>
        <p className="text-muted-foreground text-lg mb-8">
          Describe the map you want. Atlas will find the data and build it.
        </p>

        {/* Error banner */}
        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 mb-6">
            <p className="text-body text-red-400">{error}</p>
            <button
              onClick={() => {
                setError(null);
                setState("idle");
              }}
              className="text-caption text-red-400/60 hover:text-red-400 mt-1"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Prompt input — always visible */}
        <div className="mb-8">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            disabled={isLoading}
            placeholder="e.g. Show earthquakes worldwide, colored by magnitude"
            rows={3}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <div className="flex gap-3 mt-3">
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isLoading}
              className="rounded-md bg-primary px-4 py-2 text-body text-primary-foreground hover:bg-primary/90 transition-colors duration-fast disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {state === "generating"
                ? "Generating\u2026"
                : state === "clarifying"
                  ? "Thinking\u2026"
                  : "Create map"}
            </button>
            {(state !== "idle" || prompt) && (
              <button
                onClick={handleReset}
                disabled={isLoading}
                className="rounded-md border border-border bg-card px-4 py-2 text-body text-muted-foreground hover:bg-background/80 transition-colors duration-fast"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <p className="text-caption text-muted-foreground mb-6 animate-pulse">
            {state === "clarifying"
              ? "Understanding your request\u2026"
              : state === "generating"
                ? "AI is generating your map\u2026"
                : "Processing file\u2026"}
          </p>
        )}

        {/* Clarification questions */}
        {state === "clarifying" && clarifyQuestions.length > 0 && (
          <div className="mb-8 rounded-md border border-border bg-card p-4">
            {clarifyQuestions.map((q) => (
              <div key={q.id} className="mb-4 last:mb-0">
                <p className="text-body text-foreground mb-3">{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {q.options?.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleAnswer(q.id, option)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-caption text-muted-foreground hover:bg-card hover:text-foreground transition-colors"
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Data warning */}
        {clarifyWarning && (
          <div className="mb-6 rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3">
            <p className="text-caption text-yellow-400/80">{clarifyWarning}</p>
          </div>
        )}

        {/* Upload section — secondary, always available */}
        <details className="mb-8 group">
          <summary className="text-caption text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            Or upload your own data (CSV)
          </summary>
          <div className="mt-3 pl-0">
            <div className="flex gap-3 items-end">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt"
                disabled={isLoading}
                onChange={handleUpload}
                className="flex-1 text-body file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-body file:text-foreground file:cursor-pointer hover:file:bg-background/80"
              />
            </div>

            {/* Profile summary */}
            {uploadResult && (
              <div className="mt-4 rounded-md border border-border bg-card p-4">
                <h3 className="text-label font-mono uppercase text-muted-foreground mb-2">
                  Dataset profile
                </h3>
                <div className="text-caption text-muted-foreground space-y-1">
                  <p>
                    {uploadResult.stats.featureCount} features ·{" "}
                    {uploadResult.profile.geometryType}
                  </p>
                  <p>
                    Columns:{" "}
                    {uploadResult.profile.attributes
                      .map((a) => a.name)
                      .join(", ")}
                  </p>
                  {uploadResult.warnings.length > 0 && (
                    <p className="text-yellow-400/80">
                      {uploadResult.warnings.length} warning
                      {uploadResult.warnings.length > 1 ? "s" : ""}:{" "}
                      {uploadResult.warnings[0]}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}
