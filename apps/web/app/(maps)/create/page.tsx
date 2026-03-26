"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
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
import { decideClarifyAction } from "../../../lib/ai/clarify-action";
import { createClient } from "../../../lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { AuthModal } from "../../../components/AuthModal";
import BackToAtlas from "../../../components/back-to-atlas";

// ─── Types ──────────────────────────────────────────────────

type FlowState =
  | "idle"
  | "clarifying"
  | "uploading"
  | "profiled"
  | "generating"
  | "fetching-data"
  | "rendered"
  | "editing"
  | "error";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  changes?: string[];
  timestamp: number;
}

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
      <CreateRedirect />
    </Suspense>
  );
}

// /create is no longer a primary destination.
// Redirect logged-in users to /dashboard, everyone else to /.
function CreateRedirect() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) { router.replace("/"); return; }
    supabase.auth.getUser().then(({ data }) => {
      router.replace(data.user ? "/dashboard" : "/");
    });
  }, [router]);

  // Blank screen while redirecting — no flash
  return null;
}

function CreateMapPageInner() {
  const searchParams = useSearchParams();
  const urlPrompt = searchParams.get("prompt")?.trim() ?? "";
  const [state, setState] = useState<FlowState>("idle");
  const [error, setError] = useState<string | null>(null);

  // ── Entry fade-in ──────────────────────────────────────────
  // When the user arrives from the landing page, the screen starts black and
  // lifts after a brief tick. This pairs with the landing page's exit curtain
  // to produce a seamless fade-to-black → fade-in-from-black transition.
  const [entryVeil, setEntryVeil] = useState(true);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      // Two rAFs ensure the initial black paint has been committed before lifting
      requestAnimationFrame(() => setEntryVeil(false));
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Upload state
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Prompt state
  const [prompt, setPrompt] = useState(urlPrompt);
  const [isEnhancing, setIsEnhancing] = useState(false);

  // Clarification state
  const [clarifyQuestions, setClarifyQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarifyWarning, setClarifyWarning] = useState<string | null>(null);
  const [tabularSuggestions, setTabularSuggestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Resolved data from clarification
  const [resolvedDataUrl, setResolvedDataUrl] = useState<string | null>(null);
  const [resolvedProfile, setResolvedProfile] = useState<DatasetProfile | null>(null);

  // Result state
  const [generateResult, setGenerateResult] = useState<GenerateResult | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);

  // Pre-fetched GeoJSON data (so the compiler has real data for expressions)
  const [fetchedGeoJSON, setFetchedGeoJSON] = useState<GeoJSON.FeatureCollection | null>(null);

  // Coverage ratio from join pipeline (0-1)
  const [coverageRatio, setCoverageRatio] = useState<number | null>(null);

  // Chat editing state
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [editManifest, setEditManifest] = useState<MapManifest | null>(null);
  const [manifestHistory, setManifestHistory] = useState<MapManifest[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auth + save state
  const [user, setUser] = useState<User | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [savedMapId, setSavedMapId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // Track whether we've auto-submitted the URL prompt
  const autoSubmittedRef = useRef(false);

  // ── Hydrate from landing page result (sessionStorage) ─────
  // If the user clicked "Edit →" on the landing page, we already have the
  // manifest and GeoJSON — skip the pipeline entirely.
  const hydratedRef = useRef(false);

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
      setTabularSuggestions([]);

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

        // Store resolved data for all ready responses (including tabular_only)
        // so the user can later upload geometry and reuse the tabular data.
        if (data.dataUrl) setResolvedDataUrl(data.dataUrl);
        if (data.dataProfile) setResolvedProfile(data.dataProfile);

        const action = decideClarifyAction(data, promptText);

        if (action.kind === "generate") {
          setCoverageRatio(action.coverageRatio);
          await handleGenerateWithData(
            action.resolvedPrompt,
            action.dataUrl,
            action.dataProfile,
            undefined,
            action.scopeHint,
          );
        } else if (action.kind === "tabular_warning") {
          setClarifyWarning(action.message);
          setTabularSuggestions(action.suggestions);
          setState("idle");
        } else if (action.kind === "auto_answer") {
          // All questions have recommended defaults — re-submit automatically
          setAnswers(action.answers);
          await handleClarify(promptText, action.answers);
        } else {
          setClarifyQuestions(action.questions);
          if (action.warning) setClarifyWarning(action.warning);
          setState("clarifying");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Clarification failed");
        setState("error");
      }
    },
    [answers],
  );

  // Hydrate from landing page result — must run before the auto-submit effect
  useEffect(() => {
    if (hydratedRef.current) return;
    try {
      const raw = sessionStorage.getItem("atlas:landing-result");
      if (!raw) return;
      sessionStorage.removeItem("atlas:landing-result"); // consume once
      const parsed = JSON.parse(raw) as {
        manifest: MapManifest;
        geojson: GeoJSON.FeatureCollection;
        prompt: string;
      };
      if (!parsed.manifest || !parsed.geojson) return;
      hydratedRef.current = true;
      autoSubmittedRef.current = true; // prevent the pipeline auto-submit
      setPrompt(parsed.prompt ?? urlPrompt);
      setFetchedGeoJSON(parsed.geojson);
      setGenerateResult({
        manifest: parsed.manifest,
        validation: { valid: true, errors: [], warnings: [] },
        attempts: 0,
        usage: { inputTokens: 0, outputTokens: 0 },
      });
      setState("rendered");
    } catch { /* malformed storage — ignore, fall through to normal flow */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      scopeHint?: { region: string; filterField: string } | null,
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
            ...(scopeHint ? { scopeHint } : {}),
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

  // ── Save map to DB ───────────────────────────────────────

  const doSave = useCallback(async () => {
    if (!generateResult?.manifest) return;
    setSaveState("saving");
    try {
      const manifest = generateResult.manifest;
      const body = {
        title: manifest.title ?? prompt.trim().slice(0, 60),
        prompt: prompt.trim(),
        manifest: manifest as unknown as Record<string, unknown>,
        geojson_url: resolvedDataUrl ?? manifest.layers[0]?.sourceUrl ?? null,
        is_public: false,
      };
      const res = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Save failed");
      const json = await res.json();
      setSavedMapId(json.map?.id ?? null);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  }, [generateResult, prompt, resolvedDataUrl]);

  const handleSaveMap = useCallback(async () => {
    if (!generateResult?.manifest) return;

    // Check session live — don't rely on cached user state (race condition)
    const supabase = createClient();
    const currentUser = supabase
      ? (await supabase.auth.getUser()).data.user
      : null;

    if (!currentUser) {
      // Persist map so it survives email confirmation redirect or page reload
      if (generateResult?.manifest) {
        sessionStorage.setItem("atlas_pending_map", JSON.stringify({
          manifest: generateResult.manifest,
          prompt: prompt.trim(),
          source: "create",
        }));
      }
      setAuthModalOpen(true);
      return;
    }

    if (!user) setUser(currentUser);
    await doSave();
  }, [generateResult, prompt, user, doSave]);

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
    setTabularSuggestions([]);
    setAnswers({});
    setResolvedDataUrl(null);
    setResolvedProfile(null);
    setFetchedGeoJSON(null);
    setCoverageRatio(null);
    autoSubmittedRef.current = false;
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  // ── Browser history management ─────────────────────────────
  // Push history entries when advancing through steps so browser back
  // navigates between steps instead of leaving the page.

  useEffect(() => {
    if (state === "profiled") {
      window.history.pushState({ step: "profiled" }, "");
    } else if (state === "rendered") {
      window.history.pushState({ step: "rendered" }, "");
    }
  }, [state]);

  useEffect(() => {
    function handlePopState() {
      if (state === "rendered") {
        // Go back — keep uploadResult and prompt, clear generation results
        setGenerateResult(null);
        setLegendItems([]);
        if (uploadResult) {
          setState("profiled");
        } else {
          setState("idle");
        }
      } else if (state === "profiled") {
        handleReset();
      }
      // If state is idle, let the browser navigate away naturally
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [state, uploadResult, handleReset]);

  // ── Chat editing ─────────────────────────────────────

  const handleChatSend = useCallback(async () => {
    const msg = chatInput.trim();
    if (!msg || !editManifest) return;

    setChatInput("");
    setChatHistory((prev) => [
      ...prev,
      { role: "user", content: msg, timestamp: Date.now() },
    ]);
    setIsChatLoading(true);

    try {
      const res = await fetch("/api/ai/edit-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          manifest: editManifest,
          message: msg,
          chatHistory,
        }),
      });
      const data = await res.json();

      if (data.undo) {
        // Undo: revert to previous manifest
        if (manifestHistory.length > 0) {
          const prev = manifestHistory[manifestHistory.length - 1];
          setEditManifest(prev);
          setManifestHistory((h) => h.slice(0, -1));
        }
      } else if (data.manifest) {
        // Save current before applying new
        setManifestHistory((h) => [...h, editManifest]);
        setEditManifest(data.manifest);
      }

      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.reply ?? "Klart.",
          changes: data.changes,
          timestamp: Date.now(),
        },
      ]);
    } catch {
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Något gick fel. Försök igen.",
          timestamp: Date.now(),
        },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  }, [chatInput, editManifest, chatHistory, manifestHistory]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  // Enter editing mode: copy manifest for live editing
  const enterEditMode = useCallback(() => {
    if (generateResult) {
      setEditManifest(generateResult.manifest);
      setManifestHistory([]);
      setChatHistory([{
        role: "assistant",
        content: "Kartan är redo! Beskriv vad du vill ändra — färger, zoom, stil, lägga till lager, etc.",
        timestamp: Date.now(),
      }]);
      setState("editing");
    }
  }, [generateResult]);

  // ── Enhance prompt ────────────────────────────────────

  const handleEnhance = useCallback(async () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setIsEnhancing(true);
    try {
      const res = await fetch("/api/ai/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: trimmed }),
      });
      if (!res.ok) return;
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("json")) return;
      const data = await res.json();
      if (data.enhanced) {
        setPrompt(data.enhanced);
      }
    } catch {
      // Silently fail — user can still submit the original prompt
    } finally {
      setIsEnhancing(false);
    }
  }, [prompt]);

  // ── Entry veil overlay (shared across all states) ───────
  // zIndex 9999 so it sits above MapShell (which manages its own z layers).
  const entryVeilEl = (
    <div
      aria-hidden
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(10,13,20,1)",
        pointerEvents: "none",
        transition: "opacity 500ms cubic-bezier(0.4,0,0.2,1)",
        opacity: entryVeil ? 1 : 0,
      }}
    />
  );

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
        <div className="px-4 py-3 border-b border-border">
          <BackToAtlas />
        </div>
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

        {/* Coverage warning */}
        {coverageRatio != null && coverageRatio < 0.8 && (
          <div className="p-4 border-b border-border">
            <p className="text-caption text-yellow-400/80">
              {Math.round(coverageRatio * 100)}% of regions matched map boundaries.
            </p>
          </div>
        )}

        {/* Debug metadata (collapsed by default) */}
        <details className="p-4 border-b border-border">
          <summary className="text-label font-mono uppercase text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
            Debug info
          </summary>
          <div className="text-caption text-muted-foreground space-y-1 mt-2">
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
        </details>

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
                  className="rounded-full border border-border bg-background px-3 py-1.5 text-caption text-muted-foreground hover:border-primary/40 hover:text-primary/80 transition-colors"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 space-y-2">
          {/* Save map */}
          {saveState === "saved" && savedMapId ? (
            <a
              href="/dashboard"
              className="w-full block text-center rounded-md px-3 py-2 text-body font-medium text-green-400 border border-green-500/30 bg-green-500/10 hover:bg-green-500/15 transition-colors duration-fast"
            >
              ✓ Sparad — Mina kartor →
            </a>
          ) : (
            <button
              onClick={handleSaveMap}
              disabled={saveState === "saving"}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-muted-foreground hover:bg-background/80 hover:text-foreground transition-colors duration-fast disabled:opacity-50"
            >
              {saveState === "saving"
                ? "Sparar…"
                : saveState === "error"
                  ? "Misslyckades — försök igen"
                  : "Spara karta"}
            </button>
          )}

          <button
            onClick={enterEditMode}
            className="w-full rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-body text-primary hover:bg-primary/20 transition-colors duration-fast"
          >
            Redigera med AI
          </button>
          <button
            onClick={() => {
              sendOutcome("edited");
              setState("idle");
              setGenerateResult(null);
              setLegendItems([]);
            }}
            className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-muted-foreground hover:bg-background/80 transition-colors duration-fast"
          >
            Ändra prompt
          </button>
          <button
            onClick={() => {
              sendOutcome("reset");
              handleReset();
            }}
            className="w-full rounded-md px-3 py-2 text-body text-muted-foreground hover:bg-background/80 transition-colors duration-fast"
          >
            Börja om
          </button>
        </div>
      </div>
    );

    return (
      <>
        {entryVeilEl}
        <AuthModal
          open={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          reason="för att spara din karta"
          onSuccess={(loggedInUser) => {
            setUser(loggedInUser);
            setAuthModalOpen(false);
            doSave();
          }}
        />
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
      </>
    );
  }

  // ── Editing state: chat + live map ──────────────────────

  if (state === "editing" && editManifest) {
    const mapData: GeoJSON.FeatureCollection =
      uploadResult?.geojson ??
      fetchedGeoJSON ??
      { type: "FeatureCollection" as const, features: [] };

    const chatSidebar = (
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="text-heading truncate">{editManifest.title}</h1>
          <button
            onClick={() => {
              // Exit editing, keep the edited manifest
              if (generateResult) {
                setGenerateResult({ ...generateResult, manifest: editManifest });
              }
              setState("rendered");
            }}
            className="text-caption text-muted-foreground hover:text-foreground transition-colors"
          >
            Klar
          </button>
        </div>

        {/* Chat messages */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {chatHistory.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-caption ${
                  msg.role === "user"
                    ? "bg-primary/20 text-primary"
                    : "bg-card border border-border text-foreground"
                }`}
              >
                <p>{msg.content}</p>
                {msg.changes && msg.changes.length > 0 && (
                  <ul className="mt-1 text-muted-foreground space-y-0.5">
                    {msg.changes.map((c, j) => (
                      <li key={j} className="text-[11px]">{c}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          ))}
          {isChatLoading && (
            <div className="flex justify-start">
              <div className="bg-card border border-border rounded-lg px-3 py-2 text-caption text-muted-foreground">
                Tänker…
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Undo button */}
        {manifestHistory.length > 0 && (
          <div className="px-4 pb-2">
            <button
              onClick={() => {
                const prev = manifestHistory[manifestHistory.length - 1];
                setEditManifest(prev);
                setManifestHistory((h) => h.slice(0, -1));
                setChatHistory((prev) => [
                  ...prev,
                  { role: "assistant", content: "Ångrade senaste ändringen.", timestamp: Date.now() },
                ]);
              }}
              className="text-caption text-muted-foreground hover:text-foreground transition-colors"
            >
              Ångra
            </button>
          </div>
        )}

        {/* Chat input */}
        <div className="p-3 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleChatSend();
                }
              }}
              placeholder="Beskriv vad du vill ändra…"
              disabled={isChatLoading}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
            />
            <button
              onClick={handleChatSend}
              disabled={isChatLoading || !chatInput.trim()}
              className="rounded-md bg-primary/20 px-3 py-2 text-body text-primary hover:bg-primary/30 transition-colors disabled:opacity-50"
            >
              Skicka
            </button>
          </div>
        </div>
      </div>
    );

    const layer = editManifest.layers[0];

    return (
      <>
        {entryVeilEl}
        <MapShell
          manifest={editManifest}
          sidebar={chatSidebar}
          sidebarOpen
          overlay={
            <Legend
              items={legendItems}
              title={layer?.legend?.title ?? layer?.label}
            />
          }
        >
          <MapContent
            manifest={editManifest}
            data={mapData}
            onLegendItems={handleLegendItems}
          />
        </MapShell>
      </>
    );
  }

  // ── Pre-render states ─────────────────────────────────────

  const isLoading = state === "clarifying" || state === "generating" || state === "uploading" || state === "fetching-data";

  return (
    <>
      {entryVeilEl}
      <AuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        reason="för att spara din karta"
        onSuccess={(loggedInUser) => {
          setUser(loggedInUser);
          setAuthModalOpen(false);
          doSave();
        }}
      />
    <div
      data-theme="explore"
      className="h-full overflow-auto bg-background text-foreground"
    >
      <div className="max-w-xl mx-auto px-6 py-16">
        <div className="mb-8">
          <div className="mb-2">
            <BackToAtlas />
          </div>
          <p className="text-muted-foreground">
            Describe your map. We'll find the data and build it.
          </p>
        </div>

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
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-body text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-all duration-fast"
          />
          <div className="flex gap-3 mt-3">
            {prompt.trim() && !isLoading && (
              <button
                onClick={handleEnhance}
                disabled={isEnhancing}
                className="rounded-xl border border-primary/20 bg-gradient-to-r from-primary/10 to-blue-500/10 px-4 py-2 text-body text-primary hover:from-primary/15 hover:to-blue-500/15 transition-colors duration-fast disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isEnhancing ? "Improving\u2026" : "\u2728 Improve"}
              </button>
            )}
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isLoading}
              className="rounded-xl bg-primary px-5 py-2.5 font-medium text-body text-primary-foreground hover:bg-primary/90 shadow-sm hover:shadow-md transition-all duration-fast disabled:opacity-40 disabled:cursor-not-allowed"
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
                className="rounded-xl border border-border bg-card px-4 py-2 text-body text-muted-foreground hover:bg-background/80 transition-colors duration-fast"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Loading indicator */}
        {isLoading && (
          <div className="mb-6 flex items-center gap-3">
            <svg className="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <div className="text-caption text-muted-foreground">
              {state === "clarifying" && (
                <>
                  <span className="text-primary">Searching data</span> → Generating map → Loading
                </>
              )}
              {state === "generating" && (
                <>
                  Searching data → <span className="text-primary">Generating map</span> → Loading
                </>
              )}
              {state === "fetching-data" && (
                <>
                  Searching data → Generating map → <span className="text-primary">Loading</span>
                </>
              )}
              {state === "uploading" && (
                <>
                  <span className="text-primary">Processing file</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Clarification questions */}
        {state === "clarifying" && clarifyQuestions.length > 0 && (
          <div className="mb-8 rounded-xl border border-border border-l-2 border-l-primary/40 bg-card p-4">
            {clarifyQuestions.map((q) => (
              <div key={q.id} className="mb-4 last:mb-0">
                <p className="text-body text-foreground mb-3">{q.question}</p>
                <div className="flex flex-wrap gap-2">
                  {q.options?.map((option) => (
                    <button
                      key={option}
                      onClick={() => handleAnswer(q.id, option)}
                      className={`rounded-full border px-3 py-1.5 text-caption transition-colors ${
                        option === q.recommended
                          ? "border-primary/50 bg-primary/10 text-foreground hover:bg-primary/20"
                          : "border-border bg-background text-muted-foreground hover:bg-card hover:text-foreground"
                      }`}
                    >
                      {option === q.recommended ? `\u2713 ${option}` : option}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Data warning + suggestion chips */}
        {clarifyWarning && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-caption text-amber-300/90">
              <span className="mr-1">\u26A0</span>
              {clarifyWarning}
            </p>
            {tabularSuggestions.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                <p className="text-caption text-amber-400/60 w-full mb-1">Try instead:</p>
                {tabularSuggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setPrompt(s);
                      setClarifyWarning(null);
                      setTabularSuggestions([]);
                      handleClarify(s);
                    }}
                    className="rounded-full border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-caption text-amber-300 hover:bg-amber-500/10 hover:text-amber-200 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Upload section — secondary, always available */}
        <div className="mb-8">
          <button
            onClick={() => setUploadOpen(!uploadOpen)}
            className="flex items-center gap-2 text-caption text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg
              className={`w-4 h-4 transition-transform ${uploadOpen ? 'rotate-90' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Or upload your own data (CSV)
          </button>
          {uploadOpen && (
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
                      <p className="text-amber-300/90">
                        {uploadResult.warnings.length} warning
                        {uploadResult.warnings.length > 1 ? "s" : ""}:{" "}
                        {uploadResult.warnings[0]}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
