import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MapManifest } from "@atlas/data-models";
import { MAP_AI_SYSTEM_PROMPT } from "../../../../lib/ai/system-prompt";
import { validateManifest } from "../../../../lib/ai/validators";
import { profileDataset } from "../../../../lib/ai/profiler";
import type { DatasetProfile } from "../../../../lib/ai/types";

const MODEL = "claude-sonnet-4-20250514";
const MAX_TOKENS = 4096;
const MAX_ATTEMPTS = 3;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

/**
 * Extract JSON from a string that may contain markdown fences or preamble.
 * Finds the first `{` and last `}` and parses between them.
 */
function extractJSON(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("No JSON object found in response");
  }
  return JSON.parse(text.slice(start, end + 1));
}

/**
 * Build the user message, optionally including a dataset profile block.
 */
function buildUserMessage(prompt: string, profile: DatasetProfile | null): string {
  if (!profile) return prompt.trim();
  return `<dataset-profile>\n${JSON.stringify(profile, null, 2)}\n</dataset-profile>\n\n${prompt.trim()}`;
}

/**
 * Fetch a GeoJSON URL and profile it. Returns null on failure.
 */
async function fetchAndProfile(url: string): Promise<DatasetProfile | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const geojson = await res.json();
    if (geojson?.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
      return null;
    }
    return profileDataset(geojson);
  } catch {
    return null;
  }
}

/**
 * POST /api/ai/generate-map
 *
 * Accepts a user prompt, sends it to Claude with the map AI system prompt,
 * validates the generated MapManifest, and returns the result.
 *
 * Request body:
 *   - prompt: string (required)
 *   - dataUrl?: string — URL to a GeoJSON FeatureCollection (will be profiled)
 *   - dataProfile?: DatasetProfile — pre-computed dataset profile
 *
 * Response: { manifest, validation, model, usage, profile? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const prompt = body?.prompt;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      return NextResponse.json(
        { error: "Missing or empty 'prompt' field" },
        { status: 400 },
      );
    }

    if (prompt.length > 2000) {
      return NextResponse.json(
        { error: "Prompt exceeds 2000 character limit" },
        { status: 400 },
      );
    }

    // Resolve dataset profile: explicit > fetched > none
    let profile: DatasetProfile | null = body.dataProfile ?? null;
    if (!profile && body.dataUrl && typeof body.dataUrl === "string") {
      profile = await fetchAndProfile(body.dataUrl);
    }

    const client = getClient();

    // Self-correction loop: generate → validate → retry on errors
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: buildUserMessage(prompt, profile) },
    ];

    let manifest: MapManifest | null = null;
    let validation = { valid: false, errors: [] as string[], warnings: [] as string[] };
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let attempts = 0;

    for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: MAP_AI_SYSTEM_PROMPT,
        messages,
      });

      totalInputTokens += response.usage.input_tokens;
      totalOutputTokens += response.usage.output_tokens;

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        return NextResponse.json(
          { error: "No text in AI response" },
          { status: 502 },
        );
      }

      const responseText = textBlock.text;

      try {
        manifest = extractJSON(responseText) as MapManifest;
      } catch {
        // JSON parse failure on last attempt → return error
        if (attempts === MAX_ATTEMPTS) {
          return NextResponse.json(
            {
              error: "Failed to parse AI response as JSON",
              raw: responseText.slice(0, 500),
              attempts,
            },
            { status: 502 },
          );
        }
        // Otherwise retry: ask Claude to fix the JSON
        messages.push(
          { role: "assistant", content: responseText },
          {
            role: "user",
            content: "Your response was not valid JSON. Please return ONLY a valid JSON object matching the MapManifest schema.",
          },
        );
        continue;
      }

      validation = validateManifest(manifest);

      // No errors → done (warnings are OK)
      if (validation.errors.length === 0) break;

      // Errors on last attempt → return with errors attached
      if (attempts === MAX_ATTEMPTS) break;

      // Feed errors back for self-correction
      messages.push(
        { role: "assistant", content: responseText },
        {
          role: "user",
          content: `The manifest has validation errors:\n${validation.errors.map((e) => `- ${e}`).join("\n")}\n\nFix these errors and return a corrected JSON manifest.`,
        },
      );
    }

    if (!manifest) {
      return NextResponse.json(
        { error: "Failed to generate valid manifest", attempts },
        { status: 502 },
      );
    }

    manifest.validation = validation;

    return NextResponse.json({
      manifest,
      validation,
      model: MODEL,
      attempts,
      usage: {
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
      },
      ...(profile ? { profile } : {}),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown error";

    // API key missing
    if (message.includes("ANTHROPIC_API_KEY")) {
      return NextResponse.json(
        { error: "Server configuration error: API key not set" },
        { status: 500 },
      );
    }

    // Anthropic API errors
    if (message.includes("401") || message.includes("authentication")) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 },
      );
    }

    if (message.includes("429") || message.includes("rate")) {
      return NextResponse.json(
        { error: "Rate limited — try again shortly" },
        { status: 429 },
      );
    }

    return NextResponse.json(
      { error: "Failed to generate map", detail: message },
      { status: 502 },
    );
  }
}
