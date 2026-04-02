/**
 * Fas 3 determinism tests — cold-start artifact fallback.
 *
 * These tests verify that the generate-map pipeline behaves correctly
 * when the L1/L2 cache is cold (getCachedData returns null) but a
 * durable artifact exists. Each test proves ONE invariant.
 *
 * ──────────────────────────────────────────────────────────────────
 * HOW TO MANUALLY VERIFY COLD-START DETERMINISM IN DEV
 * ──────────────────────────────────────────────────────────────────
 * 1. Clear the L1/L2 cache:
 *    - L1 (in-memory) clears on serverless cold start or process restart.
 *    - L2: DELETE FROM data_cache WHERE cache_key = '<your-key>';
 *
 * 2. Identify a map with a known artifact_id in the `maps` table.
 *    The artifact must have normalized_meta set (non-null).
 *
 * 3. Hit generate-map with a cache-proxy sourceUrl and the artifact ID:
 *    POST /api/ai/generate-map
 *    {
 *      "prompt": "show population by municipality",
 *      "sourceUrl": "/api/geo/cached/pxweb-se-scb:BE0101N1:municipality",
 *      "artifactId": "<uuid from dataset_artifacts>"
 *    }
 *
 * 4. Verify the deterministic path was taken:
 *    - Response body: { model: "deterministic", usage: { inputTokens: 0, outputTokens: 0 } }
 *    - No Anthropic API call in server logs ("generate.deterministic" log, not "generate.start")
 * ──────────────────────────────────────────────────────────────────
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MapManifest } from "@atlas/data-models";
import type { NormalizedMeta } from "@/lib/ai/tools/data-search";

// ─── Mocks — must be hoisted before any imports of the route ────

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ id: "mock-anthropic-model" })),
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => ({ id: "mock-google-model" })),
}));

vi.mock("@/lib/ai/system-prompt", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("mock system prompt"),
}));

vi.mock("@/lib/ai/quality-scorer", () => ({
  scoreManifest: vi.fn().mockReturnValue({ total: 80, deductions: [] }),
}));

vi.mock("@/lib/ai/case-memory", () => ({
  saveCase: vi.fn().mockResolvedValue(undefined),
  findRelevantLessons: vi.fn().mockResolvedValue([]),
  formatLessons: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/ai/refinement-suggestions", () => ({
  getSuggestions: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/ai/profiler", () => ({
  profileDataset: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/ai/skills/router", () => ({
  classifyGenSkill: vi.fn().mockReturnValue("choropleth"),
}));

vi.mock("@/lib/ai/geometry-guards", () => ({
  applyGeometryGuards: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

vi.mock("@/lib/error-reporter", () => ({
  reportError: vi.fn(),
}));

vi.mock("@/lib/ai/ai-client", async () => {
  const { generateText } = await import("ai");
  return {
    MODELS: {
      generation: vi.fn(() => ({ id: "mock-model" })),
      fallback: vi.fn(() => ({ id: "mock-fallback-model" })),
      utility: vi.fn(() => ({ id: "mock-utility-model" })),
    },
    generateTextWithRetry: vi.fn((...args: Parameters<typeof generateText>) =>
      generateText(...args),
    ),
  };
});

// Cache and artifact storage — controlled per-test via module-level vars
vi.mock("@/lib/ai/tools/data-search", () => ({
  getCachedData: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ai/tools/dataset-storage", () => ({
  readArtifactMeta: vi.fn().mockResolvedValue(null),
  readDurableDataset: vi.fn().mockResolvedValue(null),
  ensureDurableDataset: vi.fn().mockResolvedValue(null),
}));

// Supabase server client — only needed for userId resolution
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-abc" } },
          error: null,
        }),
      },
    }),
  ),
}));

// ─── Route import (after all mocks) ─────────────────────────────

// @ts-ignore — path resolved at runtime via Vitest moduleResolution
import { POST } from "../../../app/api/ai/generate-map/route";
import { generateText } from "ai";
import { getCachedData } from "@/lib/ai/tools/data-search";
import { readArtifactMeta, readDurableDataset } from "@/lib/ai/tools/dataset-storage";

const mockGenerateText = vi.mocked(generateText);
const mockGetCachedData = vi.mocked(getCachedData);
const mockReadArtifactMeta = vi.mocked(readArtifactMeta);
const mockReadDurableDataset = vi.mocked(readDurableDataset);

// ─── Fixtures ────────────────────────────────────────────────────

/** Valid NormalizedMeta returned from an artifact row. */
function makeNormalizedMeta(): NormalizedMeta {
  return {
    sourceMetadata: {
      sourceId: "pxweb-se-scb",
      sourceName: "SCB",
      tableId: "BE0101N1",
      tableLabel: "Folkmängd efter region",
      fetchedAt: Date.now(),
      language: "sv",
    },
    dimensions: [
      {
        id: "Region",
        label: "region",
        role: "geo",
        values: [{ code: "0114", label: "Upplands Väsby" }],
      },
      {
        id: "ContentsCode",
        label: "Folkmängd",
        role: "metric",
        values: [{ code: "BE0101N1", label: "Folkmängd" }],
      },
    ],
    candidateMetricFields: ["Folkmängd"],
  };
}

/**
 * DatasetProfile with polygon geometry and _atlas_value.
 * These are the two conditions canGenerateDeterministic() checks.
 */
function makePolygonProfile() {
  return {
    featureCount: 290,
    geometryType: "Polygon" as const,
    bounds: [[55.3, 11.1], [69.1, 24.2]] as [[number, number], [number, number]],
    crs: null,
    attributes: [
      { name: "name", type: "string" as const, uniqueValues: 290, nullCount: 0 },
      {
        name: "_atlas_value",
        type: "number" as const,
        uniqueValues: 290,
        nullCount: 0,
        min: 2500,
        max: 984748,
        mean: 36000,
        median: 16000,
        distribution: "skewed-right" as const,
      },
    ],
  };
}

/**
 * Minimal FeatureCollection with polygon features that have _atlas_value.
 * Used to test that classification breaks are computed from artifact data.
 */
function makeFeatureCollection(): GeoJSON.FeatureCollection {
  const makeFeature = (value: number): GeoJSON.Feature => ({
    type: "Feature",
    geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] },
    properties: { name: `Region ${value}`, _atlas_value: value },
  });

  return {
    type: "FeatureCollection",
    features: [
      makeFeature(10000),
      makeFeature(50000),
      makeFeature(100000),
      makeFeature(200000),
      makeFeature(500000),
      makeFeature(900000),
    ],
  };
}

/** Minimal valid AI-generated manifest (used when AI path is exercised). */
function makeAiManifest(): MapManifest {
  return {
    id: "ai-generated-map",
    title: "AI Map",
    description: "Generated by AI",
    theme: "explore",
    layers: [
      {
        id: "layer-1",
        kind: "event",
        label: "Layer 1",
        sourceType: "geojson-url",
        sourceUrl: "https://example.com/data.geojson",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          colorField: "_atlas_value",
          color: { scheme: "blues" },
          classification: { method: "quantile", classes: 5 },
        },
      },
    ],
    defaultCenter: [15, 62],
    defaultZoom: 5,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeGenerateTextResult(manifest: MapManifest): any {
  return {
    text: JSON.stringify(manifest),
    steps: [],
    content: [],
    reasoning: undefined,
    reasoningText: undefined,
    files: [],
    usage: {
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      inputTokenDetails: {},
      outputTokenDetails: {},
    },
  };
}

/**
 * Build a POST request to /api/ai/generate-map.
 * sourceUrl must be a cache-proxy URL (/api/geo/cached/...) for the
 * artifact fallback to activate (see CACHE_URL_RE in route.ts).
 */
function makeRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost/api/ai/generate-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const CACHE_PROXY_URL = "/api/geo/cached/pxweb-se-scb%3ABE0101N1%3Amunicipality";
const ARTIFACT_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";

// ─── Tests ───────────────────────────────────────────────────────

describe("Fas 3 — cold-start determinism via artifact fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: cache is cold, artifact is missing (overridden per-test)
    mockGetCachedData.mockResolvedValue(null);
    mockReadArtifactMeta.mockResolvedValue(null);
    mockReadDurableDataset.mockResolvedValue(null);
  });

  // ── Scenario 1 ───────────────────────────────────────────────
  it("uses deterministic path when cache is cold but artifact has normalized_meta", async () => {
    // Cache miss (L1 + L2 cold)
    mockGetCachedData.mockResolvedValue(null);
    // Artifact has normalized_meta → tryGetNormalizedMeta returns it
    mockReadArtifactMeta.mockResolvedValue(makeNormalizedMeta());

    const req = makeRequest({
      prompt: "show population by municipality",
      sourceUrl: CACHE_PROXY_URL,
      artifactId: ARTIFACT_ID,
      // Supply dataProfile directly so the route doesn't attempt to fetch the URL
      dataProfile: makePolygonProfile(),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();

    // Deterministic path marker — zero tokens, model="deterministic"
    expect(body.model).toBe("deterministic");
    expect(body.usage.inputTokens).toBe(0);
    expect(body.usage.outputTokens).toBe(0);
    expect(body.manifest).toBeDefined();
    expect(body.manifest.layers[0].style.mapFamily).toBe("choropleth");
    expect(body.manifest.layers[0].style.colorField).toBe("_atlas_value");

    // AI must NOT have been called
    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  // ── Scenario 2 ───────────────────────────────────────────────
  it("computes classification breaks from artifact features when cache is cold", async () => {
    // Cache miss — neither normalizedMeta nor features from cache
    mockGetCachedData.mockResolvedValue(null);
    // Artifact meta present → deterministic path taken
    mockReadArtifactMeta.mockResolvedValue(makeNormalizedMeta());
    // Artifact features present → embedClassificationBreaks should use them
    mockReadDurableDataset.mockResolvedValue(makeFeatureCollection());

    const req = makeRequest({
      prompt: "show population by municipality",
      sourceUrl: CACHE_PROXY_URL,
      artifactId: ARTIFACT_ID,
      dataProfile: makePolygonProfile(),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.model).toBe("deterministic");

    // The classification layer must have breaks computed from the feature values
    const layer = body.manifest.layers[0];
    expect(layer.style.classification).toBeDefined();
    expect(Array.isArray(layer.style.classification.breaks)).toBe(true);
    expect(layer.style.classification.breaks.length).toBeGreaterThan(0);
    expect(typeof layer.style.classification.min).toBe("number");
    expect(typeof layer.style.classification.max).toBe("number");
    // max should reflect the highest _atlas_value in the fixture (900000)
    expect(layer.style.classification.max).toBe(900000);
  });

  // ── Scenario 3 ───────────────────────────────────────────────
  it("falls back to AI path when artifact access is denied for private artifact", async () => {
    // Cache miss
    mockGetCachedData.mockResolvedValue(null);
    // readArtifactMeta returns null — simulates private artifact, wrong user
    mockReadArtifactMeta.mockResolvedValue(null);
    // readDurableDataset also returns null for same reason
    mockReadDurableDataset.mockResolvedValue(null);

    // AI must succeed so the route can return 200
    mockGenerateText.mockResolvedValue(makeGenerateTextResult(makeAiManifest()));

    const req = makeRequest({
      prompt: "show population by municipality",
      sourceUrl: CACHE_PROXY_URL,
      artifactId: ARTIFACT_ID,
      dataProfile: makePolygonProfile(),
    });

    const res = await POST(req);
    // Must not crash — must return a usable response
    expect(res.status).toBe(200);

    const body = await res.json();
    // AI path was used, not deterministic
    expect(body.model).toBe("generation");
    expect(body.usage.inputTokens).toBeGreaterThan(0);

    // AI was called exactly once (one successful attempt)
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  // ── Scenario 4 ───────────────────────────────────────────────
  it("leaves existing AI behavior unchanged when no artifactId is provided", async () => {
    // No cache entry
    mockGetCachedData.mockResolvedValue(null);
    // AI succeeds
    mockGenerateText.mockResolvedValue(makeGenerateTextResult(makeAiManifest()));

    const req = makeRequest({
      prompt: "show population by municipality",
      // No sourceUrl, no artifactId — plain prompt, no data context
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    // Standard AI path
    expect(body.model).toBe("generation");
    expect(body.manifest).toBeDefined();

    // No artifact read was attempted
    expect(mockReadArtifactMeta).not.toHaveBeenCalled();
    expect(mockReadDurableDataset).not.toHaveBeenCalled();
  });
});
