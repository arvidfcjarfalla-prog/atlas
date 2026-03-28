/**
 * Structured evaluation of 50 prompts through the Atlas clarify pipeline.
 * Tests data discovery, source routing, geography detection, and output quality.
 *
 * Usage: npx tsx apps/web/scripts/eval-clarify-50.ts
 */

const BASE = "http://127.0.0.1:3000";
const TIMEOUT = 45_000;
const CONCURRENCY = 2;

interface EvalPrompt {
  id: number;
  prompt: string;
  expectedIntent: string;
  expectedGeography: string;
  expectedSource: string;
  difficulty: "easy" | "medium" | "hard";
  category: string;
}

const PROMPTS: EvalPrompt[] = [
  // ── Easy: Global/country-level, well-known metrics ──
  { id: 1, prompt: "World population by country", expectedIntent: "Population choropleth, all countries", expectedGeography: "country", expectedSource: "worldbank|restcountries", difficulty: "easy", category: "global-stats" },
  { id: 2, prompt: "GDP per capita worldwide", expectedIntent: "GDP per capita choropleth", expectedGeography: "country", expectedSource: "worldbank", difficulty: "easy", category: "global-stats" },
  { id: 3, prompt: "CO2 emissions per country", expectedIntent: "CO2 choropleth", expectedGeography: "country", expectedSource: "worldbank", difficulty: "easy", category: "global-stats" },
  { id: 4, prompt: "Life expectancy around the world", expectedIntent: "Life expectancy choropleth", expectedGeography: "country", expectedSource: "worldbank", difficulty: "easy", category: "global-stats" },
  { id: 5, prompt: "Show active earthquakes", expectedIntent: "Point map of recent earthquakes", expectedGeography: "point-global", expectedSource: "catalog-earthquakes", difficulty: "easy", category: "natural-events" },
  { id: 6, prompt: "Active wildfires", expectedIntent: "Point/cluster map of current wildfires", expectedGeography: "point-global", expectedSource: "eonet", difficulty: "easy", category: "natural-events" },
  { id: 7, prompt: "Restaurants in Stockholm", expectedIntent: "POI point map", expectedGeography: "city-poi", expectedSource: "overpass", difficulty: "easy", category: "overpass-poi" },
  { id: 8, prompt: "Cafes in Paris", expectedIntent: "POI point map", expectedGeography: "city-poi", expectedSource: "overpass", difficulty: "easy", category: "overpass-poi" },
  { id: 9, prompt: "World countries", expectedIntent: "Basic country polygons", expectedGeography: "country", expectedSource: "catalog|restcountries", difficulty: "easy", category: "basemap" },
  { id: 10, prompt: "Literacy rate by country", expectedIntent: "Literacy choropleth", expectedGeography: "country", expectedSource: "worldbank", difficulty: "easy", category: "global-stats" },

  // ── Medium: Regional filtering, Eurostat, subnational ──
  { id: 11, prompt: "GDP per capita in Europe", expectedIntent: "GDP per capita, European countries only", expectedGeography: "country-europe", expectedSource: "eurostat", difficulty: "medium", category: "regional-stats" },
  { id: 12, prompt: "Unemployment rate in EU countries", expectedIntent: "Unemployment choropleth, EU", expectedGeography: "country-europe", expectedSource: "eurostat", difficulty: "medium", category: "regional-stats" },
  { id: 13, prompt: "Population density in Africa", expectedIntent: "Pop density choropleth, African countries", expectedGeography: "country-africa", expectedSource: "worldbank", difficulty: "medium", category: "regional-stats" },
  { id: 14, prompt: "Befolkning per kommun i Sverige", expectedIntent: "Population by municipality, Sweden", expectedGeography: "municipality-se", expectedSource: "pxweb-scb", difficulty: "medium", category: "pxweb-nordic" },
  { id: 15, prompt: "Medelinkomst per län i Sverige", expectedIntent: "Average income by county, Sweden", expectedGeography: "county-se", expectedSource: "pxweb-scb", difficulty: "medium", category: "pxweb-nordic" },
  { id: 16, prompt: "Befolkning per kommune i Norge", expectedIntent: "Population by municipality, Norway", expectedGeography: "municipality-no", expectedSource: "pxweb-ssb", difficulty: "medium", category: "pxweb-nordic" },
  { id: 17, prompt: "Infant mortality rate in Asia", expectedIntent: "Infant mortality, Asian countries", expectedGeography: "country-asia", expectedSource: "worldbank", difficulty: "medium", category: "regional-stats" },
  { id: 18, prompt: "Renewable energy percentage by country", expectedIntent: "Renewable energy choropleth", expectedGeography: "country", expectedSource: "worldbank", difficulty: "medium", category: "global-stats" },
  { id: 19, prompt: "Hospitals in London", expectedIntent: "POI point map of hospitals", expectedGeography: "city-poi", expectedSource: "overpass", difficulty: "medium", category: "overpass-poi" },
  { id: 20, prompt: "Parks in Berlin", expectedIntent: "POI map of parks/green spaces", expectedGeography: "city-poi", expectedSource: "overpass", difficulty: "medium", category: "overpass-poi" },

  // ── Medium: Historical, categorical, edge cases ──
  { id: 21, prompt: "Mongol Empire", expectedIntent: "Historical basemap ~1279", expectedGeography: "historical-polygons", expectedSource: "historical-basemaps", difficulty: "medium", category: "historical" },
  { id: 22, prompt: "Roman Empire at its peak", expectedIntent: "Historical basemap ~100 AD", expectedGeography: "historical-polygons", expectedSource: "historical-basemaps", difficulty: "medium", category: "historical" },
  { id: 23, prompt: "World War 2 borders", expectedIntent: "Historical basemap ~1938", expectedGeography: "historical-polygons", expectedSource: "historical-basemaps", difficulty: "medium", category: "historical" },
  { id: 24, prompt: "Fertility rate in South America", expectedIntent: "Fertility rate, South American countries", expectedGeography: "country-southamerica", expectedSource: "worldbank", difficulty: "medium", category: "regional-stats" },
  { id: 25, prompt: "Forest area percentage worldwide", expectedIntent: "Forest area % choropleth", expectedGeography: "country", expectedSource: "worldbank", difficulty: "medium", category: "global-stats" },

  // ── Hard: Non-English, specific metrics, tricky routing ──
  { id: 26, prompt: "Arbetslöshet per kommun i Sverige", expectedIntent: "Unemployment by municipality, Sweden", expectedGeography: "municipality-se", expectedSource: "pxweb-scb", difficulty: "hard", category: "pxweb-nordic" },
  { id: 27, prompt: "Utbildningsnivå per län", expectedIntent: "Education level by county, Sweden", expectedGeography: "county-se", expectedSource: "pxweb-scb", difficulty: "hard", category: "pxweb-nordic" },
  { id: 28, prompt: "Boligpriser per fylke i Norge", expectedIntent: "Housing prices by county, Norway", expectedGeography: "county-no", expectedSource: "pxweb-ssb", difficulty: "hard", category: "pxweb-nordic" },
  { id: 29, prompt: "Minimum wage across Europe", expectedIntent: "Minimum wage choropleth, Europe", expectedGeography: "country-europe", expectedSource: "eurostat", difficulty: "hard", category: "regional-stats" },
  { id: 30, prompt: "Gini coefficient by country", expectedIntent: "Income inequality choropleth", expectedGeography: "country", expectedSource: "worldbank|eurostat", difficulty: "hard", category: "global-stats" },

  // ── Hard: Ambiguous, multi-step, cross-source ──
  { id: 31, prompt: "Crime rate in Swedish municipalities", expectedIntent: "Crime rate by municipality, Sweden", expectedGeography: "municipality-se", expectedSource: "pxweb-scb", difficulty: "hard", category: "pxweb-nordic" },
  { id: 32, prompt: "Internet users per country", expectedIntent: "Internet usage choropleth", expectedGeography: "country", expectedSource: "worldbank", difficulty: "medium", category: "global-stats" },
  { id: 33, prompt: "Tectonic plates", expectedIntent: "Tectonic plate boundaries", expectedGeography: "global-geological", expectedSource: "catalog-tectonic", difficulty: "easy", category: "basemap" },
  { id: 34, prompt: "Universities in Tokyo", expectedIntent: "POI map of universities", expectedGeography: "city-poi", expectedSource: "overpass", difficulty: "medium", category: "overpass-poi" },
  { id: 35, prompt: "Bars in New York", expectedIntent: "POI map of bars", expectedGeography: "city-poi", expectedSource: "overpass", difficulty: "medium", category: "overpass-poi" },

  // ── Hard: Metrics that test source routing precision ──
  { id: 36, prompt: "GDP per capita in Nordic countries", expectedIntent: "GDP per capita, SE/NO/DK/FI/IS", expectedGeography: "country-nordic", expectedSource: "eurostat|worldbank", difficulty: "hard", category: "regional-stats" },
  { id: 37, prompt: "Healthcare spending as percentage of GDP", expectedIntent: "Health expenditure choropleth", expectedGeography: "country", expectedSource: "worldbank", difficulty: "hard", category: "global-stats" },
  { id: 38, prompt: "Urban population percentage", expectedIntent: "Urbanization rate choropleth", expectedGeography: "country", expectedSource: "worldbank", difficulty: "medium", category: "global-stats" },
  { id: 39, prompt: "Deforestation rates by country", expectedIntent: "Annual forest loss choropleth", expectedGeography: "country", expectedSource: "web-search|worldbank", difficulty: "hard", category: "global-stats" },
  { id: 40, prompt: "Electric vehicle adoption in Europe", expectedIntent: "EV market share/registration, Europe", expectedGeography: "country-europe", expectedSource: "eurostat|web-search", difficulty: "hard", category: "regional-stats" },

  // ── Hard: Language variety and ambiguity ──
  { id: 41, prompt: "Medianinkomst i Stockholms län", expectedIntent: "Median income in Stockholm county municipalities", expectedGeography: "municipality-se", expectedSource: "pxweb-scb", difficulty: "hard", category: "pxweb-nordic" },
  { id: 42, prompt: "Innvandrere per kommune i Norge", expectedIntent: "Immigrants by municipality, Norway", expectedGeography: "municipality-no", expectedSource: "pxweb-ssb", difficulty: "hard", category: "pxweb-nordic" },
  { id: 43, prompt: "Population of African countries", expectedIntent: "Population choropleth, Africa only", expectedGeography: "country-africa", expectedSource: "worldbank", difficulty: "medium", category: "regional-stats" },
  { id: 44, prompt: "Cold War era world map", expectedIntent: "Historical basemap ~1960", expectedGeography: "historical-polygons", expectedSource: "historical-basemaps", difficulty: "medium", category: "historical" },
  { id: 45, prompt: "Volcanoes worldwide", expectedIntent: "Volcano point map", expectedGeography: "point-global", expectedSource: "catalog|eonet", difficulty: "easy", category: "natural-events" },

  // ── Edge cases: Should ask questions or return tabular_only ──
  { id: 46, prompt: "Compare Sweden and Norway", expectedIntent: "Ambiguous — needs metric clarification", expectedGeography: "country-nordic", expectedSource: "should-ask", difficulty: "hard", category: "ambiguous" },
  { id: 47, prompt: "Show me some data about Europe", expectedIntent: "Ambiguous — needs topic clarification", expectedGeography: "country-europe", expectedSource: "should-ask", difficulty: "hard", category: "ambiguous" },
  { id: 48, prompt: "Weather in Stockholm", expectedIntent: "Real-time weather — likely no good source", expectedGeography: "city", expectedSource: "should-warn", difficulty: "hard", category: "unsupported" },
  { id: 49, prompt: "Pub in Malmö", expectedIntent: "POI point map of pubs", expectedGeography: "city-poi", expectedSource: "overpass", difficulty: "medium", category: "overpass-poi" },
  { id: 50, prompt: "Bicycle paths in Copenhagen", expectedIntent: "POI/line map of cycle infrastructure", expectedGeography: "city-poi", expectedSource: "overpass", difficulty: "hard", category: "overpass-poi" },
];

interface ClarifyResult {
  ready?: boolean;
  resolvedPrompt?: string;
  dataUrl?: string;
  dataProfile?: {
    featureCount?: number;
    geometryType?: string;
    bounds?: { south: number; west: number; north: number; east: number };
    attributes?: Array<{
      name: string;
      type: string;
      uniqueValues: number;
      nullCount: number;
      min?: number;
      max?: number;
      mean?: number;
      distribution?: string;
      sample?: unknown[];
    }>;
  };
  resolutionStatus?: string;
  questions?: Array<{ id: string; question: string; options: string[] }>;
  dataWarning?: string;
  matchedCatalogId?: string;
  useOverpass?: unknown;
  searchedData?: unknown;
  tabularData?: unknown;
  error?: string;
}

async function runPrompt(p: EvalPrompt): Promise<{ prompt: EvalPrompt; result: ClarifyResult; latencyMs: number; error?: string }> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(`${BASE}/api/ai/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: p.prompt }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json();
    return { prompt: p, result: data, latencyMs: Date.now() - start };
  } catch (e: unknown) {
    return { prompt: p, result: {}, latencyMs: Date.now() - start, error: String(e) };
  }
}

async function runBatch(): Promise<void> {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`ATLAS CLARIFY PIPELINE EVALUATION — 50 PROMPTS`);
  console.log(`${"=".repeat(80)}\n`);

  const results: Array<{ prompt: EvalPrompt; result: ClarifyResult; latencyMs: number; error?: string }> = [];

  // Run with concurrency limit
  const queue = [...PROMPTS];
  const running: Promise<void>[] = [];

  async function processNext() {
    while (queue.length > 0) {
      const p = queue.shift()!;
      const r = await runPrompt(p);
      results.push(r);

      const status = r.error ? "ERROR" : r.result.ready ? "READY" : r.result.resolutionStatus === "tabular_only" ? "TABULAR" : r.result.questions ? "ASKED" : "OTHER";
      const source = inferSource(r.result);
      console.log(`[${String(r.prompt.id).padStart(2)}] ${status.padEnd(8)} ${r.latencyMs.toString().padStart(5)}ms  ${source.padEnd(20)} ${r.prompt.prompt}`);
    }
  }

  for (let i = 0; i < CONCURRENCY; i++) {
    running.push(processNext());
  }
  await Promise.all(running);

  // Sort by id
  results.sort((a, b) => a.prompt.id - b.prompt.id);

  // Output detailed JSON for analysis
  const output = results.map((r) => ({
    id: r.prompt.id,
    prompt: r.prompt.prompt,
    difficulty: r.prompt.difficulty,
    category: r.prompt.category,
    expectedIntent: r.prompt.expectedIntent,
    expectedGeography: r.prompt.expectedGeography,
    expectedSource: r.prompt.expectedSource,
    latencyMs: r.latencyMs,
    error: r.error || null,
    ready: r.result.ready ?? false,
    resolutionStatus: r.result.resolutionStatus ?? null,
    resolvedPrompt: r.result.resolvedPrompt ?? null,
    dataUrl: r.result.dataUrl ?? null,
    matchedCatalogId: r.result.matchedCatalogId ?? null,
    hasQuestions: !!r.result.questions,
    questions: r.result.questions ?? null,
    dataWarning: r.result.dataWarning ?? null,
    inferredSource: inferSource(r.result),
    profile: r.result.dataProfile ? {
      featureCount: r.result.dataProfile.featureCount,
      geometryType: r.result.dataProfile.geometryType,
      attributes: r.result.dataProfile.attributes?.map((a) => ({
        name: a.name,
        type: a.type,
        uniqueValues: a.uniqueValues,
        nullCount: a.nullCount,
        min: a.min,
        max: a.max,
        sample: a.sample?.slice(0, 3),
      })),
      bounds: r.result.dataProfile.bounds,
    } : null,
  }));

  const fs = await import("fs");
  const outPath = "apps/web/test-data/eval-clarify-50.json";
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nDetailed results written to ${outPath}`);

  // Summary stats
  const ready = results.filter((r) => r.result.ready);
  const tabular = results.filter((r) => r.result.resolutionStatus === "tabular_only");
  const asked = results.filter((r) => !r.result.ready && r.result.questions && !r.result.resolutionStatus);
  const errors = results.filter((r) => r.error);
  const other = results.filter((r) => !r.result.ready && !r.result.questions && !r.error && !r.result.resolutionStatus);

  console.log(`\n${"=".repeat(60)}`);
  console.log(`SUMMARY`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Ready (map):     ${ready.length}/50`);
  console.log(`  Tabular only:    ${tabular.length}/50`);
  console.log(`  Asked questions:  ${asked.length}/50`);
  console.log(`  Errors/timeout:  ${errors.length}/50`);
  console.log(`  Other:           ${other.length}/50`);
  console.log(`  Avg latency:     ${Math.round(results.reduce((s, r) => s + r.latencyMs, 0) / results.length)}ms`);

  // Source distribution
  const sources: Record<string, number> = {};
  for (const r of results) {
    const s = inferSource(r.result);
    sources[s] = (sources[s] || 0) + 1;
  }
  console.log(`\nSource distribution:`);
  for (const [s, n] of Object.entries(sources).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(20)} ${n}`);
  }

  // Difficulty breakdown
  for (const diff of ["easy", "medium", "hard"] as const) {
    const subset = results.filter((r) => r.prompt.difficulty === diff);
    const readyCount = subset.filter((r) => r.result.ready).length;
    console.log(`\n${diff}: ${readyCount}/${subset.length} ready`);
  }
}

function inferSource(r: ClarifyResult): string {
  if (!r.dataUrl && r.questions) return "asked-questions";
  if (!r.dataUrl && r.dataWarning) return "warned";
  if (!r.dataUrl) return "no-result";
  const url = r.dataUrl;
  if (url.includes("historical-basemaps") || url.includes("aourednik")) return "historical-basemaps";
  if (url.includes("overpass")) return "overpass";
  if (url.includes("earthquake") || url.includes("usgs.gov")) return "catalog-earthquake";
  if (url.includes("eonet")) return "catalog-eonet";
  if (url.includes("tectonic")) return "catalog-tectonic";
  if (url.includes("/geo/cached/")) return "cached-pipeline";
  if (url.includes("admin0") || url.includes("countries")) return "catalog-countries";
  if (r.matchedCatalogId) return `catalog-${r.matchedCatalogId}`;
  if (r.resolutionStatus === "tabular_only") return "tabular-only";
  return "unknown";
}

runBatch().catch((e) => {
  console.error("Eval failed:", e);
  process.exit(1);
});
