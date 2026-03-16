import { describe, it, expect } from "vitest";
import {
  buildMetricMatchPrompt,
  parseMetricMatchResponse,
} from "../tools/ai-metric-matcher";
import type { PxDimensionValue } from "../tools/pxweb-client";

// ─── Test data ───────────────────────────────────────────────

const POPULATION_VALUES: PxDimensionValue[] = [
  { code: "BE0101N1", label: "Folkmängd" },
  { code: "BE0101N2", label: "Folkökning" },
  { code: "BE0101N3", label: "Befolkningstäthet" },
];

const INCOME_VALUES: PxDimensionValue[] = [
  { code: "ME0104B1", label: "Sammanräknad förvärvsinkomst, medelvärde tkr" },
  { code: "ME0104B2", label: "Sammanräknad förvärvsinkomst, median tkr" },
];

// ─── buildMetricMatchPrompt ─────────────────────────────────

describe("buildMetricMatchPrompt", () => {
  it("includes all value codes and labels", () => {
    const { user } = buildMetricMatchPrompt(
      "befolkningstäthet i kommuner",
      POPULATION_VALUES,
      "Folkmängd per kommun",
    );
    expect(user).toContain("BE0101N1: Folkmängd");
    expect(user).toContain("BE0101N2: Folkökning");
    expect(user).toContain("BE0101N3: Befolkningstäthet");
  });

  it("includes the table label", () => {
    const { user } = buildMetricMatchPrompt(
      "test",
      POPULATION_VALUES,
      "Folkmängd per kommun",
    );
    expect(user).toContain("Folkmängd per kommun");
  });

  it("includes the user prompt", () => {
    const { user } = buildMetricMatchPrompt(
      "population density in Sweden",
      POPULATION_VALUES,
      "Table A",
    );
    expect(user).toContain("population density in Sweden");
  });

  it("system prompt asks for code only", () => {
    const { system } = buildMetricMatchPrompt(
      "test",
      POPULATION_VALUES,
      "Table A",
    );
    expect(system).toContain("ONLY the code");
  });
});

// ─── parseMetricMatchResponse ───────────────────────────────

describe("parseMetricMatchResponse", () => {
  const codes = ["BE0101N1", "BE0101N2", "BE0101N3"];

  it("returns exact code match", () => {
    expect(parseMetricMatchResponse("BE0101N3", codes)).toBe("BE0101N3");
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseMetricMatchResponse("  BE0101N2  ", codes)).toBe("BE0101N2");
  });

  it("extracts code from surrounding text", () => {
    expect(
      parseMetricMatchResponse(
        "The best match is BE0101N3 based on the query.",
        codes,
      ),
    ).toBe("BE0101N3");
  });

  it("returns null for invalid code", () => {
    expect(parseMetricMatchResponse("INVALID", codes)).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(parseMetricMatchResponse("", codes)).toBeNull();
  });

  it("returns first matching code when multiple appear", () => {
    // Should return the first one found in validCodes order
    const result = parseMetricMatchResponse(
      "BE0101N1 or BE0101N3",
      codes,
    );
    expect(result).toBe("BE0101N1");
  });

  it("handles codes with different formats", () => {
    const mixedCodes = ["ME0104B1", "ME0104B2"];
    expect(parseMetricMatchResponse("ME0104B2", mixedCodes)).toBe("ME0104B2");
  });
});
