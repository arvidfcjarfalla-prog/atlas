import { NextResponse } from "next/server";
import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { MODELS } from "../../../../lib/ai/ai-client";
import { buildEditMapPrompt } from "../../../../lib/ai/edit-map-prompt";
import { validateManifest } from "../../../../lib/ai/validators";
import { profileDataset } from "../../../../lib/ai/profiler";
import { searchPublicData, setCache } from "../../../../lib/ai/tools/data-search";
import { searchEurostat } from "../../../../lib/ai/tools/eurostat";
import { searchDataCommons } from "../../../../lib/ai/tools/data-commons";
import { resolveAmenityQuery, queryOverpass } from "../../../../lib/ai/tools/overpass";
import type { MapManifest } from "@atlas/data-models";
import { log } from "../../../../lib/logger";
import { reportError } from "../../../../lib/error-reporter";

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
    // Build bbox: ~5km radius approximation
    const d = 0.05;
    return { lat, lng, bbox: [lat - d, lng - d, lat + d, lng + d] };
  } catch {
    return null;
  }
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

    if (!manifest || !message) {
      return NextResponse.json(
        { error: "Missing manifest or message" },
        { status: 400 },
      );
    }

    log("edit.start", { messageLength: message.length });

    const recentHistory = chatHistory.slice(-10);

    // Build message array with conversation context
    const messages: Array<{ role: "user" | "assistant"; content: string }> = [
      ...recentHistory,
      { role: "user" as const, content: message },
    ];

    const result = await generateText({
      model: MODELS.generation(),
      maxOutputTokens: 4096,
      system: buildEditMapPrompt(manifest),
      messages,
      tools: {
        // ── Tool: Search for statistical datasets ──────────────
        search_data: tool({
          description:
            "Search for statistical datasets (GDP, population, unemployment, emissions, etc.) to add as a new layer or replace the current data. Returns a data profile with available fields.",
          inputSchema: z.object({
            query: z.string().describe("Description of the data needed, e.g. 'unemployment rate by country in Europe'"),
          }),
          execute: async ({ query }) => {
            log("edit.tool_call", { tool: "search_data", query });
            // Try sources in priority order
            const eurostat = await searchEurostat(query).catch(() => ({ found: false as const }));
            if (eurostat.found && eurostat.cacheKey) {
              return {
                found: true,
                source: "Eurostat",
                cacheKey: eurostat.cacheKey,
                dataUrl: `/api/geo/cached/${encodeURIComponent(eurostat.cacheKey)}`,
                profile: eurostat.profile,
              };
            }
            const wb = await searchPublicData(query).catch(() => ({ found: false as const }));
            if (wb.found && wb.cacheKey) {
              return {
                found: true,
                source: "World Bank",
                cacheKey: wb.cacheKey,
                dataUrl: `/api/geo/cached/${encodeURIComponent(wb.cacheKey)}`,
                profile: wb.profile,
              };
            }
            const dc = await searchDataCommons(query).catch(() => ({ found: false as const }));
            if (dc.found && dc.cacheKey) {
              return {
                found: true,
                source: "Data Commons",
                cacheKey: dc.cacheKey,
                dataUrl: `/api/geo/cached/${encodeURIComponent(dc.cacheKey)}`,
                profile: dc.profile,
              };
            }
            return { found: false, error: "No matching dataset found" };
          },
        }),

        // ── Tool: Search for POI (restaurants, parks, etc.) ────
        search_poi: tool({
          description:
            "Search for points of interest (restaurants, cafes, parks, hospitals, schools, etc.) in a specific city using OpenStreetMap data.",
          inputSchema: z.object({
            amenity: z.string().describe("Type of place, e.g. 'restaurant', 'cafe', 'park', 'hospital'"),
            city: z.string().describe("City name, e.g. 'Stockholm', 'Paris', 'New York'"),
          }),
          execute: async ({ amenity, city }) => {
            log("edit.tool_call", { tool: "search_poi", amenity, city });
            // Geocode city to get bounding box
            const geo = await geocodeCity(city);
            if (!geo) return { found: false, error: `Could not find city: ${city}` };

            // Resolve amenity to Overpass query
            const query = resolveAmenityQuery(amenity, geo.bbox);
            if (!query) return { found: false, error: `Unknown amenity type: ${amenity}` };

            // Execute Overpass query
            const fc = await queryOverpass(query);
            if (!fc || fc.features.length === 0) {
              return { found: false, error: `No ${amenity} found in ${city}` };
            }

            // Cache the result
            const profile = profileDataset(fc);
            const cacheKey = `poi-${amenity}-${city.toLowerCase().replace(/\s+/g, "-")}`;
            await setCache(cacheKey, {
              data: fc,
              profile,
              source: "OpenStreetMap",
              description: `${amenity} in ${city}`,
              timestamp: Date.now(),
            });

            return {
              found: true,
              source: "OpenStreetMap",
              cacheKey,
              dataUrl: `/api/geo/cached/${encodeURIComponent(cacheKey)}`,
              featureCount: fc.features.length,
              profile,
              center: { lat: geo.lat, lng: geo.lng },
            };
          },
        }),
      },
      stopWhen: stepCountIs(5),
    });

    // ── Extract the final response from tool results or text ──
    // The AI should produce a text response at the end with the manifest update.
    // With tool use, the final text contains the reply + manifest.

    // Collect tool results for context
    let dataUrl: string | undefined;
    for (const step of result.steps) {
      for (const tc of step.toolResults ?? []) {
        const r = tc as unknown as { result?: { found?: boolean; dataUrl?: string } };
        if (r?.result?.found && r?.result?.dataUrl) {
          dataUrl = r.result.dataUrl;
        }
      }
    }

    // Parse the final response.
    // The AI may return JSON text (manifest update) OR plain text (explanation).
    // With tool calling, it sometimes returns text without JSON wrapper.
    const rawText = result.text;
    let editResponse: { manifest: MapManifest | null; reply: string; changes: string[] };

    try {
      const start = rawText.indexOf("{");
      const end = rawText.lastIndexOf("}");
      if (start === -1 || end === -1 || end <= start) {
        throw new Error("No JSON found");
      }
      editResponse = JSON.parse(rawText.slice(start, end + 1));
    } catch {
      // No JSON in response — the AI replied with plain text.
      // This happens for conversational messages ("hej", questions, explanations).
      // Return the original manifest unchanged with the AI's text as the reply.
      const reply = rawText.trim() || "Jag förstod inte. Beskriv en specifik ändring — t.ex. 'byt till röda färger' eller 'zooma in på Sverige'.";
      return NextResponse.json({
        manifest,
        reply,
        changes: [],
      });
    }

    // Handle undo
    if (editResponse.manifest === null) {
      return NextResponse.json({
        manifest,
        reply: editResponse.reply || "Ångrade senaste ändringen.",
        changes: [],
        undo: true,
      });
    }

    const updated = editResponse.manifest ?? manifest;

    // Validate
    const validation = validateManifest(updated);
    if (!validation.valid) {
      return NextResponse.json({
        manifest,
        reply: `Ändringen kunde inte göras: ${validation.errors[0]}`,
        changes: [],
      });
    }

    const toolsCalled = result.steps.reduce((n, s) => n + (s.toolResults?.length ?? 0), 0);
    log("edit.complete", { toolsCalled, latencyMs: Date.now() - t0 });

    return NextResponse.json({
      manifest: updated,
      reply: editResponse.reply,
      changes: editResponse.changes ?? [],
      dataUrl, // New data URL if tools fetched data
      warnings: validation.warnings,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    log("edit.error", { error: message, latencyMs: Date.now() - t0 });
    reportError(err, { route: "edit-map" });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
