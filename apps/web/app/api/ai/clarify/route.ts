import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { matchCatalog } from "../../../../lib/ai/data-catalog";
import { buildClarifyPrompt, CLARIFY_TOOLS } from "../../../../lib/ai/clarify-prompt";
import { profileDataset } from "../../../../lib/ai/profiler";
import { resolveAmenityQuery, queryOverpass } from "../../../../lib/ai/tools/overpass";
import { searchPublicData, getCachedData, fetchGeoJSON, hasNumericProperties } from "../../../../lib/ai/tools/data-search";
import { searchWebDatasets } from "../../../../lib/ai/tools/web-dataset-search";
import { searchDataCommons } from "../../../../lib/ai/tools/data-commons";
import { searchEurostat } from "../../../../lib/ai/tools/eurostat";
import { extractIntent, checkRegistry } from "../../../../lib/ai/tools/dataset-registry";
import { resolveOfficialStatsSources, type ResolvedSource } from "../../../../lib/ai/tools/official-stats-resolver";
import { resolvePxWeb } from "../../../../lib/ai/tools/pxweb-resolution";
import { classifyPipelineResult, buildTabularFallbackResponse, type TabularStash } from "../../../../lib/ai/pipeline-decision";
import { generateTabularSuggestions } from "../../../../lib/ai/tools/ai-suggestion-generator";
import type { ClarifyResponse, DatasetProfile } from "../../../../lib/ai/types";

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TOKENS = 1024;
const MAX_TOOL_ROUNDS = 3;

// ─── Geocoding helpers ──────────────────────────────────────

interface CityCoords {
  lat: number;
  lng: number;
  bbox: [number, number, number, number]; // [south, west, north, east]
}

/**
 * Known cities for bounding box resolution.
 * Avoids external geocoding calls for common cities.
 */
const KNOWN_CITIES: Record<string, CityCoords> = {
  // Nordic
  stockholm: { lat: 59.33, lng: 18.07, bbox: [59.2, 17.8, 59.45, 18.3] },
  göteborg: { lat: 57.71, lng: 11.97, bbox: [57.6, 11.8, 57.8, 12.1] },
  gothenburg: { lat: 57.71, lng: 11.97, bbox: [57.6, 11.8, 57.8, 12.1] },
  malmö: { lat: 55.61, lng: 13.0, bbox: [55.5, 12.85, 55.65, 13.15] },
  malmo: { lat: 55.61, lng: 13.0, bbox: [55.5, 12.85, 55.65, 13.15] },
  uppsala: { lat: 59.86, lng: 17.64, bbox: [59.8, 17.5, 59.95, 17.8] },
  copenhagen: { lat: 55.68, lng: 12.57, bbox: [55.6, 12.4, 55.75, 12.7] },
  köpenhamn: { lat: 55.68, lng: 12.57, bbox: [55.6, 12.4, 55.75, 12.7] },
  oslo: { lat: 59.91, lng: 10.75, bbox: [59.8, 10.5, 60.0, 11.0] },
  helsinki: { lat: 60.17, lng: 24.94, bbox: [60.1, 24.7, 60.3, 25.2] },
  // Western Europe
  london: { lat: 51.51, lng: -0.13, bbox: [51.3, -0.5, 51.7, 0.3] },
  paris: { lat: 48.86, lng: 2.35, bbox: [48.8, 2.2, 48.95, 2.5] },
  berlin: { lat: 52.52, lng: 13.41, bbox: [52.35, 13.1, 52.7, 13.8] },
  amsterdam: { lat: 52.37, lng: 4.9, bbox: [52.3, 4.75, 52.45, 5.05] },
  barcelona: { lat: 41.39, lng: 2.17, bbox: [41.3, 2.0, 41.5, 2.3] },
  rome: { lat: 41.9, lng: 12.5, bbox: [41.8, 12.3, 42.05, 12.7] },
  rom: { lat: 41.9, lng: 12.5, bbox: [41.8, 12.3, 42.05, 12.7] },
  madrid: { lat: 40.42, lng: -3.7, bbox: [40.3, -3.9, 40.55, -3.5] },
  munich: { lat: 48.14, lng: 11.58, bbox: [48.0, 11.35, 48.25, 11.8] },
  münchen: { lat: 48.14, lng: 11.58, bbox: [48.0, 11.35, 48.25, 11.8] },
  vienna: { lat: 48.21, lng: 16.37, bbox: [48.1, 16.2, 48.33, 16.55] },
  wien: { lat: 48.21, lng: 16.37, bbox: [48.1, 16.2, 48.33, 16.55] },
  prague: { lat: 50.08, lng: 14.44, bbox: [49.95, 14.25, 50.18, 14.65] },
  prag: { lat: 50.08, lng: 14.44, bbox: [49.95, 14.25, 50.18, 14.65] },
  lisbon: { lat: 38.72, lng: -9.14, bbox: [38.6, -9.3, 38.82, -9.0] },
  lissabon: { lat: 38.72, lng: -9.14, bbox: [38.6, -9.3, 38.82, -9.0] },
  dublin: { lat: 53.35, lng: -6.26, bbox: [53.25, -6.45, 53.45, -6.1] },
  zurich: { lat: 47.37, lng: 8.54, bbox: [47.3, 8.4, 47.44, 8.65] },
  zürich: { lat: 47.37, lng: 8.54, bbox: [47.3, 8.4, 47.44, 8.65] },
  brussels: { lat: 50.85, lng: 4.35, bbox: [50.78, 4.25, 50.92, 4.48] },
  bryssel: { lat: 50.85, lng: 4.35, bbox: [50.78, 4.25, 50.92, 4.48] },
  warsaw: { lat: 52.23, lng: 21.01, bbox: [52.1, 20.85, 52.35, 21.2] },
  budapest: { lat: 47.50, lng: 19.04, bbox: [47.35, 18.9, 47.6, 19.2] },
  athens: { lat: 37.98, lng: 23.73, bbox: [37.85, 23.6, 38.1, 23.9] },
  aten: { lat: 37.98, lng: 23.73, bbox: [37.85, 23.6, 38.1, 23.9] },
  edinburgh: { lat: 55.95, lng: -3.19, bbox: [55.88, -3.35, 56.02, -3.05] },
  milan: { lat: 45.46, lng: 9.19, bbox: [45.38, 9.05, 45.55, 9.35] },
  milano: { lat: 45.46, lng: 9.19, bbox: [45.38, 9.05, 45.55, 9.35] },
  istanbul: { lat: 41.01, lng: 28.98, bbox: [40.85, 28.6, 41.2, 29.35] },
  // Americas
  "new york": { lat: 40.71, lng: -74.01, bbox: [40.5, -74.3, 40.9, -73.7] },
  "los angeles": { lat: 34.05, lng: -118.24, bbox: [33.7, -118.7, 34.35, -117.9] },
  chicago: { lat: 41.88, lng: -87.63, bbox: [41.65, -87.85, 42.05, -87.4] },
  "san francisco": { lat: 37.77, lng: -122.42, bbox: [37.7, -122.55, 37.85, -122.35] },
  toronto: { lat: 43.65, lng: -79.38, bbox: [43.55, -79.55, 43.8, -79.2] },
  "mexico city": { lat: 19.43, lng: -99.13, bbox: [19.2, -99.4, 19.6, -98.9] },
  "buenos aires": { lat: -34.60, lng: -58.38, bbox: [-34.75, -58.55, -34.5, -58.25] },
  "são paulo": { lat: -23.55, lng: -46.63, bbox: [-23.75, -46.85, -23.35, -46.4] },
  "sao paulo": { lat: -23.55, lng: -46.63, bbox: [-23.75, -46.85, -23.35, -46.4] },
  "rio de janeiro": { lat: -22.91, lng: -43.17, bbox: [-23.1, -43.4, -22.75, -43.0] },
  bogota: { lat: 4.71, lng: -74.07, bbox: [4.5, -74.25, 4.85, -73.9] },
  bogotá: { lat: 4.71, lng: -74.07, bbox: [4.5, -74.25, 4.85, -73.9] },
  // Asia
  tokyo: { lat: 35.68, lng: 139.69, bbox: [35.5, 139.4, 35.85, 140.0] },
  mumbai: { lat: 19.08, lng: 72.88, bbox: [18.9, 72.75, 19.3, 73.05] },
  bangkok: { lat: 13.76, lng: 100.5, bbox: [13.6, 100.3, 13.9, 100.7] },
  singapore: { lat: 1.35, lng: 103.82, bbox: [1.2, 103.6, 1.5, 104.0] },
  seoul: { lat: 37.57, lng: 126.98, bbox: [37.43, 126.8, 37.7, 127.15] },
  beijing: { lat: 39.90, lng: 116.40, bbox: [39.7, 116.1, 40.1, 116.7] },
  peking: { lat: 39.90, lng: 116.40, bbox: [39.7, 116.1, 40.1, 116.7] },
  shanghai: { lat: 31.23, lng: 121.47, bbox: [31.05, 121.2, 31.4, 121.7] },
  dubai: { lat: 25.20, lng: 55.27, bbox: [25.0, 55.0, 25.35, 55.5] },
  "hong kong": { lat: 22.32, lng: 114.17, bbox: [22.15, 113.85, 22.55, 114.4] },
  delhi: { lat: 28.61, lng: 77.21, bbox: [28.4, 76.95, 28.85, 77.45] },
  // Africa & Oceania
  sydney: { lat: -33.87, lng: 151.21, bbox: [-34.1, 150.9, -33.6, 151.4] },
  melbourne: { lat: -37.81, lng: 144.96, bbox: [-38.0, 144.7, -37.6, 145.2] },
  "cape town": { lat: -33.93, lng: 18.42, bbox: [-34.1, 18.2, -33.75, 18.65] },
  kapstaden: { lat: -33.93, lng: 18.42, bbox: [-34.1, 18.2, -33.75, 18.65] },
  cairo: { lat: 30.04, lng: 31.24, bbox: [29.85, 31.0, 30.2, 31.5] },
  kairo: { lat: 30.04, lng: 31.24, bbox: [29.85, 31.0, 30.2, 31.5] },
  nairobi: { lat: -1.29, lng: 36.82, bbox: [-1.45, 36.65, -1.15, 37.0] },
};

function findCity(prompt: string): CityCoords | null {
  const lower = prompt.toLowerCase();
  for (const [name, coords] of Object.entries(KNOWN_CITIES)) {
    if (lower.includes(name)) return coords;
  }
  return null;
}

// ─── Overpass resolution ────────────────────────────────────

/**
 * Try to resolve a prompt as a POI query.
 * Returns { dataUrl, profile } if successful.
 */
async function tryOverpassResolution(
  prompt: string,
  origin: string,
): Promise<{ dataUrl: string; profile: DatasetProfile } | null> {
  const city = findCity(prompt);
  if (!city) return null;

  const query = resolveAmenityQuery(prompt, city.bbox);
  if (!query) return null;

  const fc = await queryOverpass(query);
  if (!fc || fc.features.length === 0) return null;

  const profile = profileDataset(fc);
  const dataUrl = `/api/geo/overpass?type=${encodeURIComponent(query.value)}&bbox=${city.bbox.join(",")}`;

  return { dataUrl, profile };
}

// ─── Extracting JSON from AI response ───────────────────────

function extractJSON(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

// ─── Tool execution ─────────────────────────────────────────

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  if (name === "search_public_data") {
    const query = input.query as string;
    const url = input.url as string | undefined;
    const result = await searchPublicData(query, url);
    return JSON.stringify(result);
  }
  if (name === "search_web_datasets") {
    const query = input.query as string;
    const result = await searchWebDatasets(query);
    return JSON.stringify(result);
  }
  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

// ─── Route handler ──────────────────────────────────────────

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await request.json();
    const prompt = body?.prompt;
    const answers: Record<string, string> = body?.answers ?? {};

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'prompt' field" },
        { status: 400 },
      );
    }

    const trimmedPrompt = prompt.trim();

    // Combine prompt with any previous answers
    const fullContext = Object.keys(answers).length > 0
      ? `${trimmedPrompt}\n\nUser clarifications:\n${Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join("\n")}`
      : trimmedPrompt;

    // ── Fast path 1: Catalog match ─────────────────────────
    // Catalog entries have curated geometry types (polygon for countries,
    // point for cities/earthquakes) — checked first to avoid REST Countries
    // returning Point geometry for queries that need polygons.
    const catalogMatches = matchCatalog(fullContext);
    if (catalogMatches.length > 0) {
      const best = catalogMatches[0];

      // Check if the endpoint requires an API key that's not set
      if (best.requiresEnv && !process.env[best.requiresEnv]) {
        // Skip this match — try other resolution paths
      } else {
        // Fetch and profile the data for the generation step
        let profile: DatasetProfile | null = null;
        try {
          const res = await fetch(
            new URL(best.endpoint, request.url).toString(),
            { signal: AbortSignal.timeout(10_000) },
          );
          if (res.ok) {
            const geojson = await res.json();
            if (geojson?.type === "FeatureCollection") {
              profile = profileDataset(geojson);
            }
          }
        } catch {
          // Profiling failed — proceed without profile
        }

        const response: ClarifyResponse = {
          ready: true,
          resolvedPrompt: fullContext,
          dataUrl: best.endpoint,
          ...(profile ? { dataProfile: profile } : {}),
        };

        return NextResponse.json(response);
      }
    }

    // ── Fast path 2: Data Commons (subnational statistics) ──────
    // Runs BEFORE World Bank because DC uses AI intent extraction
    // that handles any language. If the prompt is subnational, DC
    // catches it here; if not, it returns { found: false } fast and
    // World Bank handles country-level queries below.
    const dcResult = await searchDataCommons(fullContext);
    if (dcResult.found && dcResult.cacheKey) {
      const dataUrl = `/api/geo/cached/${encodeURIComponent(dcResult.cacheKey)}`;
      const response: ClarifyResponse = {
        ready: true,
        resolvedPrompt: dcResult.englishPrompt ?? fullContext,
        dataUrl,
        dataProfile: dcResult.profile,
      };
      return NextResponse.json(response);
    }

    // ── Fast path 2.5: Eurostat (European country-level statistics) ──
    // Uses AI intent extraction — handles any language.
    // Covers indicators World Bank lacks (minimum wage, Gini, etc.).
    const eurostatResult = await searchEurostat(fullContext);
    if (eurostatResult.found && eurostatResult.cacheKey) {
      const dataUrl = `/api/geo/cached/${encodeURIComponent(eurostatResult.cacheKey)}`;
      const response: ClarifyResponse = {
        ready: true,
        resolvedPrompt: eurostatResult.englishPrompt ?? fullContext,
        dataUrl,
        dataProfile: eurostatResult.profile,
      };
      return NextResponse.json(response);
    }

    // ── Fast path 2.7: World Bank, EONET, REST Countries ────────
    // Country-level indicators (e.g. "GDP per capita").
    const directSearch = await searchPublicData(fullContext);
    if (directSearch.found && directSearch.cacheKey) {
      const dataUrl = `/api/geo/cached/${encodeURIComponent(directSearch.cacheKey)}`;
      const response: ClarifyResponse = {
        ready: true,
        resolvedPrompt: fullContext,
        dataUrl,
        dataProfile: directSearch.profile,
      };
      return NextResponse.json(response);
    }

    // ── Fast path 3: Official stats (PxWeb) ────────────────────
    // Run PxWeb resolution BEFORE the web-dataset registry so that
    // official statistics with proper geometry joins take priority
    // over previously cached geometry-only web search results.
    const intent = extractIntent(fullContext);
    const officialSources = resolveOfficialStatsSources(intent, fullContext);

    let pxTabularFallback: TabularStash | null = null;

    if (officialSources.length > 0) {
      const topPxWeb = officialSources.find(
        (s) => s.source.apiType === "pxweb" && s.source.baseUrl.includes("/v2"),
      );
      if (topPxWeb) {
        try {
          const pxResolution = await resolvePxWeb(topPxWeb.source, fullContext);
          const decision = classifyPipelineResult(pxResolution, fullContext);

          if (decision.kind === "terminate") {
            return NextResponse.json(decision.response);
          }
          if (decision.kind === "stash_tabular") {
            pxTabularFallback = decision.stash;
          }
          // "continue": fall through to next fast path
        } catch {
          // PxWeb resolution failed — continue to next fast path
        }
      }
    }

    // ── Fast path 3.5: Dataset registry (previously discovered web datasets)
    // Skip when PxWeb already found metric data — the registry may return
    // unrelated cached geometry from a previous query.
    if (!pxTabularFallback) {
      const registryHit = await checkRegistry(intent);
      if (registryHit) {
        const registryCached = await getCachedData(registryHit.cacheKey);
        // Only serve cached data if it has actual numeric values (not boundary-only)
        if (registryCached && hasNumericProperties(registryCached.data)) {
          const response: ClarifyResponse = {
            ready: true,
            resolvedPrompt: fullContext,
            dataUrl: `/api/geo/cached/${encodeURIComponent(registryHit.cacheKey)}`,
            dataProfile: registryCached.profile,
          };
          return NextResponse.json(response);
        }
        // Data expired from cache or boundary-only — re-fetch from stored URL
        const refetched = await fetchGeoJSON(registryHit.datasetUrl, { requireNumericData: true });
        if (refetched.found && refetched.cacheKey) {
          const response: ClarifyResponse = {
            ready: true,
            resolvedPrompt: fullContext,
            dataUrl: `/api/geo/cached/${encodeURIComponent(refetched.cacheKey)}`,
            dataProfile: refetched.profile,
          };
          return NextResponse.json(response);
        }
      }
    }

    // ── Fast path 4: Overpass POI resolution ──────────────────
    const overpassResult = await tryOverpassResolution(fullContext, request.url);
    if (overpassResult) {
      const response: ClarifyResponse = {
        ready: true,
        resolvedPrompt: fullContext,
        dataUrl: overpassResult.dataUrl,
        dataProfile: overpassResult.profile,
      };

      return NextResponse.json(response);
    }

    // ── Fast path 5: Web dataset search ───────────────────────
    // All internal sources failed — try searching the internet for datasets
    // before falling back to the AI clarification loop.
    // If official sources were identified, enrich the search query.
    // Set ATLAS_DISABLE_WEB_SEARCH=true in .env.local to skip during development.
    const webApiKey = process.env.ANTHROPIC_API_KEY;
    if (webApiKey && process.env.ATLAS_DISABLE_WEB_SEARCH !== "true") {
      try {
        const webQuery = fullContext;
        const sourceHints = officialSources.length > 0
          ? officialSources.slice(0, 3).map((s) => ({
              agencyName: s.source.agencyName,
              baseUrl: s.source.baseUrl,
              formats: s.source.formats,
            }))
          : undefined;
        const webResult = await searchWebDatasets(webQuery, sourceHints);
        if (webResult.found && webResult.cacheKey) {
          // If PxWeb already found metric data for this query, prefer the
          // tabular fallback — the web search may have found unrelated data
          // (e.g. boundary polygons or shipping routes instead of income).
          if (!pxTabularFallback) {
            const dataUrl = `/api/geo/cached/${encodeURIComponent(webResult.cacheKey)}`;
            const response: ClarifyResponse = {
              ready: true,
              resolvedPrompt: fullContext,
              dataUrl,
              dataProfile: webResult.profile,
            };
            return NextResponse.json(response);
          }
          // Otherwise skip web result — tabular fallback has verified metric data
        }
      } catch {
        // Web search failed — continue to AI clarification
      }
    }

    // ── Tabular fallback: PxWeb found data but no geometry ────
    // All map-capable fast paths exhausted. If PxWeb found tabular data,
    // surface it with resolutionStatus: "tabular_only" so the frontend
    // knows this is NOT a map-ready result.
    if (pxTabularFallback) {
      let suggestions: string[] = [];
      if (process.env.ANTHROPIC_API_KEY && pxTabularFallback.tableLabel) {
        suggestions = await generateTabularSuggestions(
          fullContext,
          pxTabularFallback.tableLabel,
          pxTabularFallback.reasons ?? [],
        );
      }
      return NextResponse.json(
        buildTabularFallbackResponse(pxTabularFallback, fullContext, suggestions),
      );
    }

    // ── Slow path: AI clarification with tool use ────────────
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // No API key — return a basic response based on heuristics
      const response: ClarifyResponse = {
        ready: false,
        dataWarning:
          "Atlas needs data to create your map. You can upload a CSV file with your data, or try a prompt that matches our built-in datasets (e.g. 'show earthquakes' or 'world population').",
        questions: [
          {
            id: "data-source",
            question: "Would you like to upload your own data or use a built-in dataset?",
            options: ["Upload CSV", "Show earthquakes", "World countries", "World cities"],
            aspect: "data-source",
          },
        ],
      };
      return NextResponse.json(response);
    }

    const client = new Anthropic({ apiKey });

    // Tool use loop: let the AI call search tools and then respond
    // Include official source context if available, so the AI knows
    // about relevant APIs when crafting search queries.
    const officialSourceContext = officialSources.length > 0
      ? `\n\nNote: Relevant official statistics sources identified:\n${officialSources.slice(0, 5).map((s) => `- ${s.source.agencyName} (${s.source.baseUrl}) — topics: ${s.source.coverageTags.join(", ")}`).join("\n")}\nUse search_web_datasets to find downloadable data from these or similar sources.`
      : "";

    let messages: Anthropic.MessageParam[] = [
      { role: "user", content: fullContext + officialSourceContext },
    ];

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const aiResponse = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildClarifyPrompt(),
        tools: CLARIFY_TOOLS,
        messages,
      });

      // Check if the AI wants to use tools
      if (aiResponse.stop_reason === "tool_use") {
        const toolUseBlocks = aiResponse.content.filter(
          (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
        );

        // Add the assistant message with tool use
        messages.push({ role: "assistant", content: aiResponse.content });

        // Execute each tool call and add results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const toolUse of toolUseBlocks) {
          const result = await executeTool(
            toolUse.name,
            toolUse.input as Record<string, unknown>,
          );
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: result,
          });
        }

        messages.push({ role: "user", content: toolResults });
        continue;
      }

      // AI finished — extract the text response
      const textBlock = aiResponse.content.find(
        (b): b is Anthropic.TextBlock => b.type === "text",
      );

      if (!textBlock) {
        return NextResponse.json(
          { error: "No text in AI clarification response" },
          { status: 502 },
        );
      }

      try {
        const parsed = extractJSON(textBlock.text) as {
          ready?: boolean;
          resolvedPrompt?: string;
          matchedCatalogId?: string;
          useOverpass?: { type: string; city: string };
          searchedData?: { cacheKey: string; description: string };
          questions?: Array<{
            id: string;
            question: string;
            options?: string[];
            recommended?: string;
            aspect?: string;
          }>;
          dataWarning?: string;
        };

        // If AI matched a catalog entry, resolve it
        if (parsed.matchedCatalogId) {
          const entry = catalogMatches.find((e) => e.id === parsed.matchedCatalogId)
            ?? matchCatalog(parsed.matchedCatalogId)[0];

          if (entry) {
            const response: ClarifyResponse = {
              ready: true,
              resolvedPrompt: parsed.resolvedPrompt ?? fullContext,
              dataUrl: entry.endpoint,
            };
            return NextResponse.json(response);
          }
        }

        // If AI suggested Overpass, try resolving
        if (parsed.useOverpass) {
          const city = findCity(parsed.useOverpass.city);
          if (city) {
            const query = resolveAmenityQuery(parsed.useOverpass.type, city.bbox);
            if (query) {
              const dataUrl = `/api/geo/overpass?type=${encodeURIComponent(query.value)}&bbox=${city.bbox.join(",")}`;
              const response: ClarifyResponse = {
                ready: true,
                resolvedPrompt: parsed.resolvedPrompt ?? fullContext,
                dataUrl,
              };
              return NextResponse.json(response);
            }
          }
        }

        // If AI used search_public_data and found data
        if (parsed.searchedData?.cacheKey) {
          const cached = await getCachedData(parsed.searchedData.cacheKey);
          const dataUrl = `/api/geo/cached/${encodeURIComponent(parsed.searchedData.cacheKey)}`;
          const response: ClarifyResponse = {
            ready: true,
            resolvedPrompt: parsed.resolvedPrompt ?? fullContext,
            dataUrl,
            dataProfile: cached?.profile,
          };
          return NextResponse.json(response);
        }

        // Return clarification questions
        const response: ClarifyResponse = {
          ready: parsed.ready ?? false,
          resolvedPrompt: parsed.resolvedPrompt ?? undefined,
          questions: parsed.questions?.map((q) => ({
            id: q.id,
            question: q.question,
            options: q.options,
            ...(q.recommended ? { recommended: q.recommended } : {}),
            aspect: (q.aspect ?? "data-source") as "geography" | "metric" | "timeframe" | "data-source" | "visualization",
          })),
          dataWarning: parsed.dataWarning ?? undefined,
        };

        return NextResponse.json(response);
      } catch {
        // JSON parse failed — return generic clarification
        const response: ClarifyResponse = {
          ready: false,
          questions: [
            {
              id: "intent",
              question: "What kind of map would you like to create?",
              options: ["Show locations on a map", "Compare regions", "Show density/heatmap", "Upload my own data"],
              aspect: "visualization",
            },
          ],
        };
        return NextResponse.json(response);
      }
    }

    // Exhausted tool rounds — return what we have
    return NextResponse.json({
      ready: false,
      dataWarning: "Could not resolve data source. Try uploading your own data or use a built-in dataset.",
      questions: [
        {
          id: "data-source",
          question: "Would you like to upload your own data?",
          options: ["Upload CSV", "Show earthquakes", "World countries"],
          aspect: "data-source",
        },
      ],
    } satisfies ClarifyResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Clarification failed", detail: message },
      { status: 500 },
    );
  }
}
