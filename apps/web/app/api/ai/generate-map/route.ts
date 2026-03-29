import { NextResponse } from "next/server";
import { type ModelMessage } from "ai";
import { MODELS, generateTextWithRetry } from "../../../../lib/ai/ai-client";
import type { MapManifest } from "@atlas/data-models";
import { buildSystemPrompt } from "../../../../lib/ai/system-prompt";
import { classifyGenSkill } from "../../../../lib/ai/skills/router";
import { validateManifest } from "../../../../lib/ai/validators";
import { scoreManifest } from "../../../../lib/ai/quality-scorer";
import type { QualityScore } from "../../../../lib/ai/quality-scorer";
import { profileDataset } from "../../../../lib/ai/profiler";
import { saveCase, findRelevantLessons, formatLessons } from "../../../../lib/ai/case-memory";
import { getSuggestions } from "../../../../lib/ai/refinement-suggestions";
import type { DatasetProfile } from "../../../../lib/ai/types";
import { applyGeometryGuards } from "../../../../lib/ai/geometry-guards";
import { log } from "../../../../lib/logger";
import { reportError } from "../../../../lib/error-reporter";

const QUALITY_THRESHOLD = 60;

/**
 * Validate a URL to prevent SSRF attacks.
 * Blocks private/loopback/link-local IPs, non-http(s) schemes, and AWS metadata.
 */
function validateFetchUrl(raw: string): void {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("Invalid URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs are allowed");
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block loopback
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname === "::1" ||
    hostname.startsWith("127.")
  ) {
    throw new Error("Loopback addresses are not allowed");
  }

  // Block RFC-1918 private ranges, link-local, and AWS metadata
  const ipMatch = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipMatch) {
    const octets = ipMatch.slice(1).map(Number);
    const a = octets[0], b = octets[1];
    if (
      a === 10 ||                              // 10.0.0.0/8
      (a === 172 && b >= 16 && b <= 31) ||     // 172.16.0.0/12
      (a === 192 && b === 168) ||              // 192.168.0.0/16
      (a === 169 && b === 254)                 // 169.254.0.0/16 (link-local + AWS metadata)
    ) {
      throw new Error("Private and link-local addresses are not allowed");
    }
  }

  // Block IPv6 private/link-local (unique local fd00::/8, link-local fe80::/10,
  // and IPv4-mapped ::ffff:x.x.x.x which could embed private IPv4)
  const bareV6 = hostname.replace(/^\[|\]$/g, "");
  if (
    bareV6.startsWith("fd") ||
    bareV6.startsWith("fe80") ||
    bareV6.startsWith("fc") ||
    bareV6.startsWith("::ffff:")
  ) {
    throw new Error("Private and link-local addresses are not allowed");
  }
}

const MAX_TOKENS = 4096;
const MAX_ATTEMPTS = 3;

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

const ALLOWED_REGIONS = new Set([
  "Europe", "Africa", "Asia", "South America", "North America", "Oceania",
]);
const ALLOWED_FILTER_FIELDS = new Set(["continent", "region", "subregion"]);

/**
 * Build the user message, optionally including a dataset profile and source URL.
 */
function buildUserMessage(
  prompt: string,
  profile: DatasetProfile | null,
  sourceUrl?: string,
  scopeHint?: { region: string; filterField: string },
  preferences?: Record<string, string>,
): string {
  const parts: string[] = [];
  if (profile) {
    parts.push(`<dataset-profile>\n${JSON.stringify(profile, null, 2)}\n</dataset-profile>`);
  }
  if (sourceUrl) {
    parts.push(`<source-url>${sourceUrl}</source-url>`);
  }
  if (
    scopeHint &&
    ALLOWED_REGIONS.has(scopeHint.region) &&
    ALLOWED_FILTER_FIELDS.has(scopeHint.filterField)
  ) {
    parts.push(
      `<scope-hint>The data source is global but the user asked about ${scopeHint.region} only. You MUST add a filter to the layer: ["==", ["get", "${scopeHint.filterField}"], "${scopeHint.region}"]. Also set defaultCenter and defaultZoom appropriate for ${scopeHint.region}.</scope-hint>`,
    );
  }
  if (preferences && Object.keys(preferences).length > 0) {
    const entries = Object.entries(preferences)
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n");
    parts.push(`<user-preferences>\n${entries}\n</user-preferences>`);
  }
  parts.push(prompt.trim());
  return parts.join("\n\n");
}

/**
 * Fetch a GeoJSON URL and profile it. Returns null on failure.
 */
async function fetchAndProfile(url: string): Promise<DatasetProfile | null> {
  try {
    validateFetchUrl(url);
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
  const t0 = Date.now();
  let prompt: string | undefined;
  try {
    const body = await request.json();
    prompt = body?.prompt;

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

    // Read optional scope hint (e.g. { region: "Europe", filterField: "continent" })
    const scopeHint: { region: string; filterField: string } | undefined = body.scopeHint;

    // Read optional user preferences from confirmation step
    const preferences: Record<string, string> | undefined = body.preferences;

    // Classify prompt into a generation skill for prompt trimming
    const genSkill = classifyGenSkill(prompt, profile);

    log("generate.start", { promptLength: prompt.length, genSkill });

    // Retrieve lessons from past cases (non-blocking — empty on first run)
    const geoType = profile?.geometryType;
    const lessons = await findRelevantLessons(prompt, geoType).catch(() => []);
    const lessonsBlock = formatLessons(lessons);

    // Self-correction loop: generate → validate → retry on errors
    const messages: ModelMessage[] = [
      { role: "user", content: buildUserMessage(prompt, profile, sourceUrl, scopeHint, preferences) },
    ];

    let manifest: MapManifest | null = null;
    let validation = { valid: false, errors: [] as string[], warnings: [] as string[] };
    let quality: QualityScore | null = null;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let attempts = 0;

    for (attempts = 1; attempts <= MAX_ATTEMPTS; attempts++) {
      const result = await generateTextWithRetry({
        model: MODELS.generation(),
        maxOutputTokens: MAX_TOKENS,
        system: buildSystemPrompt(profile, lessonsBlock, genSkill),
        messages,
      });

      totalInputTokens += result.usage.inputTokens ?? 0;
      totalOutputTokens += result.usage.outputTokens ?? 0;

      const responseText = result.text;
      if (!responseText) {
        return NextResponse.json(
          { error: "No text in AI response" },
          { status: 502 },
        );
      }

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

      // Validation errors → retry with error feedback + available fields
      if (validation.errors.length > 0) {
        if (attempts === MAX_ATTEMPTS) break;
        const fieldList = profile?.attributes.map(a => a.name).join(", ") ?? "unknown";
        messages.push(
          { role: "assistant", content: responseText },
          {
            role: "user",
            content: `Validation errors:\n${validation.errors.map((e) => `- ${e}`).join("\n")}\n\nAvailable fields: ${fieldList}\n\nFix and return corrected JSON.`,
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

    // ── Fallback model: one rescue attempt with Opus if quality is still low ──
    // Opt-in via AI_FALLBACK_ENABLED=true — Opus calls are expensive
    let usedFallback = false;
    if (
      process.env.AI_FALLBACK_ENABLED === "true" &&
      quality &&
      quality.total < QUALITY_THRESHOLD &&
      validation.valid
    ) {
      log("generate.fallback", { primaryScore: quality.total, attempts });
      try {
        const fallbackResult = await generateTextWithRetry({
          model: MODELS.fallback(),
          maxOutputTokens: MAX_TOKENS,
          system: buildSystemPrompt(profile, lessonsBlock, genSkill),
          messages: [
            { role: "user", content: buildUserMessage(prompt, profile, sourceUrl, scopeHint, preferences) },
          ],
        });

        totalInputTokens += fallbackResult.usage.inputTokens ?? 0;
        totalOutputTokens += fallbackResult.usage.outputTokens ?? 0;
        attempts++;

        const fallbackText = fallbackResult.text;
        if (fallbackText) {
          try {
            const fallbackManifest = extractJSON(fallbackText) as MapManifest;
            const fallbackValidation = validateManifest(fallbackManifest, profile);
            if (fallbackValidation.valid) {
              const fallbackQuality = scoreManifest(fallbackManifest, profile ?? undefined);
              if (fallbackQuality.total > quality.total) {
                manifest = fallbackManifest;
                validation = fallbackValidation;
                quality = fallbackQuality;
                usedFallback = true;
                log("generate.fallback.accepted", { fallbackScore: fallbackQuality.total });
              }
            }
          } catch {
            // Fallback JSON parse failed — keep original manifest
          }
        }
      } catch {
        // Fallback model error — keep original manifest
      }
    }

    // ── Geometry guards: auto-correct family↔geometry mismatches ──
    if (profile) {
      const guardWarnings = applyGeometryGuards(manifest, profile);
      validation.warnings.push(...guardWarnings);
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
      usage: { inputTokens: totalInputTokens, outputTokens: totalOutputTokens },
    }).catch(() => {});

    log("generate.complete", {
      attempts,
      qualityScore: quality.total,
      usedFallback,
      latencyMs: Date.now() - t0,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
    });

    return NextResponse.json({
      manifest,
      validation,
      quality,
      caseId,
      suggestions,
      model: usedFallback ? "fallback" : "generation",
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

    log("generate.error", { error: message, attempts: 0, latencyMs: Date.now() - t0 });
    reportError(err, { route: "generate-map", prompt: prompt?.slice(0, 100) });
    return NextResponse.json(
      { error: "Failed to generate map", detail: message },
      { status: 502 },
    );
  }
}
