import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { matchCatalog } from "../../../../lib/ai/data-catalog";
import { buildClarifyPrompt, CLARIFY_TOOLS } from "../../../../lib/ai/clarify-prompt";
import { profileDataset } from "../../../../lib/ai/profiler";
import { resolveAmenityQuery, queryOverpass } from "../../../../lib/ai/tools/overpass";
import { searchPublicData, getCachedData } from "../../../../lib/ai/tools/data-search";
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
  stockholm: { lat: 59.33, lng: 18.07, bbox: [59.2, 17.8, 59.45, 18.3] },
  göteborg: { lat: 57.71, lng: 11.97, bbox: [57.6, 11.8, 57.8, 12.1] },
  gothenburg: { lat: 57.71, lng: 11.97, bbox: [57.6, 11.8, 57.8, 12.1] },
  malmö: { lat: 55.61, lng: 13.0, bbox: [55.5, 12.85, 55.65, 13.15] },
  malmo: { lat: 55.61, lng: 13.0, bbox: [55.5, 12.85, 55.65, 13.15] },
  uppsala: { lat: 59.86, lng: 17.64, bbox: [59.8, 17.5, 59.95, 17.8] },
  london: { lat: 51.51, lng: -0.13, bbox: [51.3, -0.5, 51.7, 0.3] },
  paris: { lat: 48.86, lng: 2.35, bbox: [48.8, 2.2, 48.95, 2.5] },
  berlin: { lat: 52.52, lng: 13.41, bbox: [52.35, 13.1, 52.7, 13.8] },
  "new york": { lat: 40.71, lng: -74.01, bbox: [40.5, -74.3, 40.9, -73.7] },
  tokyo: { lat: 35.68, lng: 139.69, bbox: [35.5, 139.4, 35.85, 140.0] },
  sydney: { lat: -33.87, lng: 151.21, bbox: [-34.1, 150.9, -33.6, 151.4] },
  copenhagen: { lat: 55.68, lng: 12.57, bbox: [55.6, 12.4, 55.75, 12.7] },
  köpenhamn: { lat: 55.68, lng: 12.57, bbox: [55.6, 12.4, 55.75, 12.7] },
  oslo: { lat: 59.91, lng: 10.75, bbox: [59.8, 10.5, 60.0, 11.0] },
  helsinki: { lat: 60.17, lng: 24.94, bbox: [60.1, 24.7, 60.3, 25.2] },
  amsterdam: { lat: 52.37, lng: 4.9, bbox: [52.3, 4.75, 52.45, 5.05] },
  barcelona: { lat: 41.39, lng: 2.17, bbox: [41.3, 2.0, 41.5, 2.3] },
  rome: { lat: 41.9, lng: 12.5, bbox: [41.8, 12.3, 42.05, 12.7] },
  rom: { lat: 41.9, lng: 12.5, bbox: [41.8, 12.3, 42.05, 12.7] },
  madrid: { lat: 40.42, lng: -3.7, bbox: [40.3, -3.9, 40.55, -3.5] },
  mumbai: { lat: 19.08, lng: 72.88, bbox: [18.9, 72.75, 19.3, 73.05] },
  bangkok: { lat: 13.76, lng: 100.5, bbox: [13.6, 100.3, 13.9, 100.7] },
  singapore: { lat: 1.35, lng: 103.82, bbox: [1.2, 103.6, 1.5, 104.0] },
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

    // ── Fast path 2: Specific data search (World Bank, EONET, REST Countries)
    // Fallback for indicator-specific data not in the catalog
    // (e.g. "GDP per capita" → actual per-capita values from World Bank).
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

    // ── Fast path 3: Overpass POI resolution ─────────────────
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
    let messages: Anthropic.MessageParam[] = [
      { role: "user", content: fullContext },
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
