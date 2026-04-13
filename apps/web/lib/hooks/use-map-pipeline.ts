import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import type { MapManifest } from "@atlas/data-models";
import { decideClarifyAction } from "@/lib/ai/clarify-action";
import type { GenerateAction } from "@/lib/ai/clarify-action";
import type { ClarifyResponse, ClarificationQuestion } from "@/lib/ai/types";
import { buildConfirmationQuestions, formatPreferences } from "@/lib/ai/confirmation-questions";
import { getTemplate } from "@/lib/templates";
import {
  type Stage,
  MAX_AUTO_ANSWER_ROUNDS,
  RetryableError,
} from "@/app/app/(editor)/map/_lib/pipeline-stages";
import { fetchGeoJSON } from "@/app/app/(editor)/map/_lib/fetch-geojson";
import type { SaveMapResult, SaveMapArgs } from "@/lib/hooks/use-map-persist";

export interface UseMapPipelineApi {
  stage: Stage;
  error: string | null;
  retryable: boolean;
  manifest: MapManifest | null;
  geojsonData: GeoJSON.FeatureCollection | null;
  clarifyQuestions: ClarificationQuestion[];
  clarifyWarning: string | null;
  tabularSuggestions: string[];
  agencyHint: { agencyName: string; portalUrl: string } | null;
  confirmQuestions: ClarificationQuestion[];
  confirmAnswers: Record<string, string>;
  setManifest: React.Dispatch<React.SetStateAction<MapManifest | null>>;
  setGeojsonData: React.Dispatch<React.SetStateAction<GeoJSON.FeatureCollection | null>>;
  setConfirmAnswers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleAnswer: (questionId: string, answer: string) => void;
  handleSuggestion: (suggestion: string) => void;
  handleConfirmSubmit: () => Promise<void>;
  retry: () => void;
}

/**
 * Owns the AI map-creation pipeline for /app/map/new.
 *
 * Coordinates clarify → confirm → generate → save flow plus the
 * template-loading shortcut. Both entry effects guard against React 18
 * strict-mode double-mount via `pipelineRanRef`.
 *
 * Page-owned state (auth modal, legend items) deliberately stays out of
 * this hook — the boundary is "AI flow" vs "UI chrome".
 */
export function useMapPipeline({
  prompt,
  templateId,
  artifactId,
  user,
  saveAndRedirect,
  showToast,
}: {
  prompt: string;
  templateId: string | null;
  artifactId: string | null;
  user: User | null;
  saveAndRedirect: (args: SaveMapArgs) => Promise<SaveMapResult>;
  showToast: (msg: string, type: "success" | "error") => void;
}): UseMapPipelineApi {
  const router = useRouter();

  const [stage, setStage] = useState<Stage>("clarifying");
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [manifest, setManifest] = useState<MapManifest | null>(null);
  const [geojsonData, setGeojsonData] = useState<GeoJSON.FeatureCollection | null>(null);
  const pipelineRanRef = useRef(false);

  const [clarifyQuestions, setClarifyQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarifyWarning, setClarifyWarning] = useState<string | null>(null);
  const [tabularSuggestions, setTabularSuggestions] = useState<string[]>([]);
  const [agencyHint, setAgencyHint] = useState<{ agencyName: string; portalUrl: string } | null>(null);

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
      const geojson = geoUrl
        ? await fetchGeoJSON(geoUrl, { throwOnExpired: true })
        : null;

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
    [artifactId],
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
          const saveResult = await saveAndRedirect({
            title: generatedManifest.title ?? promptText.slice(0, 60),
            prompt: promptText,
            manifest: generatedManifest,
            geojsonUrl: geoUrl,
          });
          if (saveResult.ok) return;
          showToast("Kunde inte spara kartan", "error");
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
    [user, callClarify, generateAndRender, saveAndRedirect, showToast],
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
      // Reset the strict-mode guard so the prompt effect can re-fire when
      // the URL change re-renders us with the new searchParam.
      pipelineRanRef.current = false;
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
        const saveResult = await saveAndRedirect({
          title: generatedManifest.title ?? prompt.slice(0, 60),
          prompt,
          manifest: generatedManifest,
          geojsonUrl: geoUrl,
        });
        if (saveResult.ok) return;
        showToast("Kunde inte spara kartan", "error");
      }

      setStage("ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setRetryable(false);
      setStage("error");
    }
  }, [pendingAction, confirmAnswers, confirmQuestions, generateAndRender, callClarify, prompt, user, saveAndRedirect, showToast]);

  const retry = useCallback(() => {
    setError(null);
    setRetryable(false);
    pipelineRanRef.current = false;
    runPipeline(prompt);
  }, [prompt, runPipeline]);

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
      const geojson = sourceUrl ? await fetchGeoJSON(sourceUrl) : null;

      setManifest(tplManifest);
      setGeojsonData(geojson);
      setStage("ready");

      // Auto-save if logged in — silently proceed without save on failure
      if (user) {
        setStage("saving");
        const result = await saveAndRedirect({
          title: tplManifest.title,
          prompt: `Mall: ${tplTitle}`,
          manifest: tplManifest,
          geojsonUrl: sourceUrl,
        });
        if (result.ok) return;
      }

      setStage("ready");
    }

    loadTemplate().catch((err) => {
      const message = err instanceof Error ? err.message : "Mallen kunde inte laddas";
      setError(message);
      setRetryable(false);
      setStage("error");
    });
  }, [templateId, user, saveAndRedirect]);

  // AI prompt pipeline
  useEffect(() => {
    if (templateId) return;
    if (!prompt || pipelineRanRef.current) return;
    pipelineRanRef.current = true;
    runPipeline(prompt);
  }, [prompt, templateId, runPipeline]);

  return {
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
    setGeojsonData,
    setConfirmAnswers,
    handleAnswer,
    handleSuggestion,
    handleConfirmSubmit,
    retry,
  };
}
