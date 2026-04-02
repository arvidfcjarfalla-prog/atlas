"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
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
import { ZoomControls } from "@/components/ZoomControls";
import { AuthModal } from "@/components/AuthModal";
import { useAgentChat } from "@/lib/hooks/use-agent-chat";
import { useToast } from "@/lib/hooks/use-toast";
import { Toast } from "@/components/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/use-auth";
import { decideClarifyAction } from "@/lib/ai/clarify-action";
import type { GenerateAction } from "@/lib/ai/clarify-action";
import type { ClarifyResponse, ClarificationQuestion } from "@/lib/ai/types";
import { buildConfirmationQuestions, formatPreferences } from "@/lib/ai/confirmation-questions";
import { getTemplate } from "@/lib/templates";
import type { User } from "@supabase/supabase-js";

// ─── Pipeline stages ─────────────────────────────────────────

type Stage =
  | "clarifying"
  | "confirming"
  | "generating"
  | "fetching"
  | "ready"
  | "saving"
  | "error"
  | "needs_input";

const STAGE_LABELS: Record<Stage, string> = {
  clarifying: "Söker data\u2026",
  confirming: "Bekräfta inställningar",
  generating: "Genererar karta\u2026",
  fetching: "Hämtar geodata\u2026",
  ready: "Klar!",
  saving: "Sparar\u2026",
  error: "Något gick fel",
  needs_input: "Behöver mer information",
};

const MAX_AUTO_ANSWER_ROUNDS = 3;

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
  const queryClient = useQueryClient();
  const prompt = searchParams.get("prompt") ?? "";
  const templateId = searchParams.get("template");
  const artifactId = searchParams.get("artifactId");
  const { user } = useAuth();

  const { toast, show: showToast } = useToast();
  const [stage, setStage] = useState<Stage>("clarifying");
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [manifest, setManifest] = useState<MapManifest | null>(null);
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const pipelineRanRef = useRef(false);

  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [clarifyQuestions, setClarifyQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarifyWarning, setClarifyWarning] = useState<string | null>(null);
  const [tabularSuggestions, setTabularSuggestions] = useState<string[]>([]);
  const [agencyHint, setAgencyHint] = useState<{ agencyName: string; portalUrl: string } | null>(null);

  // Confirmation stage state
  const [pendingAction, setPendingAction] = useState<GenerateAction | null>(null);
  const [confirmQuestions, setConfirmQuestions] = useState<ClarificationQuestion[]>([]);
  const [confirmAnswers, setConfirmAnswers] = useState<Record<string, string>>({});

  const callClarify = useCallback(
    async (promptText: string, answers?: Record<string, string>): Promise<ClarifyResponse> => {
      const res = await fetch("/api/ai/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          ...(answers && Object.keys(answers).length > 0 ? { answers } : {}),
        }),
      });
      if (!res.ok) throw new Error("Data search failed");
      return res.json() as Promise<ClarifyResponse>;
    },
    [],
  );

  const generateAndRender = useCallback(
    async (
      promptText: string,
      dataUrl: string | null,
      dataProfile: unknown,
      scopeHint: { region: string; filterField: string } | null,
      preferences?: Record<string, string>,
    ) => {
      setStage("generating");
      const genRes = await fetch("/api/ai/generate-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          ...(dataUrl ? { sourceUrl: dataUrl, dataUrl } : {}),
          ...(dataProfile ? { dataProfile } : {}),
          ...(scopeHint ? { scopeHint } : {}),
          ...(preferences && Object.keys(preferences).length > 0 ? { preferences } : {}),
          ...(artifactId ? { artifactId } : {}),
        }),
      });
      if (!genRes.ok) throw new Error("Map generation failed");
      const genData = await genRes.json();
      const generatedManifest: MapManifest = genData.manifest;
      if (!generatedManifest) throw new Error("No manifest returned");

      setStage("fetching");
      const geoUrl = dataUrl ?? generatedManifest.layers[0]?.sourceUrl;
      let geojson: GeoJSON.FeatureCollection | null = null;
      if (geoUrl) {
        try {
          const geoRes = await fetch(geoUrl);
          if (geoRes.ok) {
            const geo = await geoRes.json();
            if (geo?.type === "FeatureCollection") geojson = geo;
          } else if (geoRes.status === 404) {
            throw new RetryableError("Cached data expired, retrying");
          }
        } catch (e) {
          if (e instanceof RetryableError) throw e;
        }
      }

      // Validate GeoJSON + auto-correct field name mismatches
      if (geojson && geojson.features.length === 0) {
        console.warn("[Atlas] Resolved data has 0 features");
      }
      if (geojson && geojson.features.length > 0) {
        const colorField = generatedManifest.layers[0]?.style?.colorField;
        if (colorField) {
          const hasField = geojson.features.slice(0, 5).some(
            (f: GeoJSON.Feature) => f.properties?.[colorField] !== undefined,
          );
          if (!hasField) {
            const sample = geojson.features[0]?.properties ?? {};
            const match = Object.keys(sample).find(
              (k) => k.toLowerCase() === colorField.toLowerCase(),
            );
            if (match) {
              generatedManifest.layers[0].style.colorField = match;
            }
          }
        }
      }

      return { generatedManifest, geojson, geoUrl };
    },
    [],
  );

  const runPipeline = useCallback(
    async (promptText: string, answers?: Record<string, string>) => {
      if (!promptText.trim()) return;

      try {
        setStage("clarifying");
        setClarifyQuestions([]);
        setClarifyWarning(null);
        setTabularSuggestions([]);

        let clarifyData = await callClarify(promptText, answers);
        let action = decideClarifyAction(clarifyData, promptText);

        let autoRounds = 0;
        while (action.kind === "auto_answer" && autoRounds < MAX_AUTO_ANSWER_ROUNDS) {
          autoRounds++;
          clarifyData = await callClarify(promptText, action.answers);
          action = decideClarifyAction(clarifyData, promptText);
        }

        if (action.kind === "tabular_warning") {
          setClarifyWarning(action.message);
          setTabularSuggestions(action.suggestions);
          setAgencyHint(action.agencyHint ? { agencyName: action.agencyHint.agencyName, portalUrl: action.agencyHint.portalUrl } : null);
          // No upload section to auto-open here (unlike the create page).
          // The editor page shows a full-page "needs_input" view with agency link;
          // file upload is available later via ChatPanel and drag-and-drop once a map is rendered.
          setStage("needs_input");
          return;
        }

        if (action.kind === "ask_questions") {
          setClarifyQuestions(action.questions);
          if (action.warning) setClarifyWarning(action.warning);
          setStage("needs_input");
          return;
        }

        if (action.kind === "auto_answer") {
          setError("Kunde inte lösa data automatiskt. Försök formulera om.");
          setRetryable(true);
          setStage("error");
          return;
        }

        // Show confirmation questions before generating
        const cQuestions = buildConfirmationQuestions(action.dataProfile, promptText);
        if (cQuestions.length > 0) {
          setPendingAction(action);
          setConfirmQuestions(cQuestions);
          const prefilled: Record<string, string> = {};
          for (const q of cQuestions) {
            if (q.recommended) prefilled[q.id] = q.recommended;
          }
          setConfirmAnswers(prefilled);
          setStage("confirming");
          return;
        }

        const { resolvedPrompt, dataUrl, dataProfile, scopeHint } = action;

        let result: Awaited<ReturnType<typeof generateAndRender>>;
        try {
          result = await generateAndRender(resolvedPrompt, dataUrl, dataProfile, scopeHint);
        } catch (e) {
          if (e instanceof RetryableError) {
            setStage("clarifying");
            const freshClarify = await callClarify(promptText, answers);
            const freshAction = decideClarifyAction(freshClarify, promptText);
            if (freshAction.kind !== "generate") {
              throw new Error("Retry failed — could not resolve data");
            }
            result = await generateAndRender(
              freshAction.resolvedPrompt,
              freshAction.dataUrl,
              freshAction.dataProfile,
              freshAction.scopeHint,
            );
          } else {
            throw e;
          }
        }

        const { generatedManifest, geojson, geoUrl } = result;

        setManifest(generatedManifest);
        setGeojsonData(geojson);
        setStage("ready");

        // Auto-save if logged in
        if (user) {
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
                queryClient.invalidateQueries({ queryKey: ["recent-maps"] });
                router.replace(`/app/map/${mapId}`);
                return;
              }
            } else {
              showToast("Kunde inte spara kartan", "error");
            }
          } catch {
            showToast("Kunde inte spara kartan", "error");
          }
        }

        setStage("ready");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Something went wrong";
        const isRetryable =
          message.includes("Rate limited") ||
          message.includes("429") ||
          message.includes("timeout") ||
          message.includes("Failed to fetch") ||
          message.includes("network");
        setError(message);
        setRetryable(isRetryable);
        setStage("error");
      }
    },
    [user, router, callClarify, generateAndRender],
  );

  const handleAnswer = useCallback(
    (questionId: string, answer: string) => {
      pipelineRanRef.current = false;
      runPipeline(prompt, { [questionId]: answer });
    },
    [prompt, runPipeline],
  );

  const handleSuggestion = useCallback(
    (suggestion: string) => {
      router.replace(`/app/map/new?prompt=${encodeURIComponent(suggestion)}`);
    },
    [router],
  );

  const handleConfirmSubmit = useCallback(async () => {
    if (!pendingAction) return;
    const { resolvedPrompt, dataUrl, dataProfile, scopeHint } = pendingAction;
    const preferences = formatPreferences(confirmAnswers, confirmQuestions);

    try {
      let result: Awaited<ReturnType<typeof generateAndRender>>;
      try {
        result = await generateAndRender(resolvedPrompt, dataUrl, dataProfile, scopeHint, preferences);
      } catch (e) {
        if (e instanceof RetryableError) {
          setStage("clarifying");
          const freshClarify = await callClarify(prompt);
          const freshAction = decideClarifyAction(freshClarify, prompt);
          if (freshAction.kind !== "generate") {
            throw new Error("Retry failed — could not resolve data");
          }
          result = await generateAndRender(
            freshAction.resolvedPrompt,
            freshAction.dataUrl,
            freshAction.dataProfile,
            freshAction.scopeHint,
            preferences,
          );
        } else {
          throw e;
        }
      }

      const { generatedManifest, geojson, geoUrl } = result;
      setManifest(generatedManifest);
      setGeojsonData(geojson);
      setStage("ready");

      if (user) {
        setStage("saving");
        try {
          const saveRes = await fetch("/api/maps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: generatedManifest.title ?? prompt.slice(0, 60),
              prompt,
              manifest: generatedManifest as unknown as Record<string, unknown>,
              geojson_url: geoUrl ?? null,
              is_public: false,
            }),
          });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            const mapId = saveData.map?.id;
            if (mapId) {
              queryClient.invalidateQueries({ queryKey: ["recent-maps"] });
              router.replace(`/app/map/${mapId}`);
              return;
            }
          } else {
            showToast("Kunde inte spara kartan", "error");
          }
        } catch {
          showToast("Kunde inte spara kartan", "error");
        }
      }

      setStage("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setRetryable(false);
      setStage("error");
    }
  }, [pendingAction, confirmAnswers, confirmQuestions, generateAndRender, callClarify, prompt, user, router, queryClient, showToast]);

  // Template loading — skip AI pipeline entirely
  useEffect(() => {
    if (!templateId || pipelineRanRef.current) return;
    pipelineRanRef.current = true;

    const tpl = getTemplate(templateId);
    if (!tpl) {
      setError("Mallen hittades inte");
      setStage("error");
      return;
    }

    const tplManifest = tpl.manifest;
    const tplTitle = tpl.title;
    const sourceUrl = tplManifest.layers[0]?.sourceUrl;

    async function loadTemplate() {
      let geojson: GeoJSON.FeatureCollection | null = null;
      if (sourceUrl) {
        try {
          const res = await fetch(sourceUrl);
          if (res.ok) {
            const data = await res.json();
            if (data?.type === "FeatureCollection") geojson = data;
          }
        } catch { /* proceed without data — map will fetch from sourceUrl */ }
      }

      setManifest(tplManifest);
      setGeojsonData(geojson);
      setStage("ready");

      // Auto-save if logged in
      if (user) {
        setStage("saving");
        try {
          const saveRes = await fetch("/api/maps", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: tplManifest.title,
              prompt: `Mall: ${tplTitle}`,
              manifest: tplManifest as unknown as Record<string, unknown>,
              geojson_url: sourceUrl ?? null,
              is_public: false,
            }),
          });
          if (saveRes.ok) {
            const saveData = await saveRes.json();
            const mapId = saveData.map?.id;
            if (mapId) {
              queryClient.invalidateQueries({ queryKey: ["recent-maps"] });
              router.replace(`/app/map/${mapId}`);
              return;
            }
          }
        } catch { /* show map without save */ }
      }

      setStage("ready");
    }

    loadTemplate();
  }, [templateId, user, router, queryClient]);

  useEffect(() => {
    if (templateId) return;
    if (!prompt || pipelineRanRef.current) return;
    pipelineRanRef.current = true;
    runPipeline(prompt);
  }, [prompt, templateId, runPipeline]);

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
      try {
        const saveRes = await fetch("/api/maps", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: manifest.title ?? prompt.slice(0, 60),
            prompt,
            manifest: manifest as unknown as Record<string, unknown>,
            geojson_url: manifest.layers[0]?.sourceUrl ?? null,
            is_public: false,
          }),
        });
        if (saveRes.ok) {
          const saveData = await saveRes.json();
          const mapId = saveData.map?.id;
          if (mapId) {
            queryClient.invalidateQueries({ queryKey: ["recent-maps"] });
            router.replace(`/app/map/${mapId}`);
          }
        } else {
          showToast("Kunde inte spara — försök igen", "error");
        }
      } catch {
        showToast("Kunde inte spara — försök igen", "error");
      }
    },
    [manifest, prompt, queryClient, router, showToast],
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
            <button onClick={() => { setError(null); setRetryable(false); pipelineRanRef.current = false; runPipeline(prompt); }} style={{ fontFamily: "'Geist',sans-serif", fontSize: 14, color: "#8ecba0", background: "rgba(142,203,160,0.1)", border: "1px solid rgba(142,203,160,0.3)", borderRadius: 6, padding: "8px 16px", cursor: "pointer" }}>
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

class RetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableError";
  }
}
