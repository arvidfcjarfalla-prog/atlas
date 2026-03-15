import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MapManifest } from "@atlas/data-models";
import { buildSystemPrompt } from "../../../../lib/ai/system-prompt";
import { validateManifest } from "../../../../lib/ai/validators";
import { scoreManifest } from "../../../../lib/ai/quality-scorer";
import type { QualityScore } from "../../../../lib/ai/quality-scorer";
import { profileDataset } from "../../../../lib/ai/profiler";
import { saveCase, findRelevantLessons, formatLessons } from "../../../../lib/ai/case-memory";
import { getSuggestions } from "../../../../lib/ai/refinement-suggestions";
import type { DatasetProfile } from "../../../../lib/ai/types";

const QUALITY_THRESHOLD = 60;

const MODEL = "claude-sonnet-4-5-20250929";
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
 * Build the user message, optionally including a dataset profile and source URL.
 */
function buildUserMessage(prompt: string, profile: DatasetProfile | null, sourceUrl?: string): string {
  const parts: string[] = [];
  if (profile) {
    parts.push(`<dataset-profile>\n${JSON.stringify(profile, null, 2)}\n</dataset-profile>`);
  }
  if (sourceUrl) {
    parts.push(`<source-url>${sourceUrl}</source-url>`);
  }
  parts.push(prompt.trim());
  return parts.join("\n\n");
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
    const sourceUrl: string | undefined = body.sourceUrl ?? body.dataUrl;
    let profile: DatasetProfile | null = body.dataProfile ?? null;
    if (!profile && sourceUrl && typeof sourceUrl === "string") {
      profile = await fetchAndProfile(sourceUrl);
    }

    const client = getClient();

    // Retrieve lessons from past cases (non-blocking — empty on first run)
    const geoType = profile?.geometryType;
    const lessons = await findRelevantLessons(prompt, geoType).catch(() => []);
    const lessonsBlock = formatLessons(lessons);

    // Self-correction loop: generate → validate → retry on errors
    const messages: Anthropic.Messages.MessageParam[] = [
      { role: "user", content: buildUserMessage(prompt, profile, sourceUrl) },
    ];

    let manifest: MapManifest | null = null;
    let validation = { valid: false, errors: [] as string[], warnings: [] as string[] };
    let quality: QualityScore | null = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let attempts = 0;

    for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: buildSystemPrompt(profile, lessonsBlock),
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

      validation = validateManifest(manifest, profile);

      // Validation errors → retry with error feedback
      if (validation.errors.length > 0) {
        if (attempts === MAX_ATTEMPTS) break;
        messages.push(
          { role: "assistant", content: responseText },
          {
            role: "user",
            content: `The manifest has validation errors:\n${validation.errors.map((e) => `- ${e}`).join("\n")}\n\nFix these errors and return a corrected JSON manifest.`,
          },
        );
        continue;
      }

      // Validation passed — run quality scorer as critic
      quality = scoreManifest(manifest, profile ?? undefined);

      // Good enough or out of attempts → accept
      if (quality.total >= QUALITY_THRESHOLD || attempts === MAX_ATTEMPTS) break;

      // Quality too low — feed deductions back for improvement
      messages.push(
        { role: "assistant", content: responseText },
        {
          role: "user",
          content: `The manifest is valid but has quality issues (score: ${quality.total}/100):\n${quality.deductions.map((d) => `- ${d}`).join("\n")}\n\nImprove the manifest to address these issues and return a corrected JSON.`,
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

    // Score the final manifest if not already scored (e.g. validation errors on last attempt)
    if (!quality) {
      quality = scoreManifest(manifest, profile ?? undefined);
    }

    // Derive refinement suggestions from quality deductions + manifest gaps
    const suggestions = getSuggestions(quality, manifest);

    // Save case record (fire-and-forget — never delays response)
    const caseId = crypto.randomUUID();
    const parentCaseId: string | undefined = body.parentCaseId;
    saveCase({
      id: caseId,
      ...(parentCaseId ? { parentCaseId } : {}),
      timestamp: new Date().toISOString(),
      prompt,
      ...(sourceUrl ? { resolvedSource: { url: sourceUrl, source: body.dataSource ?? "unknown" } } : {}),
      manifest,
      quality,
      attempts,
      outcome: "accepted",
      refinements: [],
    }).catch(() => {});

    return NextResponse.json({
      manifest,
      validation,
      quality,
      caseId,
      suggestions,
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
