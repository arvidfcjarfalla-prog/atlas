/**
 * Tests for the edit-map API route handler.
 *
 * Strategy: import POST() directly and drive it with a real Request object.
 * Mock "ai" (generateText) and all data-fetching side effects so tests run
 * without network access or an API key.
 *
 * vi.mock() calls are hoisted to the top of the module by Vitest, so static
 * imports of the route and mocked modules see the mocks in place.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MapManifest } from "@atlas/data-models";

// ─── Mocks ───────────────────────────────────────────────────

vi.mock("ai", () => ({
  generateText: vi.fn(),
  tool: vi.fn((_config: unknown) => _config),
  stepCountIs: vi.fn(() => () => false),
}));

vi.mock("@ai-sdk/anthropic", () => ({
  anthropic: vi.fn(() => ({ id: "mock-anthropic-model" })),
}));

vi.mock("@ai-sdk/google", () => ({
  google: vi.fn(() => ({ id: "mock-google-model" })),
}));

vi.mock("@/lib/ai/tools/data-search", () => ({
  searchPublicData: vi.fn().mockResolvedValue({ found: false }),
  setCache: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/ai/tools/eurostat", () => ({
  searchEurostat: vi.fn().mockResolvedValue({ found: false }),
}));

vi.mock("@/lib/ai/tools/data-commons", () => ({
  searchDataCommons: vi.fn().mockResolvedValue({ found: false }),
}));

vi.mock("@/lib/ai/tools/overpass", () => ({
  resolveAmenityQuery: vi.fn().mockReturnValue(null),
  queryOverpass: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ai/profiler", () => ({
  profileDataset: vi.fn().mockReturnValue({ featureCount: 0, geometryType: "Point", attributes: [] }),
}));

vi.mock("@/lib/ai/edit-map-prompt", () => ({
  buildEditMapPrompt: vi.fn().mockReturnValue("mock system prompt"),
}));

vi.mock("@/lib/ai/ai-client", () => ({
  MODELS: {
    generation: vi.fn(() => ({ id: "mock-model" })),
    utility: vi.fn(() => ({ id: "mock-utility-model" })),
  },
}));

// ─── Imports ─────────────────────────────────────────────────

import { generateText } from "ai";
// Route import: static import works because vi.mock() is hoisted before it
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — path resolved correctly at runtime via Vitest moduleResolution
import { POST } from "../../../app/api/ai/edit-map/route";

const mockGenerateText = vi.mocked(generateText);

// ─── Helpers ──────────────────────────────────────────────────

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/edit-map", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Minimal MapManifest that passes real schema validation. */
function makeManifest(overrides: Partial<MapManifest> = {}): MapManifest {
  return {
    id: "test-map",
    title: "Test Map",
    description: "A test map",
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
    defaultCenter: [0, 0],
    defaultZoom: 4,
    ...overrides,
  };
}

/** Build a generateText mock result with the required shape. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeGenerateResult(text: string): any {
  return {
    text,
    steps: [],
    content: [],
    reasoning: undefined,
    reasoningText: undefined,
    files: [],
    usage: {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      inputTokenDetails: {},
      outputTokenDetails: {},
    },
  };
}

// ─── Tests ───────────────────────────────────────────────────

describe("POST /api/ai/edit-map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Input validation ──────────────────────────────────────

  it("returns 400 when manifest is missing", async () => {
    const req = makeRequest({ message: "change color to red" });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing manifest or message/i);
  });

  it("returns 400 when message is missing", async () => {
    const req = makeRequest({ manifest: makeManifest() });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/missing manifest or message/i);
  });

  // ── Undo ──────────────────────────────────────────────────

  it("undo: returns original manifest when AI responds with manifest null", async () => {
    const original = makeManifest();
    mockGenerateText.mockResolvedValue(
      makeGenerateResult(
        JSON.stringify({ manifest: null, reply: "Ångrade.", changes: [] }),
      ),
    );

    const req = makeRequest({ manifest: original, message: "undo" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.undo).toBe(true);
    expect(body.manifest.id).toBe("test-map");
    expect(body.reply).toBe("Ångrade.");
  });

  it("undo: uses fallback reply when AI reply is empty", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateResult(JSON.stringify({ manifest: null, reply: "", changes: [] })),
    );

    const req = makeRequest({ manifest: makeManifest(), message: "undo" });
    const res = await POST(req);

    const body = await res.json();
    expect(body.undo).toBe(true);
    expect(body.reply.length).toBeGreaterThan(0);
  });

  // ── Plain text (conversational) response ──────────────────

  it("plain text response: returns original manifest with AI text as reply", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult("Hej! Hur kan jag hjälpa dig?"));

    const req = makeRequest({ manifest: makeManifest(), message: "hej" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.manifest.id).toBe("test-map");
    expect(body.reply).toBe("Hej! Hur kan jag hjälpa dig?");
    expect(body.changes).toEqual([]);
  });

  it("plain text response: uses fallback reply when AI text is empty", async () => {
    mockGenerateText.mockResolvedValue(makeGenerateResult(""));

    const req = makeRequest({ manifest: makeManifest(), message: "???" });
    const res = await POST(req);

    const body = await res.json();
    expect(body.reply.length).toBeGreaterThan(0);
    expect(body.manifest.id).toBe("test-map");
  });

  // ── Valid JSON manifest response ──────────────────────────

  it("valid JSON response: updates manifest and returns changes", async () => {
    const updated = makeManifest({ title: "Updated Map" });

    mockGenerateText.mockResolvedValue(
      makeGenerateResult(
        JSON.stringify({
          manifest: updated,
          reply: "Changed the title.",
          changes: ["Updated title to 'Updated Map'"],
        }),
      ),
    );

    const req = makeRequest({ manifest: makeManifest(), message: "rename the map" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.manifest.title).toBe("Updated Map");
    expect(body.reply).toBe("Changed the title.");
    expect(body.changes).toEqual(["Updated title to 'Updated Map'"]);
    expect(body.undo).toBeUndefined();
  });

  it("valid JSON response: JSON embedded in prose is still parsed", async () => {
    const updated = makeManifest({ title: "Prose-wrapped" });
    const prose = `Sure, here is the updated manifest:\n\n${JSON.stringify({ manifest: updated, reply: "Done.", changes: [] })}\n\nLet me know if you need anything else.`;

    mockGenerateText.mockResolvedValue(makeGenerateResult(prose));

    const req = makeRequest({ manifest: makeManifest(), message: "rename it" });
    const res = await POST(req);

    const body = await res.json();
    expect(body.manifest.title).toBe("Prose-wrapped");
  });

  // ── Validation failure ────────────────────────────────────

  it("validation failure: returns original manifest with error message", async () => {
    const original = makeManifest();
    // A manifest that fails schema validation: missing id, title, and layers
    const invalid = { id: "", title: "", layers: [] };

    mockGenerateText.mockResolvedValue(
      makeGenerateResult(
        JSON.stringify({ manifest: invalid, reply: "Fixed it.", changes: [] }),
      ),
    );

    const req = makeRequest({ manifest: original, message: "break it" });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    // Original manifest returned unchanged
    expect(body.manifest.id).toBe("test-map");
    // Reply should explain the failure
    expect(body.reply).toMatch(/Ändringen kunde inte göras/);
    expect(body.changes).toEqual([]);
  });

  // ── Chat history slicing ──────────────────────────────────

  it("chat history is sliced to the last 10 messages before sending", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateResult(
        JSON.stringify({ manifest: makeManifest(), reply: "ok", changes: [] }),
      ),
    );

    // Build 15 alternating messages
    const chatHistory = Array.from({ length: 15 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `message ${i}`,
    }));

    const req = makeRequest({
      manifest: makeManifest(),
      message: "new message",
      chatHistory,
    });
    await POST(req);

    const callArgs = mockGenerateText.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    const sentMessages = callArgs.messages;

    // Last 10 history entries + 1 new user message = 11
    expect(sentMessages).toHaveLength(11);
    // The last history message before the new one should be message index 14
    expect(sentMessages[9].content).toBe("message 14");
    // The final message is the new user message
    expect(sentMessages[10].content).toBe("new message");
    expect(sentMessages[10].role).toBe("user");
  });

  it("chat history shorter than 10 is passed through in full", async () => {
    mockGenerateText.mockResolvedValue(
      makeGenerateResult(
        JSON.stringify({ manifest: makeManifest(), reply: "ok", changes: [] }),
      ),
    );

    const chatHistory = [
      { role: "user" as const, content: "first" },
      { role: "assistant" as const, content: "second" },
    ];

    const req = makeRequest({
      manifest: makeManifest(),
      message: "third",
      chatHistory,
    });
    await POST(req);

    const callArgs = mockGenerateText.mock.calls[0][0] as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(callArgs.messages).toHaveLength(3);
  });
});
