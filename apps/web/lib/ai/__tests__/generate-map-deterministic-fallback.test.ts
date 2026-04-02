/**
 * Tests for Fas 3: generate-map deterministic path with artifact fallback.
 *
 * Contract under test:
 * - tryGetNormalizedMeta: cache → artifact fallback when artifactId provided
 * - embedClassificationBreaks: cache → durable storage fallback
 * - Artifact fallback only when sourceUrl matches cache-proxy pattern
 * - Private artifact without auth → null (no crash, AI path continues)
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock: Supabase service client ─────────────────────────

const mockFrom = vi.fn();
const mockStorageFrom = vi.fn();
const mockClient = {
  from: mockFrom,
  storage: { from: mockStorageFrom },
};

vi.mock("../../../lib/supabase/service", () => ({
  getServiceClient: vi.fn(() => mockClient),
}));

// ─── Mock: Supabase cookie client (for optional auth) ──────

vi.mock("../../../lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "user-123" } },
        error: null,
      }),
    },
  })),
}));

// ─── Mock: AI and support modules ──────────────────────────

vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ id: "mock" })),
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => ({ id: "mock" })),
}));

vi.mock("@/lib/ai/system-prompt", () => ({
  buildSystemPrompt: vi.fn().mockReturnValue("mock"),
}));

vi.mock("@/lib/ai/quality-scorer", () => ({
  scoreManifest: vi.fn().mockReturnValue({ total: 90, deductions: [] }),
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
  profileDataset: vi.fn().mockReturnValue({
    featureCount: 5,
    geometryType: "Polygon",
    bounds: [[0, 0], [1, 1]],
    crs: null,
    attributes: [
      { name: "_atlas_value", type: "number" },
      { name: "_atlas_code", type: "string" },
    ],
  }),
}));

vi.mock("@/lib/ai/ai-client", async () => {
  const { generateText } = await import("ai");
  return {
    MODELS: {
      generation: vi.fn(() => ({ id: "mock" })),
      fallback: vi.fn(() => ({ id: "mock" })),
      utility: vi.fn(() => ({ id: "mock" })),
    },
    generateTextWithRetry: vi.fn((...args: Parameters<typeof generateText>) =>
      generateText(...args),
    ),
  };
});

// ─── Imports ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — path resolved correctly at runtime via Vitest
import { POST } from "../../../app/api/ai/generate-map/route";

// ─── Helpers ───────────────────────────────────────────────

const ARTIFACT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

const STUB_NORMALIZED_META = {
  sourceMetadata: {
    sourceName: "SCB",
    tableId: "TAB638",
    sourceUrl: "https://api.scb.se/...",
  },
  dimensions: [
    { id: "Region", label: "Region", type: "geo" as const, values: [] },
    { id: "Tid", label: "Year", type: "time" as const, values: [] },
  ],
  candidateMetricFields: ["_atlas_value"],
};

const STUB_PROFILE = {
  featureCount: 5,
  geometryType: "Polygon" as const,
  bounds: [[0, 0], [1, 1]] as [[number, number], [number, number]],
  crs: null,
  attributes: [
    { name: "_atlas_value", type: "number" },
    { name: "_atlas_code", type: "string" },
  ],
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/generate-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Configure mockFrom to route "data_cache" reads to return null (cache miss)
 * and "dataset_artifacts" reads to return the given artifact row.
 */
function mockCacheMissArtifactHit(artifactRow: Record<string, unknown>) {
  mockFrom.mockImplementation((table: string) => {
    if (table === "data_cache") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    }
    if (table === "dataset_artifacts") {
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: artifactRow, error: null }),
      };
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
  });
}

// ─── Tests ─────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deterministic path: cache miss + artifact fallback", () => {
  it("takes deterministic path via artifact normalizedMeta when cache is empty", async () => {
    // Cache empty, artifact has normalized_meta
    mockCacheMissArtifactHit({
      normalized_meta: STUB_NORMALIZED_META,
      is_public: true,
      owner_user_id: null,
      // For embedClassificationBreaks (storage download)
      storage_bucket: "datasets",
      storage_path: "abc.geojson",
    });

    const geojsonBlob = JSON.stringify({
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Polygon", coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, properties: { _atlas_value: 42, _atlas_code: "0180" } },
        { type: "Feature", geometry: { type: "Polygon", coordinates: [[[0,0],[1,0],[1,1],[0,0]]] }, properties: { _atlas_value: 17, _atlas_code: "0114" } },
      ],
    });
    mockStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob([geojsonBlob]),
        error: null,
      }),
    });

    const res = await POST(
      makeRequest({
        prompt: "Befolkning per kommun",
        sourceUrl: "/api/geo/cached/pxweb-se-scb:TAB638:municipality",
        dataProfile: STUB_PROFILE,
        artifactId: ARTIFACT_ID,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // Should use deterministic path, not AI
    expect(body.model).toBe("deterministic");
    expect(body.usage.inputTokens).toBe(0);
    expect(body.manifest).toBeDefined();
  });

  it("embeds classification breaks from artifact when cache is empty", async () => {
    mockCacheMissArtifactHit({
      normalized_meta: STUB_NORMALIZED_META,
      is_public: true,
      owner_user_id: null,
      storage_bucket: "datasets",
      storage_path: "abc.geojson",
    });

    const geojsonBlob = JSON.stringify({
      type: "FeatureCollection",
      features: Array.from({ length: 10 }, (_, i) => ({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: [[[0,0],[1,0],[1,1],[0,0]]] },
        properties: { _atlas_value: (i + 1) * 10, _atlas_code: `0${100 + i}` },
      })),
    });
    mockStorageFrom.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob([geojsonBlob]),
        error: null,
      }),
    });

    const res = await POST(
      makeRequest({
        prompt: "Befolkning per kommun",
        sourceUrl: "/api/geo/cached/pxweb-se-scb:TAB638:municipality",
        dataProfile: {
          ...STUB_PROFILE,
          featureCount: 10,
        },
        artifactId: ARTIFACT_ID,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.model).toBe("deterministic");

    // Check that breaks were embedded (non-empty)
    const choroplethLayer = body.manifest.layers.find(
      (l: { style: { mapFamily: string } }) => l.style.mapFamily === "choropleth",
    );
    expect(choroplethLayer).toBeDefined();
    expect(choroplethLayer.style.classification.breaks).toBeDefined();
    expect(choroplethLayer.style.classification.breaks.length).toBeGreaterThan(0);
  });
});

describe("security: private artifact access", () => {
  it("returns null for private artifact without matching userId (AI path continues)", async () => {
    // Private artifact owned by someone else
    mockCacheMissArtifactHit({
      normalized_meta: STUB_NORMALIZED_META,
      is_public: false,
      owner_user_id: "other-user-999",
    });

    // Mock auth to return user-123 (not the owner)
    const { generateText } = await import("ai");
    const mockGenerateText = vi.mocked(generateText);
    const manifest = {
      id: "fallback",
      title: "Fallback Map",
      description: "AI-generated",
      theme: "explore",
      layers: [{
        id: "l1",
        kind: "metric",
        label: "Layer",
        sourceType: "geojson-url",
        sourceUrl: "/api/geo/cached/test",
        style: { mapFamily: "choropleth", colorField: "_atlas_value", color: { scheme: "blues" }, classification: { method: "quantile", classes: 5 } },
      }],
      defaultCenter: [18, 59],
      defaultZoom: 5,
    };
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify(manifest),
      steps: [],
      content: [],
      reasoning: undefined,
      reasoningText: undefined,
      files: [],
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, inputTokenDetails: {}, outputTokenDetails: {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    const res = await POST(
      makeRequest({
        prompt: "Befolkning per kommun",
        sourceUrl: "/api/geo/cached/pxweb-se-scb:TAB638:municipality",
        dataProfile: STUB_PROFILE,
        artifactId: ARTIFACT_ID,
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    // Should NOT take deterministic path — artifact access denied,
    // falls through to AI generation
    expect(body.model).not.toBe("deterministic");
    // Should not crash
    expect(body.manifest).toBeDefined();
  });
});

describe("coupling: sourceUrl must match cache-proxy pattern", () => {
  it("does not attempt artifact fallback for non-cache URLs", async () => {
    // Even with artifactId, if sourceUrl is not /api/geo/cached/...,
    // artifact fallback should not be attempted.
    const queriedTables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      queriedTables.push(table);
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });

    const { generateText } = await import("ai");
    const mockGenerateText = vi.mocked(generateText);
    const manifest = {
      id: "ext",
      title: "External",
      description: "test",
      theme: "explore",
      layers: [{
        id: "l1",
        kind: "event",
        label: "Layer",
        sourceType: "geojson-url",
        sourceUrl: "https://example.com/data.geojson",
        style: { mapFamily: "point", markerShape: "circle", color: { fixed: "#ff0000" } },
      }],
      defaultCenter: [0, 0],
      defaultZoom: 2,
    };
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify(manifest),
      steps: [],
      content: [],
      reasoning: undefined,
      reasoningText: undefined,
      files: [],
      usage: { inputTokens: 100, outputTokens: 200, totalTokens: 300, inputTokenDetails: {}, outputTokenDetails: {} },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

    await POST(
      makeRequest({
        prompt: "Show earthquakes",
        sourceUrl: "https://example.com/data.geojson",
        artifactId: ARTIFACT_ID,
      }),
    );

    // dataset_artifacts should NOT have been queried —
    // artifact fallback is skipped for non-cache URLs
    expect(queriedTables).not.toContain("dataset_artifacts");
  });
});
