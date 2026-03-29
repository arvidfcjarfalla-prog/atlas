/**
 * Tests for the generate-map API route handler.
 *
 * Strategy:
 * - Drive POST() directly with a constructed Request object.
 * - Mock "ai" (generateText) to control AI responses without network.
 * - Test input validation and pure helpers (validateFetchUrl, buildUserMessage)
 *   by observing route behaviour — both functions are module-internal.
 *
 * vi.mock() calls are hoisted to the top of the module by Vitest, so static
 * imports of the route and mocked modules see the mocks in place.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MapManifest } from "@atlas/data-models";

// ─── Mocks ───────────────────────────────────────────────────

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
  scoreManifest: vi.fn().mockReturnValue({
    total: 80,
    deductions: [],
  }),
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
    attributes: [{ name: "value", type: "number" }],
  }),
}));

vi.mock("@/lib/ai/ai-client", async () => {
  const { generateText } = await import("ai");
  return {
    MODELS: {
      generation: vi.fn(() => ({ id: "mock-model" })),
      fallback: vi.fn(() => ({ id: "mock-fallback-model" })),
      utility: vi.fn(() => ({ id: "mock-utility-model" })),
    },
    // Delegate to the mocked `generateText` so existing mocks work
    generateTextWithRetry: vi.fn((...args: Parameters<typeof generateText>) =>
      generateText(...args),
    ),
  };
});

// ─── Imports ─────────────────────────────────────────────────

import { generateText } from "ai";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — path resolved correctly at runtime via Vitest moduleResolution
import { POST } from "../../../app/api/ai/generate-map/route";

const mockGenerateText = vi.mocked(generateText);

// ─── Helpers ──────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/generate-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Minimal valid MapManifest that passes schema + cartographic validation. */
function makeValidManifest(overrides: Partial<MapManifest> = {}): MapManifest {
  return {
    id: "generated-map",
    title: "Generated Map",
    description: "A generated test map",
    theme: "explore",
    layers: [
      {
        id: "layer-1",
        kind: "event", // valid EntityKind
        label: "Layer 1",
        sourceType: "geojson-url",
        sourceUrl: "https://example.com/data.geojson",
        style: {
          markerShape: "circle",
          mapFamily: "choropleth",
          colorField: "rate",
          color: { scheme: "blues" },
          classification: { method: "quantile", classes: 5 },
        },
      },
    ],
    defaultCenter: [10, 50],
    defaultZoom: 4,
    ...overrides,
  };
}

/** Build a generateText mock result with the required shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeGenerateResult(manifest: MapManifest): any {
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

/** Build a generateText result with arbitrary text (no JSON manifest). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeTextResult(text: string): any {
  return {
    text,
    steps: [],
    content: [],
    reasoning: undefined,
    reasoningText: undefined,
    files: [],
    usage: {
      inputTokens: 5,
      outputTokens: 5,
      totalTokens: 10,
      inputTokenDetails: {},
      outputTokenDetails: {},
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe("POST /api/ai/generate-map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Input validation ──────────────────────────────────────

  it("returns 400 when prompt is missing", async () => {
    const req = makeRequest({});
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing or empty/i);
  });

  it("returns 400 when prompt is an empty string", async () => {
    const req = makeRequest({ prompt: "   " });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing or empty/i);
  });

  it("returns 400 when prompt exceeds 2000 characters", async () => {
    const req = makeRequest({ prompt: "x".repeat(2001) });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/2000 character/i);
  });

  it("accepts prompt of exactly 2000 characters", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const req = makeRequest({ prompt: "x".repeat(2000) });
    const res = await POST(req);

    // Should not be rejected as too long
    expect(res.status).not.toBe(400);
  });

  // ── Successful generation ─────────────────────────────────

  it("returns manifest and metadata on success", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const req = makeRequest({ prompt: "show population by country" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.manifest).toBeDefined();
    expect(body.manifest.id).toBe("generated-map");
    expect(body.validation).toBeDefined();
    expect(body.quality).toBeDefined();
    expect(body.caseId).toBeDefined();
    expect(body.model).toBe("generation");
    expect(body.attempts).toBeGreaterThanOrEqual(1);
  });

  // ── SSRF protection via fetchAndProfile ───────────────────
  // validateFetchUrl is module-internal; we test it indirectly by providing
  // a private/loopback URL as sourceUrl and observing that no profile is
  // attached to the response — SSRF errors are caught inside fetchAndProfile
  // and return null, so the route continues without crashing.

  it("SSRF: loopback URL in sourceUrl is silently rejected (no crash, no profile)", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const req = makeRequest({
      prompt: "show data",
      sourceUrl: "http://127.0.0.1/secret",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeUndefined();
  });

  it("SSRF: private IP range 10.x is silently rejected", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const req = makeRequest({
      prompt: "show data",
      sourceUrl: "http://10.0.0.1/internal-api",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeUndefined();
  });

  it("SSRF: file:// scheme is silently rejected", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const req = makeRequest({
      prompt: "show data",
      sourceUrl: "file:///etc/passwd",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeUndefined();
  });

  it("SSRF: link-local (169.254.x) is silently rejected", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const req = makeRequest({
      prompt: "show data",
      sourceUrl: "http://169.254.169.254/latest/meta-data/",
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.profile).toBeUndefined();
  });

  // ── scopeHint injection ───────────────────────────────────
  // buildUserMessage is module-internal; we verify its effect by inspecting
  // what text was passed to generateText.

  it("scopeHint is injected into the user message for a known region", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const req = makeRequest({
      prompt: "population in Europe",
      scopeHint: { region: "Europe", filterField: "continent" },
    });
    await POST(req);

    const callArgs = mockGenerateText.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callArgs.messages[0].content as string;
    expect(userContent).toContain("scope-hint");
    expect(userContent).toContain("Europe");
    expect(userContent).toContain("continent");
  });

  it("scopeHint is dropped for an unknown region", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const req = makeRequest({
      prompt: "show data",
      scopeHint: { region: "Narnia", filterField: "continent" },
    });
    await POST(req);

    const callArgs = mockGenerateText.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callArgs.messages[0].content as string;
    expect(userContent).not.toContain("scope-hint");
    expect(userContent).not.toContain("Narnia");
  });

  it("scopeHint is dropped for an unknown filterField", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const req = makeRequest({
      prompt: "show data",
      scopeHint: { region: "Europe", filterField: "unknownField" },
    });
    await POST(req);

    const callArgs = mockGenerateText.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callArgs.messages[0].content as string;
    expect(userContent).not.toContain("scope-hint");
  });

  it("all valid regions are accepted by scopeHint", async () => {
    const validRegions = ["Europe", "Africa", "Asia", "South America", "North America", "Oceania"];

    for (const region of validRegions) {
      vi.clearAllMocks();
      mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

      const req = makeRequest({
        prompt: `show data for ${region}`,
        scopeHint: { region, filterField: "continent" },
      });
      await POST(req);

      const callArgs = mockGenerateText.mock.calls[0][0] as {
        messages: Array<{ role: string; content: string }>;
      };
      const userContent = callArgs.messages[0].content as string;
      expect(userContent).toContain("scope-hint");
      expect(userContent).toContain(region);
    }
  });

  // ── Dataset profile ───────────────────────────────────────

  it("pre-computed dataProfile is included in the user message", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const profile = {
      featureCount: 42,
      geometryType: "Point" as const,
      bounds: [[5, 55], [25, 71]] as [[number, number], [number, number]],
      crs: null,
      attributes: [{ name: "pop", type: "number" as const }],
    };

    const req = makeRequest({
      prompt: "show population",
      dataProfile: profile,
    });
    await POST(req);

    const callArgs = mockGenerateText.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const userContent = callArgs.messages[0].content as string;
    expect(userContent).toContain("dataset-profile");
    expect(userContent).toContain("42");
    expect(userContent).toContain("pop");
  });

  it("response includes profile when dataProfile is provided", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(makeValidManifest()));

    const profile = {
      featureCount: 10,
      geometryType: "Polygon" as const,
      bounds: [[0, 0], [1, 1]] as [[number, number], [number, number]],
      crs: null,
      attributes: [],
    };

    const req = makeRequest({ prompt: "show data", dataProfile: profile });
    const res = await POST(req);
    const body = await res.json();

    expect(body.profile).toBeDefined();
    expect(body.profile.featureCount).toBe(10);
  });

  // ── 502 on bad AI response ────────────────────────────────

  it("returns 502 when AI response contains no JSON on all attempts", async () => {
    mockGenerateText.mockResolvedValue(makeTextResult("I cannot generate that."));

    const req = makeRequest({ prompt: "show data" });
    const res = await POST(req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/parse/i);
    expect(body.attempts).toBe(3);
  });

  it("returns 502 when AI returns empty text", async () => {
    mockGenerateText.mockResolvedValue(makeTextResult(""));

    const req = makeRequest({ prompt: "show data" });
    const res = await POST(req);

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/no text/i);
  });

  it("calls generateText multiple times on retry when first attempt returns unparseable JSON", async () => {
    const validManifest = makeValidManifest();

    // First two calls: garbled JSON, third: valid (route retries up to 3)
    mockGenerateText
      .mockResolvedValueOnce(makeTextResult("{ broken json"))
      .mockResolvedValueOnce(makeTextResult("still { broken"))
      .mockResolvedValueOnce(makeGenerateResult(validManifest));

    const req = makeRequest({ prompt: "show data" });
    const res = await POST(req);

    // Should succeed on the third attempt
    expect(res.status).toBe(200);
    expect(mockGenerateText).toHaveBeenCalledTimes(3);
  });
});
