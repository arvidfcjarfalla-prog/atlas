import { describe, it, expect } from "vitest";
import {
  detectCountries,
  extractCoverageTags,
  resolveOfficialStatsSources,
  hasOfficialSources,
} from "../tools/official-stats-resolver";
import {
  OFFICIAL_STATS_REGISTRY,
  getSourcesForCountry,
  getInternationalSources,
  sourcesByCoverageTag,
} from "../tools/global-stats-registry";

// ─── Registry tests ─────────────────────────────────────────

describe("global-stats-registry", () => {
  it("has 55+ sources", () => {
    expect(OFFICIAL_STATS_REGISTRY.length).toBeGreaterThanOrEqual(55);
  });

  it("every source has required fields", () => {
    for (const s of OFFICIAL_STATS_REGISTRY) {
      expect(s.id).toBeTruthy();
      expect(s.agencyName).toBeTruthy();
      expect(s.baseUrl).toBeTruthy();
      expect(s.coverageTags.length).toBeGreaterThan(0);
      expect(s.formats.length).toBeGreaterThan(0);
      expect(["verified", "provisional", "needs_review"]).toContain(s.verificationStatus);
    }
  });

  it("has unique IDs", () => {
    const ids = OFFICIAL_STATS_REGISTRY.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("getSourcesForCountry returns sorted results", () => {
    const se = getSourcesForCountry("SE");
    expect(se.length).toBeGreaterThan(0);
    expect(se[0].countryCode).toBe("SE");
    // Check sorted by priority descending (higher = better)
    for (let i = 1; i < se.length; i++) {
      expect(se[i].priority).toBeLessThanOrEqual(se[i - 1].priority);
    }
  });

  it("getInternationalSources returns only null-country sources", () => {
    const intl = getInternationalSources();
    expect(intl.length).toBeGreaterThan(0);
    for (const s of intl) {
      expect(s.countryCode).toBeNull();
    }
  });

  it("sourcesByCoverageTag indexes are populated", () => {
    expect(sourcesByCoverageTag.has("population")).toBe(true);
    expect(sourcesByCoverageTag.has("economy")).toBe(true);
    expect(sourcesByCoverageTag.get("population")!.length).toBeGreaterThan(5);
  });
});

// ─── Country detection ──────────────────────────────────────

describe("detectCountries", () => {
  it("detects single country", () => {
    expect(detectCountries("unemployment in Sweden")).toContain("SE");
  });

  it("detects country from Swedish name", () => {
    expect(detectCountries("befolkning i Tyskland")).toContain("DE");
  });

  it("detects US variants", () => {
    expect(detectCountries("US state unemployment")).toContain("US");
    expect(detectCountries("United States population")).toContain("US");
  });

  it("detects multiple countries", () => {
    const codes = detectCountries("compare Sweden and Norway");
    expect(codes).toContain("SE");
    expect(codes).toContain("NO");
  });

  it("detects region as multiple countries", () => {
    const codes = detectCountries("population in Nordic countries");
    expect(codes).toContain("SE");
    expect(codes).toContain("NO");
    expect(codes).toContain("DK");
    expect(codes).toContain("FI");
    expect(codes).toContain("IS");
  });

  it("detects Europe as region", () => {
    const codes = detectCountries("dog owners per capita in Europe");
    expect(codes.length).toBeGreaterThan(5);
    expect(codes).toContain("SE");
    expect(codes).toContain("DE");
  });

  it("returns empty for global/unspecific prompts", () => {
    const codes = detectCountries("world population");
    // "world" doesn't map to a specific country
    expect(codes.length).toBe(0);
  });
});

// ─── Coverage tag extraction ────────────────────────────────

describe("extractCoverageTags", () => {
  it("extracts population tag", () => {
    const tags = extractCoverageTags("population by country");
    expect(tags).toContain("population");
  });

  it("extracts unemployment → labor tag", () => {
    const tags = extractCoverageTags("unemployment rates in Sweden");
    expect(tags).toContain("labor");
  });

  it("extracts GDP → economy tag", () => {
    const tags = extractCoverageTags("GDP per capita");
    expect(tags).toContain("economy");
  });

  it("extracts health-related tags", () => {
    const tags = extractCoverageTags("life expectancy by country");
    expect(tags).toContain("health");
  });

  it("extracts environment for deforestation", () => {
    const tags = extractCoverageTags("deforestation by country");
    expect(tags).toContain("environment");
  });

  it("extracts Swedish topic words", () => {
    const tags = extractCoverageTags("arbetslöshet i Sverige");
    expect(tags).toContain("labor");
  });

  it("handles niche topics like dog owners", () => {
    const tags = extractCoverageTags("hundägare per capita i Europa");
    expect(tags.length).toBeGreaterThan(0);
  });

  it("returns empty for gibberish", () => {
    const tags = extractCoverageTags("xyzzy foobar");
    expect(tags.length).toBe(0);
  });
});

// ─── Resolver ───────────────────────────────────────────────

describe("resolveOfficialStatsSources", () => {
  it("returns SCB for Swedish unemployment", () => {
    const results = resolveOfficialStatsSources(
      { topic: "unemployment sweden", metric: "rates", geography: "SE" },
      "unemployment rates in Sweden",
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].source.id).toBe("se-scb");
  });

  it("returns country-specific sources for European data", () => {
    const results = resolveOfficialStatsSources(
      { topic: "population europe", geography: "europe" },
      "population in Europe",
      5,
    );
    expect(results.length).toBeGreaterThan(0);
    // Top results should be country-specific European sources
    expect(results[0].source.countryCode).not.toBeNull();
  });

  it("returns Eurostat for EU-wide queries without country", () => {
    // When searching for a general EU topic without specifying countries,
    // Eurostat should appear as an international source
    const results = resolveOfficialStatsSources(
      { topic: "gdp economy" },
      "GDP by country",
      5,
    );
    const eurostat = results.find((r) => r.source.id === "eu-eurostat");
    expect(eurostat).toBeDefined();
  });

  it("returns US Census for US state data", () => {
    const results = resolveOfficialStatsSources(
      { topic: "unemployment us states", metric: "rates", geography: "states" },
      "US state unemployment rates",
    );
    expect(results.length).toBeGreaterThan(0);
    const census = results.find((r) => r.source.id === "us-census");
    expect(census).toBeDefined();
  });

  it("returns international sources for global queries", () => {
    const results = resolveOfficialStatsSources(
      { topic: "gdp country" },
      "GDP by country",
    );
    expect(results.length).toBeGreaterThan(0);
    // Top result should be international
    expect(results[0].source.countryCode).toBeNull();
  });

  it("returns WHO for health queries", () => {
    const results = resolveOfficialStatsSources(
      { topic: "disease mortality" },
      "disease mortality by country",
    );
    const who = results.find((r) => r.source.id === "intl-who");
    expect(who).toBeDefined();
  });

  it("returns empty for unrecognized topics with no geography", () => {
    const results = resolveOfficialStatsSources(
      { topic: "xyzzy" },
      "xyzzy foobar baz",
    );
    expect(results.length).toBe(0);
  });

  it("ranks verified sources higher", () => {
    const results = resolveOfficialStatsSources(
      { topic: "population sweden" },
      "population in Sweden",
    );
    if (results.length >= 2) {
      const verified = results.filter((r) => r.source.verificationStatus === "verified");
      const unverified = results.filter((r) => r.source.verificationStatus !== "verified");
      if (verified.length > 0 && unverified.length > 0) {
        expect(verified[0].score).toBeGreaterThanOrEqual(unverified[0].score);
      }
    }
  });

  it("respects maxResults limit", () => {
    const results = resolveOfficialStatsSources(
      { topic: "population europe", geography: "europe" },
      "population in Europe",
      3,
    );
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("includes match reasons", () => {
    const results = resolveOfficialStatsSources(
      { topic: "unemployment sweden" },
      "unemployment in Sweden",
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].matchReasons.length).toBeGreaterThan(0);
  });
});

// ─── hasOfficialSources ─────────────────────────────────────

describe("hasOfficialSources", () => {
  it("returns true for known country + topic", () => {
    expect(hasOfficialSources("unemployment in Sweden")).toBe(true);
  });

  it("returns true for international topic", () => {
    expect(hasOfficialSources("GDP by country")).toBe(true);
  });

  it("returns false for unrecognized input", () => {
    expect(hasOfficialSources("xyzzy foobar baz")).toBe(false);
  });

  it("returns true for Swedish prompts", () => {
    expect(hasOfficialSources("arbetslöshet i Sverige")).toBe(true);
  });
});
