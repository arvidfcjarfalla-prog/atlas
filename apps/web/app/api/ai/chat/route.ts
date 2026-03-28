/**
 * Streaming AI chat endpoint.
 *
 * Replaces the old edit-map JSON-response approach with SSE streaming.
 * The AI responds freely in text and calls tools when it needs to
 * change the map, search for data, or fetch URLs.
 *
 * SSE events:
 *   text-delta       → streamed text chunk
 *   tool-call        → { toolName, args }
 *   tool-result      → { toolName, result }
 *   manifest-update  → { manifest, dataUrl? }
 *   done             → stream complete
 *   error            → { message }
 */

import { streamText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { MODELS } from "../../../../lib/ai/ai-client";
import { buildAgentPrompt } from "../../../../lib/ai/agent-prompt";
import { classifyChatSkill } from "../../../../lib/ai/skills/router";
import { getChatSkillTools } from "../../../../lib/ai/skills/prompts";
import { validateManifest } from "../../../../lib/ai/validators";
import { applyGeometryGuards } from "../../../../lib/ai/geometry-guards";
import { scoreManifest } from "../../../../lib/ai/quality-scorer";
import { profileDataset } from "../../../../lib/ai/profiler";
import { searchPublicData, setCache, getCachedData } from "../../../../lib/ai/tools/data-search";
import { searchEurostat } from "../../../../lib/ai/tools/eurostat";
import { searchDataCommons } from "../../../../lib/ai/tools/data-commons";
import { resolveAmenityQuery, queryOverpass } from "../../../../lib/ai/tools/overpass";
import { searchWebDatasets } from "../../../../lib/ai/tools/web-dataset-search";
import { fetchAndParse, validateFetchUrl } from "../../../../lib/ai/tools/url-fetcher";
import { extractIntent } from "../../../../lib/ai/tools/dataset-registry";
import { resolveOfficialStatsSources } from "../../../../lib/ai/tools/official-stats-resolver";
import { resolvePxWeb } from "../../../../lib/ai/tools/pxweb-resolution";
import { getStatsAdapter } from "../../../../lib/ai/tools/pxweb-client";
import { classifyPipelineResult } from "../../../../lib/ai/pipeline-decision";
import type { MapManifest } from "@atlas/data-models";
import type { DatasetProfile } from "../../../../lib/ai/types";
import { log } from "../../../../lib/logger";
import { reportError } from "../../../../lib/error-reporter";
import { createHash } from "node:crypto";

// ─── Types ──────────────────────────────────────────────────

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ─── Geocode helper (Photon) ────────────────────────────────

async function geocodeCity(
  city: string,
): Promise<{ lat: number; lng: number; bbox: [number, number, number, number] } | null> {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(city)}&limit=1&osm_tag=place`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const data = await res.json();
    const feat = data?.features?.[0];
    if (!feat) return null;
    const [lng, lat] = feat.geometry.coordinates;
    const d = 0.05;
    return { lat, lng, bbox: [lat - d, lng - d, lat + d, lng + d] };
  } catch {
    return null;
  }
}

// ─── SSE helpers ─────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ─── Route handler ──────────────────────────────────────────

export const maxDuration = 60;

export async function POST(request: Request) {
  const t0 = Date.now();
  try {
    const body = await request.json();
    const manifest: MapManifest | undefined = body?.manifest;
    const message: string | undefined = body?.message;
    const chatHistory: ChatMessage[] = body?.chatHistory ?? [];
    const dataProfile: DatasetProfile | undefined = body?.dataProfile;

    if (!manifest || !message) {
      return new Response(
        JSON.stringify({ error: "Missing manifest or message" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // Classify message into a skill for focused prompt + tool selection
    const skill = classifyChatSkill(message, !!dataProfile);
    const enabledTools = getChatSkillTools(skill);

    log("agent.start", { messageLength: message.length, skill });

    const recentHistory = chatHistory.slice(-10);
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...recentHistory,
      { role: "user" as const, content: message },
    ];

    // Track data URLs found by tools
    let latestDataUrl: string | undefined;
    let latestManifest: MapManifest | undefined;

    // Build tools — conditionally include based on skill classification.
    // Conditional spreading preserves strong typing for streamText.
    const result = streamText({
      model: MODELS.generation(),
      maxOutputTokens: 4096,
      system: buildAgentPrompt(manifest, dataProfile, skill),
      messages,
      tools: {
        // ── Tool: Update manifest ───────────────────────────────
        ...(enabledTools.has("update_manifest") ? {
          update_manifest: tool({
            description:
              "Update the map manifest. Pass the complete updated manifest object. The server validates it before applying.",
            inputSchema: z.object({
              manifest: z.record(z.string(), z.unknown()).describe("The complete updated MapManifest object"),
            }),
            execute: async ({ manifest: newManifest }) => {
              log("agent.tool_call", { tool: "update_manifest" });
              const m = newManifest as unknown as MapManifest;
              const validation = validateManifest(m);
              if (!validation.valid) {
                return {
                  success: false,
                  errors: validation.errors,
                };
              }

              // Geometry guards: auto-correct family↔geometry mismatches
              if (dataProfile) {
                const guardWarnings = applyGeometryGuards(m, dataProfile);
                validation.warnings.push(...guardWarnings);
              }

              // Quality scoring: reject low-quality manifests so AI self-corrects
              const quality = scoreManifest(m, dataProfile ?? undefined);
              if (quality.total < 50) {
                return {
                  success: false,
                  errors: [`Quality score too low (${quality.total}/100): ${quality.deductions.join("; ")}`],
                };
              }

              latestManifest = m;
              return {
                success: true,
                warnings: validation.warnings,
                qualityScore: quality.total,
              };
            },
          }),
        } : {}),

        // ── Tool: Search catalog data ───────────────────────────
        ...(enabledTools.has("search_data") ? {
          search_data: tool({
            description:
              "Search for statistical datasets (GDP, population, income, unemployment, emissions, etc.) from PxWeb/SCB, Eurostat, World Bank, and Data Commons. Supports subnational data for Nordic countries via PxWeb.",
            inputSchema: z.object({
              query: z.string().describe("Description of the data needed"),
            }),
            execute: async ({ query }) => {
              log("agent.tool_call", { tool: "search_data", query });

              // Try PxWeb first for subnational data (SCB, SSB, etc.)
              const intent = extractIntent(query);
              const officialSources = resolveOfficialStatsSources(intent, query);
              const topPxWeb = officialSources.find(
                (s) => getStatsAdapter(s.source) !== null,
              );

              if (topPxWeb) {
                try {
                  const pxResult = await resolvePxWeb(topPxWeb.source, query);
                  const decision = classifyPipelineResult(pxResult, query);
                  if (decision.kind === "terminate" && decision.response.ready && decision.response.dataUrl) {
                    latestDataUrl = decision.response.dataUrl;
                    return {
                      found: true,
                      source: `PxWeb (${topPxWeb.source.agencyName})`,
                      dataUrl: latestDataUrl,
                      profile: decision.response.dataProfile,
                    };
                  }
                } catch (e) {
                  log("agent.pxweb_error", { error: e instanceof Error ? e.message : String(e) });
                }
              }

              // Search all other sources in parallel
              const [eurostat, wb, dc] = await Promise.allSettled([
                searchEurostat(query),
                searchPublicData(query),
                searchDataCommons(query),
              ]);

              // Pick first fulfilled result, preferring Eurostat > WB > DC
              const sources = [
                { result: eurostat, name: "Eurostat" },
                { result: wb, name: "World Bank" },
                { result: dc, name: "Data Commons" },
              ];

              for (const { result, name } of sources) {
                if (result.status === "fulfilled" && result.value.found && result.value.cacheKey) {
                  latestDataUrl = `/api/geo/cached/${encodeURIComponent(result.value.cacheKey)}`;
                  return {
                    found: true,
                    source: name,
                    dataUrl: latestDataUrl,
                    profile: result.value.profile,
                  };
                }
              }

              return { found: false, error: "No matching dataset found in catalog" };
            },
          }),
        } : {}),

        // ── Tool: Search POI ────────────────────────────────────
        ...(enabledTools.has("search_poi") ? {
          search_poi: tool({
            description:
              "Search for points of interest (restaurants, cafes, parks, hospitals, etc.) in a city via OpenStreetMap.",
            inputSchema: z.object({
              amenity: z.string().describe("Type of place, e.g. 'restaurant', 'cafe', 'park'"),
              city: z.string().describe("City name, e.g. 'Stockholm', 'Paris'"),
            }),
            execute: async ({ amenity, city }) => {
              log("agent.tool_call", { tool: "search_poi", amenity, city });
              const geo = await geocodeCity(city);
              if (!geo) return { found: false, error: `Could not find city: ${city}` };

              const query = resolveAmenityQuery(amenity, geo.bbox);
              if (!query) return { found: false, error: `Unknown amenity type: ${amenity}` };

              const fc = await queryOverpass(query);
              if (!fc || fc.features.length === 0) {
                return { found: false, error: `No ${amenity} found in ${city}` };
              }

              const profile = profileDataset(fc);
              const cacheKey = `poi-${amenity}-${city.toLowerCase().replace(/\s+/g, "-")}`;
              await setCache(cacheKey, {
                data: fc,
                profile,
                source: "OpenStreetMap",
                description: `${amenity} in ${city}`,
                timestamp: Date.now(),
              });

              latestDataUrl = `/api/geo/cached/${encodeURIComponent(cacheKey)}`;
              return {
                found: true,
                source: "OpenStreetMap",
                dataUrl: latestDataUrl,
                featureCount: fc.features.length,
                profile,
                center: { lat: geo.lat, lng: geo.lng },
              };
            },
          }),
        } : {}),

        // ── Tool: Web search for datasets ───────────────────────
        ...(enabledTools.has("search_web") ? {
          search_web: tool({
            description:
              "Search the internet for downloadable datasets (CSV, GeoJSON). Use as fallback when search_data doesn't find what's needed.",
            inputSchema: z.object({
              query: z.string().describe("Description of the dataset to search for"),
            }),
            execute: async ({ query }) => {
              log("agent.tool_call", { tool: "search_web", query });
              const result = await searchWebDatasets(query);
              if (result.found && result.cacheKey) {
                latestDataUrl = `/api/geo/cached/${encodeURIComponent(result.cacheKey)}`;
                return {
                  found: true,
                  source: result.source,
                  description: result.description,
                  dataUrl: latestDataUrl,
                  featureCount: result.featureCount,
                  profile: result.profile,
                };
              }
              return { found: false, error: result.error ?? "No datasets found" };
            },
          }),
        } : {}),

        // ── Tool: Fetch URL ─────────────────────────────────────
        ...(enabledTools.has("fetch_url") ? {
          fetch_url: tool({
            description:
              "Download and parse a URL (CSV or GeoJSON). Use when the user provides a data URL or you have a known dataset URL.",
            inputSchema: z.object({
              url: z.string().url().describe("The URL to fetch"),
            }),
            execute: async ({ url }) => {
              log("agent.tool_call", { tool: "fetch_url", url });
              try {
                const hash = createHash("sha256").update(url).digest("hex").slice(0, 12);
                const cacheKey = `url-${hash}`;

                // Check cache first
                const cached = await getCachedData(cacheKey);
                if (cached) {
                  latestDataUrl = `/api/geo/cached/${encodeURIComponent(cacheKey)}`;
                  return {
                    found: true,
                    dataUrl: latestDataUrl,
                    profile: cached.profile,
                    description: cached.description,
                    cached: true,
                  };
                }

                const result = await fetchAndParse(url, { cacheKey });
                if (!result) {
                  return { found: false, error: "URL did not contain usable geographic data" };
                }

                latestDataUrl = `/api/geo/cached/${encodeURIComponent(cacheKey)}`;
                return {
                  found: true,
                  dataUrl: latestDataUrl,
                  profile: result.profile,
                  description: result.description,
                };
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Fetch failed";
                return { found: false, error: msg };
              }
            },
          }),
        } : {}),

        // ── Tool: Parse dataset ─────────────────────────────────
        ...(enabledTools.has("parse_dataset") ? {
          parse_dataset: tool({
            description:
              "Profile a cached dataset to see its fields, types, and value ranges. Use after fetching data to understand what's available.",
            inputSchema: z.object({
              cacheKey: z.string().describe("Cache key from a previous search/fetch result"),
            }),
            execute: async ({ cacheKey }) => {
              log("agent.tool_call", { tool: "parse_dataset", cacheKey });
              const cached = await getCachedData(cacheKey);
              if (!cached) return { found: false, error: "Dataset not found in cache" };
              return {
                found: true,
                profile: cached.profile,
                description: cached.description,
                source: cached.source,
              };
            },
          }),
        } : {}),
      },
      stopWhen: stepCountIs(5),
    });

    // Stream SSE response
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const part of result.fullStream) {
            switch (part.type) {
              case "text-delta":
                controller.enqueue(
                  encoder.encode(sseEvent("text-delta", { text: part.text })),
                );
                break;

              case "tool-call":
                controller.enqueue(
                  encoder.encode(
                    sseEvent("tool-call", {
                      toolName: part.toolName,
                      args: part.input,
                    }),
                  ),
                );
                break;

              case "tool-result":
                controller.enqueue(
                  encoder.encode(
                    sseEvent("tool-result", {
                      toolName: part.toolName,
                      result: part.output,
                    }),
                  ),
                );

                // If update_manifest succeeded, send manifest-update event
                if (part.toolName === "update_manifest" && latestManifest) {
                  controller.enqueue(
                    encoder.encode(
                      sseEvent("manifest-update", {
                        manifest: latestManifest,
                        dataUrl: latestDataUrl,
                      }),
                    ),
                  );
                  latestManifest = undefined;
                }
                break;

              case "error":
                controller.enqueue(
                  encoder.encode(
                    sseEvent("error", {
                      message: part.error instanceof Error ? part.error.message : "Stream error",
                    }),
                  ),
                );
                break;
            }
          }

          controller.enqueue(encoder.encode(sseEvent("done", {})));
          log("agent.complete", { latencyMs: Date.now() - t0 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          controller.enqueue(
            encoder.encode(sseEvent("error", { message })),
          );
          reportError(err, { route: "agent-chat" });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("agent.error", { error: message, latencyMs: Date.now() - t0 });
    reportError(err, { route: "agent-chat" });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}
