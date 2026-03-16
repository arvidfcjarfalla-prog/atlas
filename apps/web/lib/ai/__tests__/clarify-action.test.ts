/**
 * Tests for decideClarifyAction — the pure classification logic
 * that determines what the create page does after a clarify response.
 */
import { describe, it, expect } from "vitest";
import { decideClarifyAction } from "../clarify-action";
import type { ClarifyResponse } from "../types";

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

function makeResponse(overrides: Partial<ClarifyResponse>): ClarifyResponse {
  return {
    ready: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════

describe("decideClarifyAction", () => {
  it("map_ready auto-generates", () => {
    const data = makeResponse({
      ready: true,
      resolutionStatus: "map_ready",
      resolvedPrompt: "population by country",
      dataUrl: "/api/geo/cached/abc",
      dataProfile: {
        featureCount: 10,
        geometryType: "Polygon",
        bounds: [[0, 0], [1, 1]],
        crs: null,
        attributes: [],
      },
    });

    const action = decideClarifyAction(data, "fallback prompt");

    expect(action.kind).toBe("generate");
    if (action.kind === "generate") {
      expect(action.resolvedPrompt).toBe("population by country");
      expect(action.dataUrl).toBe("/api/geo/cached/abc");
      expect(action.dataProfile).toBeDefined();
    }
  });

  it("tabular_only blocks auto-generation", () => {
    const data = makeResponse({
      ready: true,
      resolutionStatus: "tabular_only",
      dataUrl: "/api/geo/cached/xyz",
    });

    const action = decideClarifyAction(data, "some prompt");

    expect(action.kind).toBe("tabular_warning");
    if (action.kind === "tabular_warning") {
      expect(action.message.length).toBeGreaterThan(0);
      expect(action.message).toContain("could not join");
    }
  });

  it("absent resolutionStatus preserves legacy auto-generate behavior", () => {
    const data = makeResponse({
      ready: true,
      // No resolutionStatus — legacy fast path
      resolvedPrompt: "earthquakes worldwide",
      dataUrl: "/api/geo/cached/eq",
    });

    const action = decideClarifyAction(data, "fallback");

    expect(action.kind).toBe("generate");
    if (action.kind === "generate") {
      expect(action.resolvedPrompt).toBe("earthquakes worldwide");
      expect(action.dataUrl).toBe("/api/geo/cached/eq");
    }
  });

  it("not ready with questions asks for clarification", () => {
    const data = makeResponse({
      ready: false,
      questions: [
        {
          id: "q1",
          question: "What region?",
          options: ["Europe", "Asia"],
          aspect: "geography" as const,
        },
      ],
    });

    const action = decideClarifyAction(data, "prompt");

    expect(action.kind).toBe("ask_questions");
    if (action.kind === "ask_questions") {
      expect(action.questions).toHaveLength(1);
      expect(action.questions[0].id).toBe("q1");
      expect(action.warning).toBeNull();
    }
  });

  it("not ready with dataWarning propagates warning", () => {
    const data = makeResponse({
      ready: false,
      dataWarning: "No data available for this topic",
      questions: [],
    });

    const action = decideClarifyAction(data, "prompt");

    expect(action.kind).toBe("ask_questions");
    if (action.kind === "ask_questions") {
      expect(action.warning).toBe("No data available for this topic");
    }
  });

  it("uses fallback prompt when resolvedPrompt is absent", () => {
    const data = makeResponse({
      ready: true,
      // No resolvedPrompt, no resolutionStatus
      dataUrl: "/api/geo/cached/test",
    });

    const action = decideClarifyAction(data, "my fallback prompt");

    expect(action.kind).toBe("generate");
    if (action.kind === "generate") {
      expect(action.resolvedPrompt).toBe("my fallback prompt");
    }
  });

  it("tabular_warning passes through suggestions", () => {
    const data = makeResponse({
      ready: true,
      resolutionStatus: "tabular_only",
      dataUrl: "/api/geo/cached/xyz",
      suggestions: ["Population by county", "GDP in Europe"],
    });

    const action = decideClarifyAction(data, "some prompt");

    expect(action.kind).toBe("tabular_warning");
    if (action.kind === "tabular_warning") {
      expect(action.suggestions).toEqual(["Population by county", "GDP in Europe"]);
    }
  });

  it("tabular_warning with no suggestions returns empty array", () => {
    const data = makeResponse({
      ready: true,
      resolutionStatus: "tabular_only",
      dataUrl: "/api/geo/cached/xyz",
    });

    const action = decideClarifyAction(data, "some prompt");

    expect(action.kind).toBe("tabular_warning");
    if (action.kind === "tabular_warning") {
      expect(action.suggestions).toEqual([]);
    }
  });

  it("generate action propagates coverageRatio", () => {
    const data = makeResponse({
      ready: true,
      resolutionStatus: "map_ready",
      resolvedPrompt: "population",
      dataUrl: "/api/geo/cached/abc",
      coverageRatio: 0.75,
    });

    const action = decideClarifyAction(data, "fallback");

    expect(action.kind).toBe("generate");
    if (action.kind === "generate") {
      expect(action.coverageRatio).toBe(0.75);
    }
  });

  it("generate action has null coverageRatio when absent", () => {
    const data = makeResponse({
      ready: true,
      resolvedPrompt: "test",
      dataUrl: "/api/geo/cached/abc",
    });

    const action = decideClarifyAction(data, "fallback");

    expect(action.kind).toBe("generate");
    if (action.kind === "generate") {
      expect(action.coverageRatio).toBeNull();
    }
  });

  // ── Auto-answer tests ───────────────────────────────────

  it("auto-answers when all questions have recommended values", () => {
    const data = makeResponse({
      ready: false,
      questions: [
        {
          id: "region",
          question: "Which region?",
          options: ["Europe", "Asia", "Americas"],
          recommended: "Europe",
          aspect: "geography" as const,
        },
        {
          id: "metric",
          question: "Which metric?",
          options: ["Population", "GDP"],
          recommended: "Population",
          aspect: "metric" as const,
        },
      ],
    });

    const action = decideClarifyAction(data, "prompt");

    expect(action.kind).toBe("auto_answer");
    if (action.kind === "auto_answer") {
      expect(action.answers).toEqual({
        region: "Europe",
        metric: "Population",
      });
    }
  });

  it("asks questions when some lack recommended values", () => {
    const data = makeResponse({
      ready: false,
      questions: [
        {
          id: "region",
          question: "Which region?",
          options: ["Europe", "Asia"],
          recommended: "Europe",
          aspect: "geography" as const,
        },
        {
          id: "metric",
          question: "Which metric?",
          options: ["Population", "GDP"],
          // No recommended
          aspect: "metric" as const,
        },
      ],
    });

    const action = decideClarifyAction(data, "prompt");

    expect(action.kind).toBe("ask_questions");
    if (action.kind === "ask_questions") {
      expect(action.questions).toHaveLength(2);
    }
  });

  it("asks questions even with all recommended when dataWarning present", () => {
    const data = makeResponse({
      ready: false,
      dataWarning: "Limited data available",
      questions: [
        {
          id: "region",
          question: "Which region?",
          options: ["Europe", "Asia"],
          recommended: "Europe",
          aspect: "geography" as const,
        },
      ],
    });

    const action = decideClarifyAction(data, "prompt");

    expect(action.kind).toBe("ask_questions");
    if (action.kind === "ask_questions") {
      expect(action.warning).toBe("Limited data available");
    }
  });

  it("does not auto-answer with empty questions array", () => {
    const data = makeResponse({
      ready: false,
      questions: [],
    });

    const action = decideClarifyAction(data, "prompt");

    expect(action.kind).toBe("ask_questions");
    if (action.kind === "ask_questions") {
      expect(action.questions).toHaveLength(0);
    }
  });
});
