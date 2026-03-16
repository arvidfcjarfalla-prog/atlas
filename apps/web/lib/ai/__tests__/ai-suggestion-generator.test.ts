import { describe, it, expect } from "vitest";
import {
  buildSuggestionPrompt,
  parseSuggestionResponse,
} from "../tools/ai-suggestion-generator";

// ─── buildSuggestionPrompt ──────────────────────────────────

describe("buildSuggestionPrompt", () => {
  it("includes the table label in system prompt", () => {
    const { system } = buildSuggestionPrompt(
      "inkomst i kommuner",
      "Sammanräknad förvärvsinkomst",
      [],
    );
    expect(system).toContain("Sammanräknad förvärvsinkomst");
  });

  it("includes the original prompt in user message", () => {
    const { user } = buildSuggestionPrompt(
      "inkomst i kommuner",
      "Table A",
      [],
    );
    expect(user).toContain("inkomst i kommuner");
  });

  it("includes pipeline reasons when available", () => {
    const { user } = buildSuggestionPrompt(
      "test",
      "Table A",
      ["detection: non_geographic", "join planner says not map-ready"],
    );
    expect(user).toContain("detection: non_geographic");
    expect(user).toContain("join planner");
  });

  it("handles empty reasons", () => {
    const { user } = buildSuggestionPrompt("test", "Table A", []);
    expect(user).not.toContain("Pipeline notes:");
  });

  it("asks for JSON array output", () => {
    const { system } = buildSuggestionPrompt("test", "Table A", []);
    expect(system).toContain("JSON array");
  });
});

// ─── parseSuggestionResponse ────────────────────────────────

describe("parseSuggestionResponse", () => {
  it("parses valid JSON array", () => {
    const result = parseSuggestionResponse(
      '["Population by county in Sweden", "GDP per capita in Europe", "Unemployment rate by state in USA"]',
    );
    expect(result).toEqual([
      "Population by county in Sweden",
      "GDP per capita in Europe",
      "Unemployment rate by state in USA",
    ]);
  });

  it("extracts array from surrounding text", () => {
    const result = parseSuggestionResponse(
      'Here are some suggestions: ["A", "B", "C"] hope that helps!',
    );
    expect(result).toEqual(["A", "B", "C"]);
  });

  it("limits to 3 suggestions", () => {
    const result = parseSuggestionResponse(
      '["A", "B", "C", "D", "E"]',
    );
    expect(result).toHaveLength(3);
  });

  it("filters out non-string values", () => {
    const result = parseSuggestionResponse(
      '["valid", 42, null, "also valid"]',
    );
    expect(result).toEqual(["valid", "also valid"]);
  });

  it("filters out empty strings", () => {
    const result = parseSuggestionResponse('["valid", "", "also valid"]');
    expect(result).toEqual(["valid", "also valid"]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseSuggestionResponse("not json")).toEqual([]);
  });

  it("returns empty array for empty text", () => {
    expect(parseSuggestionResponse("")).toEqual([]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseSuggestionResponse('{"key": "value"}')).toEqual([]);
  });
});
