/**
 * Batch evaluation of ~84 prompts through the Atlas clarify pipeline.
 *
 * Purpose: Find error CLASSES, not individual prompt fixes.
 * No judge, no generate-map — clarify-only with manual review.
 *
 * Usage:
 *   npx tsx apps/web/scripts/eval-clarify-batch.ts
 *
 * Requires dev server at localhost:3000.
 * Output: apps/web/test-data/eval-clarify-batch.json
 */

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
const TIMEOUT = 60_000;
const CONCURRENCY = 2;

// ─── Prompt definitions ────────────────────────────────────

type Category =
  | "global-stats"
  | "pxweb-nordic"
  | "eurostat"
  | "poi"
  | "entity-search"
  | "should-ask"
  | "impossible"
  | "scope-sensitive"
  | "time-sensitive"
  | "historical"
  | "precedence-test";

interface BatchPrompt {
  id: number;
  prompt: string;
  category: Category;
  /** What source SHOULD handle this (for manual review, not auto-judge). */
  expectedSource: string;
  /** Notes for the reviewer — what to look for. */
  notes: string;
}

const PROMPTS: BatchPrompt[] = [
  // ── Global stats: clear metrics, should route to World Bank ──────
  { id: 1, prompt: "World population by country", category: "global-stats", expectedSource: "worldbank|catalog", notes: "Basic WB indicator. Check featureCount ~190." },
  { id: 2, prompt: "GDP per capita worldwide", category: "global-stats", expectedSource: "worldbank", notes: "NY.GDP.PCAP.CD. Should be global, not EU-only." },
  { id: 3, prompt: "CO2 emissions per capita globally", category: "global-stats", expectedSource: "worldbank", notes: "Tricky indicator — archived EN.ATM.CO2E.PC vs new EN.GHG.CO2.PC.CE.AR5." },
  { id: 4, prompt: "Life expectancy at birth by country", category: "global-stats", expectedSource: "worldbank", notes: "SP.DYN.LE00.IN. Standard indicator." },
  { id: 5, prompt: "Maternal mortality ratio worldwide", category: "global-stats", expectedSource: "worldbank", notes: "SH.STA.MMRT. Less common metric." },
  { id: 6, prompt: "Access to electricity by country", category: "global-stats", expectedSource: "worldbank", notes: "EG.ELC.ACCS.ZS. Infrastructure metric." },
  { id: 7, prompt: "Internet users as percentage of population", category: "global-stats", expectedSource: "worldbank", notes: "IT.NET.USER.ZS. Should return latest year." },
  { id: 8, prompt: "Government debt as share of GDP", category: "global-stats", expectedSource: "worldbank", notes: "GC.DOD.TOTL.GD.ZS. Finance metric." },
  { id: 9, prompt: "Literacy rate by country", category: "global-stats", expectedSource: "worldbank", notes: "SE.ADT.LITR.ZS. May have missing data for OECD countries." },
  { id: 10, prompt: "Forest area percentage worldwide", category: "global-stats", expectedSource: "worldbank", notes: "AG.LND.FRST.ZS. Environmental metric." },

  // ── PxWeb/Nordic: Swedish, Norwegian, Finnish stats ──────────────
  { id: 11, prompt: "Befolkning per kommun i Sverige", category: "pxweb-nordic", expectedSource: "pxweb-scb", notes: "Basic SCB pop. Check ~290 municipalities." },
  { id: 12, prompt: "Medelinkomst per län i Sverige", category: "pxweb-nordic", expectedSource: "pxweb-scb", notes: "County-level income. Check 21 län." },
  { id: 13, prompt: "Arbetslöshet i Sveriges kommuner", category: "pxweb-nordic", expectedSource: "pxweb-scb", notes: "Unemployment by municipality. Metric detection on compound word." },
  { id: 14, prompt: "Befolkning per kommune i Norge", category: "pxweb-nordic", expectedSource: "pxweb-ssb", notes: "Norwegian municipalities (~356). Norwegian language." },
  { id: 15, prompt: "Innvandrere i norske kommuner", category: "pxweb-nordic", expectedSource: "pxweb-ssb", notes: "Immigration stats. Norwegian language, SSB routing." },
  { id: 16, prompt: "Boligpriser i Norge per fylke", category: "pxweb-nordic", expectedSource: "pxweb-ssb", notes: "Housing prices by county. Norwegian, SSB." },
  { id: 17, prompt: "Väestö kunnittain Suomessa", category: "pxweb-nordic", expectedSource: "pxweb-statfin", notes: "Finnish population by municipality. Finnish language routing." },
  { id: 18, prompt: "Befolkning per kommun i Finland", category: "pxweb-nordic", expectedSource: "pxweb-statfin", notes: "Finnish pop in Swedish — should still route to StatFin." },
  { id: 19, prompt: "Utbildningsnivå per kommun i Sverige", category: "pxweb-nordic", expectedSource: "pxweb-scb", notes: "Education level by municipality. Complex metric." },
  { id: 20, prompt: "Antal bilar per kommun i Sverige", category: "pxweb-nordic", expectedSource: "pxweb-scb", notes: "Vehicle registration. Niche metric — may not resolve." },
  { id: 21, prompt: "Medianinkomst i Stockholms kommuner", category: "pxweb-nordic", expectedSource: "pxweb-scb", notes: "Sub-county scope (Stockholm only). Check scope filtering." },
  { id: 22, prompt: "Folkmängd per landskap i Sverige", category: "pxweb-nordic", expectedSource: "pxweb-scb", notes: "Landskap vs län — tricky geographic level." },

  // ── Eurostat: European statistics ────────────────────────────────
  { id: 23, prompt: "GDP per capita in EU countries", category: "eurostat", expectedSource: "eurostat", notes: "Should route Eurostat, not WB. Check EU 27 scope." },
  { id: 24, prompt: "Unemployment rate in the European Union", category: "eurostat", expectedSource: "eurostat", notes: "Standard Eurostat indicator." },
  { id: 25, prompt: "Renewable energy share in Europe", category: "eurostat", expectedSource: "eurostat", notes: "Energy metric. Eurostat has good coverage here." },
  { id: 26, prompt: "Minimum wage across EU member states", category: "eurostat", expectedSource: "eurostat", notes: "WB has no minimum wage data — Eurostat only." },
  { id: 27, prompt: "Life expectancy in European countries", category: "eurostat", expectedSource: "eurostat|worldbank", notes: "Both have this — check which wins and if scope is correct." },
  { id: 28, prompt: "Inflation rate in the eurozone", category: "eurostat", expectedSource: "eurostat", notes: "Eurozone subset (20 countries). Scope-sensitive." },
  { id: 29, prompt: "Youth unemployment in EU", category: "eurostat", expectedSource: "eurostat", notes: "Age-filtered unemployment. More specific metric." },
  { id: 30, prompt: "Healthcare expenditure in Europe as percentage of GDP", category: "eurostat", expectedSource: "eurostat", notes: "Health spending. Check metric matches request." },

  // ── POI: Overpass amenity queries ────────────────────────────────
  { id: 31, prompt: "Restaurants in Stockholm", category: "poi", expectedSource: "overpass", notes: "Basic POI. Should resolve fast via amenity mapping." },
  { id: 32, prompt: "Parks in Berlin", category: "poi", expectedSource: "overpass", notes: "leisure=park. Known issue: generates choropleth for polygon data." },
  { id: 33, prompt: "Hospitals in London", category: "poi", expectedSource: "overpass", notes: "amenity=hospital. Larger bbox." },
  { id: 34, prompt: "Libraries in Copenhagen", category: "poi", expectedSource: "overpass", notes: "amenity=library. Nordic city." },
  { id: 35, prompt: "Breweries in Munich", category: "poi", expectedSource: "overpass", notes: "craft=brewery or microbrewery. Niche amenity type." },
  { id: 36, prompt: "Schools in Oslo", category: "poi", expectedSource: "overpass", notes: "amenity=school. Norwegian city." },
  { id: 37, prompt: "Museums in Paris", category: "poi", expectedSource: "overpass", notes: "tourism=museum. Tourist-oriented POI." },
  { id: 38, prompt: "Charging stations in Amsterdam", category: "poi", expectedSource: "overpass", notes: "amenity=charging_station. Infrastructure POI." },

  // ── Entity search: web-researchable locations ────────────────────
  { id: 39, prompt: "IKEA stores in Europe", category: "entity-search", expectedSource: "web-research", notes: "Entity search. Check scope — Europe only, not global." },
  { id: 40, prompt: "Taylor Swift Eras Tour cities", category: "entity-search", expectedSource: "web-research", notes: "Hard webscraping. Known difficulty case." },
  { id: 41, prompt: "Michelin 3-star restaurants worldwide", category: "entity-search", expectedSource: "web-research", notes: "Specific entity list. Geocoding needed." },
  { id: 42, prompt: "Formula 1 race circuits", category: "entity-search", expectedSource: "web-research", notes: "Known list of locations. Should be geocodable." },
  { id: 43, prompt: "UNESCO World Heritage sites in Scandinavia", category: "entity-search", expectedSource: "web-research", notes: "Entity + scope filter (Scandinavia)." },
  { id: 44, prompt: "Apple store locations worldwide", category: "entity-search", expectedSource: "web-research", notes: "Commercial entity. May hit Overpass instead." },

  // ── Should-ask: ambiguous, need clarification ────────────────────
  { id: 45, prompt: "Compare Sweden and Norway", category: "should-ask", expectedSource: "should-ask", notes: "No metric. shouldAsk gate should fire." },
  { id: 46, prompt: "Show me data about Europe", category: "should-ask", expectedSource: "should-ask", notes: "Vague — scope but no topic. shouldAsk gate." },
  { id: 47, prompt: "Statistics about Stockholm", category: "should-ask", expectedSource: "should-ask", notes: "City scope, no metric. May bypass shouldAsk (no HAS_SCOPE match for city)." },
  { id: 48, prompt: "Something about Africa", category: "should-ask", expectedSource: "should-ask", notes: "Very vague. VAGUE_PATTERNS should match." },
  { id: 49, prompt: "Nordic countries", category: "should-ask", expectedSource: "should-ask", notes: "Geographic entity, no metric at all." },
  { id: 50, prompt: "How does Finland compare to Estonia", category: "should-ask", expectedSource: "should-ask", notes: "Comparison without metric. shouldAsk?" },
  { id: 51, prompt: "Interesting data about Latin America", category: "should-ask", expectedSource: "should-ask", notes: "Vague + scope. shouldAsk gate." },
  { id: 52, prompt: "Swedish municipalities", category: "should-ask", expectedSource: "should-ask", notes: "Geographic entity, no metric. May match catalog instead." },

  // ── Impossible / should warn ─────────────────────────────────────
  { id: 53, prompt: "Weather forecast for Stockholm next week", category: "impossible", expectedSource: "should-warn", notes: "Real-time future data. Should warn, not resolve." },
  { id: 54, prompt: "Live traffic in Berlin right now", category: "impossible", expectedSource: "should-warn", notes: "Real-time data. No source available." },
  { id: 55, prompt: "Real-time stock prices on a world map", category: "impossible", expectedSource: "should-warn", notes: "Known eval case. May find stock exchange locations instead." },
  { id: 56, prompt: "Predict election results in Sweden 2030", category: "impossible", expectedSource: "should-warn", notes: "Future prediction. Impossible." },
  { id: 57, prompt: "My personal running routes", category: "impossible", expectedSource: "should-warn", notes: "Personal data. No source." },
  { id: 58, prompt: "Satellite imagery of the Amazon rainforest", category: "impossible", expectedSource: "should-warn", notes: "Raster imagery, not vector. Outside Atlas scope." },

  // ── Scope-sensitive: correct filtering matters ───────────────────
  { id: 59, prompt: "GDP in EU countries", category: "scope-sensitive", expectedSource: "eurostat", notes: "EU 27 only. Check: does it return 27 or all European?" },
  { id: 60, prompt: "Population in Nordic countries", category: "scope-sensitive", expectedSource: "worldbank|eurostat", notes: "5 countries (SE,NO,DK,FI,IS). Check featureCount." },
  { id: 61, prompt: "Unemployment in Scandinavia", category: "scope-sensitive", expectedSource: "eurostat|worldbank", notes: "3 countries (SE,NO,DK) vs 5 Nordic. Check scope." },
  { id: 62, prompt: "CO2 emissions in OECD countries", category: "scope-sensitive", expectedSource: "worldbank", notes: "OECD membership (~38). Non-trivial filter." },
  { id: 63, prompt: "Life expectancy in Sub-Saharan Africa", category: "scope-sensitive", expectedSource: "worldbank", notes: "Sub-region. Check: all Africa or just Sub-Saharan?" },
  { id: 64, prompt: "GDP per capita in Southeast Asia", category: "scope-sensitive", expectedSource: "worldbank", notes: "Sub-region of Asia. ~11 countries." },
  { id: 65, prompt: "Fertility rate in the Middle East", category: "scope-sensitive", expectedSource: "worldbank", notes: "Ambiguous region definition. Check scope." },
  { id: 66, prompt: "Crime rate in Western Europe", category: "scope-sensitive", expectedSource: "eurostat|agency-hint", notes: "Sub-region. Crime data may trigger BRÅ agency hint." },
  { id: 67, prompt: "Internet access in developing countries", category: "scope-sensitive", expectedSource: "worldbank", notes: "Classification-based scope. Hard to filter." },
  { id: 68, prompt: "Population density in the Baltics", category: "scope-sensitive", expectedSource: "eurostat|worldbank", notes: "3 countries (EE, LV, LT). Precise scope." },

  // ── Time-sensitive: correct period matters ───────────────────────
  { id: 69, prompt: "Sweden population in 1950", category: "time-sensitive", expectedSource: "worldbank|pxweb-scb", notes: "Historical data point. Check year in data." },
  { id: 70, prompt: "GDP growth rate 2008-2012", category: "time-sensitive", expectedSource: "worldbank", notes: "Financial crisis period. Range query." },
  { id: 71, prompt: "CO2 emissions trend last 30 years", category: "time-sensitive", expectedSource: "worldbank", notes: "Relative time. What year range does it resolve?" },
  { id: 72, prompt: "Befolkning per kommun 2015", category: "time-sensitive", expectedSource: "pxweb-scb", notes: "Specific year. Check Tid dimension selection." },
  { id: 73, prompt: "Latest unemployment data for EU", category: "time-sensitive", expectedSource: "eurostat", notes: "'Latest' qualifier. Check year is recent." },
  { id: 74, prompt: "Median income in Sweden 2010 vs 2020", category: "time-sensitive", expectedSource: "pxweb-scb", notes: "Year comparison. Can clarify handle two time points?" },

  // ── Historical basemaps ──────────────────────────────────────────
  { id: 75, prompt: "Mongol Empire at its peak", category: "historical", expectedSource: "historical-basemaps", notes: "Should snap to 1279. Fast path 0." },
  { id: 76, prompt: "World War 2 borders in Europe", category: "historical", expectedSource: "historical-basemaps", notes: "1938 or 1945. Check which year." },
  { id: 77, prompt: "Cold War era map", category: "historical", expectedSource: "historical-basemaps", notes: "Should snap to 1960." },
  { id: 78, prompt: "Roman Empire", category: "historical", expectedSource: "historical-basemaps", notes: "Should snap to 100." },

  // ── Precedence tests: could match multiple sources ───────────────
  { id: 79, prompt: "Population of European countries", category: "precedence-test", expectedSource: "eurostat|worldbank", notes: "Eurostat vs WB. Which wins? Does scope filter apply?" },
  { id: 80, prompt: "Earthquakes in Japan", category: "precedence-test", expectedSource: "catalog-earthquake", notes: "Catalog earthquake vs Overpass. Catalog should win." },
  { id: 81, prompt: "Income per municipality in Sweden", category: "precedence-test", expectedSource: "pxweb-scb", notes: "PxWeb vs DataCommons. PxWeb should win (finer granularity)." },
  { id: 82, prompt: "Restaurants in Sweden", category: "precedence-test", expectedSource: "overpass", notes: "Country-level Overpass vs entity_search. Large bbox." },
  { id: 83, prompt: "Healthcare in Nordic countries", category: "precedence-test", expectedSource: "pxweb|eurostat|worldbank", notes: "Multiple valid sources. Check which wins." },
  { id: 84, prompt: "Forests in Finland", category: "precedence-test", expectedSource: "pxweb-statfin|worldbank", notes: "PxWeb forestry vs WB forest area vs Overpass nature_reserve." },
];

// ─── Response capture ──────────────────────────────────────

interface ClarifyResult {
  ready?: boolean;
  resolvedPrompt?: string;
  dataUrl?: string;
  dataProfile?: {
    featureCount?: number;
    geometryType?: string;
    bounds?: unknown;
    attributes?: Array<{
      name: string;
      type: string;
      uniqueValues: number;
      nullCount: number;
      min?: number;
      max?: number;
      mean?: number;
      distribution?: string;
      sampleValues?: string[];
    }>;
  };
  resolutionStatus?: string;
  questions?: Array<{ id: string; question: string; options?: string[]; recommended?: string; aspect?: string }>;
  dataWarning?: string;
  suggestions?: string[];
  confidence?: number;
  scopeHint?: { region: string; filterField: string };
  coverageRatio?: number;
  agencyHint?: { agencyName: string; portalUrl: string; countryName: string; coverageTags: string[] };
  error?: string;
}

interface RunResult {
  prompt: BatchPrompt;
  result: ClarifyResult;
  latencyMs: number;
  error?: string;
}

// ─── Source inference ───────────────────────────────────────

function inferSource(r: ClarifyResult): string {
  // No data at all
  if (!r.dataUrl) {
    if (r.agencyHint) return "agency-hint";
    if (r.questions) return "asked-questions";
    if (r.dataWarning && r.suggestions && r.suggestions.length > 0) return "ai-fallback-warn";
    if (r.dataWarning) return "warned";
    return "no-result";
  }

  const url = r.dataUrl;

  // Tabular-only (PxWeb found data but no geometry)
  if (r.resolutionStatus === "tabular_only") return "pxweb-tabular-only";

  // Historical basemaps
  if (url.includes("historical-basemaps") || url.includes("aourednik") || url.includes("world_")) return "historical-basemaps";

  // Overpass POI
  if (url.includes("overpass")) return "overpass";

  // Catalog fast paths
  if (url.includes("earthquake") || url.includes("usgs.gov")) return "catalog-earthquake";
  if (url.includes("eonet")) return "catalog-eonet";
  if (url.includes("tectonic")) return "catalog-tectonic";
  if (url.includes("admin0") || url.includes("world-countries") || url.includes("/geo/countries")) return "catalog-countries";

  // Cached pipeline (WB, Eurostat, PxWeb, web-research, etc.)
  if (url.includes("/geo/cached/")) {
    // Try to distinguish by URL key patterns
    const key = decodeURIComponent(url.split("/geo/cached/")[1] || "");
    if (key.includes("pxweb") || key.includes("scb") || key.includes("ssb") || key.includes("statfin") || key.includes("stat.fi")) return "pxweb";
    if (key.includes("eurostat")) return "eurostat";
    if (key.includes("worldbank") || key.includes("wb-")) return "worldbank";
    if (key.includes("datacommons") || key.includes("dc-")) return "data-commons";
    if (key.includes("web-research") || key.includes("wr-")) return "web-research";
    if (key.includes("web-dataset") || key.includes("wd-")) return "web-dataset-search";
    // Generic cached — inspect profile for clues
    return "cached-unknown";
  }

  // Direct API URLs
  if (url.includes("api.worldbank.org")) return "worldbank";
  if (url.includes("ec.europa.eu")) return "eurostat";
  if (url.includes("restcountries")) return "restcountries";

  return "unknown";
}

/** Classify the outcome for grouping. */
function classifyOutcome(r: ClarifyResult): string {
  if (r.error) return "error";
  if (r.agencyHint) return "agency_hint";
  if (!r.ready && r.questions) return "should_ask";
  if (r.resolutionStatus === "tabular_only") return "tabular_only";
  if (r.ready && r.dataUrl) return "ready";
  if (!r.ready && r.dataWarning) return "not_ready_warn";
  if (!r.ready && r.suggestions && r.suggestions.length > 0) return "not_ready_suggestions";
  return "not_ready";
}

// ─── Runner ────────────────────────────────────────────────

async function runPrompt(p: BatchPrompt): Promise<RunResult> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    const res = await fetch(`${BASE}/api/ai/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Atlas-Eval": "1" },
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
  console.log(`ATLAS CLARIFY BATCH EVALUATION — ${PROMPTS.length} PROMPTS`);
  console.log(`${"=".repeat(80)}\n`);

  const results: RunResult[] = [];
  const queue = [...PROMPTS];

  async function processNext() {
    while (queue.length > 0) {
      const p = queue.shift()!;
      const r = await runPrompt(p);
      results.push(r);

      const outcome = classifyOutcome(r.result);
      const source = inferSource(r.result);
      const fc = r.result.dataProfile?.featureCount;
      const fcStr = fc !== undefined ? `fc=${fc}` : "";
      console.log(
        `[${String(r.prompt.id).padStart(2)}] ${outcome.padEnd(18)} ${r.latencyMs.toString().padStart(6)}ms  ${source.padEnd(22)} ${fcStr.padEnd(8)} ${r.prompt.prompt}`,
      );
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < CONCURRENCY; i++) workers.push(processNext());
  await Promise.all(workers);

  results.sort((a, b) => a.prompt.id - b.prompt.id);

  // ── Build JSON output ────────────────────────────────────
  const output = results.map((r) => ({
    id: r.prompt.id,
    prompt: r.prompt.prompt,
    category: r.prompt.category,
    expectedSource: r.prompt.expectedSource,
    notes: r.prompt.notes,

    // Result
    outcome: classifyOutcome(r.result),
    latencyMs: r.latencyMs,
    error: r.error || null,

    // Core fields
    ready: r.result.ready ?? false,
    resolutionStatus: r.result.resolutionStatus ?? null,
    resolvedPrompt: r.result.resolvedPrompt ?? null,
    dataUrl: r.result.dataUrl ?? null,
    inferredSource: inferSource(r.result),

    // Questions / warnings
    hasQuestions: !!r.result.questions,
    questions: r.result.questions ?? null,
    dataWarning: r.result.dataWarning ?? null,
    suggestions: r.result.suggestions ?? null,

    // Scope / join signals
    scopeHint: r.result.scopeHint ?? null,
    confidence: r.result.confidence ?? null,
    coverageRatio: r.result.coverageRatio ?? null,

    // Agency hint
    agencyHint: r.result.agencyHint ?? null,

    // Data profile (condensed)
    featureCount: r.result.dataProfile?.featureCount ?? null,
    geometryType: r.result.dataProfile?.geometryType ?? null,
    attributes: r.result.dataProfile?.attributes?.map((a) => ({
      name: a.name,
      type: a.type,
      uniqueValues: a.uniqueValues,
      nullCount: a.nullCount,
      min: a.min,
      max: a.max,
      sampleValues: a.sampleValues?.slice(0, 3),
    })) ?? null,
  }));

  const fs = await import("fs");
  const outPath = "apps/web/test-data/eval-clarify-batch.json";
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));
  console.log(`\nDetailed results → ${outPath}`);

  // ── Summary by outcome ───────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("OUTCOME SUMMARY");
  console.log("=".repeat(70));

  const outcomes: Record<string, RunResult[]> = {};
  for (const r of results) {
    const o = classifyOutcome(r.result);
    (outcomes[o] ??= []).push(r);
  }
  for (const [outcome, items] of Object.entries(outcomes).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${outcome.padEnd(22)} ${items.length}`);
  }

  // ── Source distribution ──────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("SOURCE DISTRIBUTION");
  console.log("=".repeat(70));

  const sources: Record<string, number> = {};
  for (const r of results) {
    const s = inferSource(r.result);
    sources[s] = (sources[s] || 0) + 1;
  }
  for (const [s, n] of Object.entries(sources).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${s.padEnd(22)} ${n}`);
  }

  // ── Latency stats ────────────────────────────────────────
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  console.log(`\n${"=".repeat(70)}`);
  console.log("LATENCY");
  console.log("=".repeat(70));
  console.log(`  Mean:    ${Math.round(latencies.reduce((s, l) => s + l, 0) / latencies.length)}ms`);
  console.log(`  Median:  ${latencies[Math.floor(latencies.length / 2)]}ms`);
  console.log(`  p95:     ${latencies[Math.floor(latencies.length * 0.95)]}ms`);
  console.log(`  Max:     ${latencies[latencies.length - 1]}ms`);

  // ── Category breakdown ───────────────────────────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("CATEGORY BREAKDOWN");
  console.log("=".repeat(70));

  const categories = Array.from(new Set(PROMPTS.map((p) => p.category)));
  for (const cat of categories) {
    const catResults = results.filter((r) => r.prompt.category === cat);
    const ready = catResults.filter((r) => r.result.ready).length;
    const asked = catResults.filter((r) => !r.result.ready && r.result.questions).length;
    const tabular = catResults.filter((r) => r.result.resolutionStatus === "tabular_only").length;
    const agency = catResults.filter((r) => !!r.result.agencyHint).length;
    const errors = catResults.filter((r) => !!r.error).length;
    const avgLat = Math.round(catResults.reduce((s, r) => s + r.latencyMs, 0) / catResults.length);

    console.log(`\n  ${cat} (${catResults.length} prompts, avg ${avgLat}ms):`);
    console.log(`    ready=${ready}  asked=${asked}  tabular=${tabular}  agency=${agency}  error=${errors}`);

    // Show source distribution within category
    const catSources: Record<string, number> = {};
    for (const r of catResults) {
      const s = inferSource(r.result);
      catSources[s] = (catSources[s] || 0) + 1;
    }
    const srcLine = Object.entries(catSources)
      .sort((a, b) => b[1] - a[1])
      .map(([s, n]) => `${s}:${n}`)
      .join("  ");
    console.log(`    sources: ${srcLine}`);
  }

  // ── Pattern analysis: potential error classes ────────────
  console.log(`\n${"=".repeat(70)}`);
  console.log("POTENTIAL ERROR PATTERNS (for manual review)");
  console.log("=".repeat(70));

  // 1. Prompts that should ask but didn't (got ready instead)
  const shouldAskButReady = results.filter(
    (r) => r.prompt.category === "should-ask" && r.result.ready,
  );
  if (shouldAskButReady.length > 0) {
    console.log(`\n  [!] SHOULD-ASK but got ready (${shouldAskButReady.length}):`);
    for (const r of shouldAskButReady) {
      console.log(`      #${r.prompt.id} "${r.prompt.prompt}" → ${inferSource(r.result)}`);
    }
  }

  // 2. Prompts that should be impossible but resolved
  const impossibleButReady = results.filter(
    (r) => r.prompt.category === "impossible" && r.result.ready,
  );
  if (impossibleButReady.length > 0) {
    console.log(`\n  [!] IMPOSSIBLE but got ready (${impossibleButReady.length}):`);
    for (const r of impossibleButReady) {
      console.log(`      #${r.prompt.id} "${r.prompt.prompt}" → ${inferSource(r.result)}, fc=${r.result.dataProfile?.featureCount}`);
    }
  }

  // 3. Prompts that got questions but should have resolved
  const clearButAsked = results.filter(
    (r) =>
      ["global-stats", "pxweb-nordic", "eurostat", "poi", "historical"].includes(r.prompt.category) &&
      !r.result.ready && r.result.questions,
  );
  if (clearButAsked.length > 0) {
    console.log(`\n  [!] CLEAR prompt but got questions (${clearButAsked.length}):`);
    for (const r of clearButAsked) {
      console.log(`      #${r.prompt.id} "${r.prompt.prompt}" [${r.prompt.category}]`);
    }
  }

  // 4. Agency hint catches (data exists but no adapter)
  const agencyHints = results.filter((r) => !!r.result.agencyHint);
  if (agencyHints.length > 0) {
    console.log(`\n  [i] AGENCY HINT fired (${agencyHints.length}):`);
    for (const r of agencyHints) {
      console.log(`      #${r.prompt.id} "${r.prompt.prompt}" → ${r.result.agencyHint!.agencyName} (${r.result.agencyHint!.portalUrl})`);
    }
  }

  // 5. Tabular-only (PxWeb data but no geometry join)
  const tabularOnly = results.filter((r) => r.result.resolutionStatus === "tabular_only");
  if (tabularOnly.length > 0) {
    console.log(`\n  [i] TABULAR-ONLY (${tabularOnly.length}):`);
    for (const r of tabularOnly) {
      console.log(`      #${r.prompt.id} "${r.prompt.prompt}" → ${inferSource(r.result)}`);
    }
  }

  // 6. Very slow resolutions (>30s)
  const slow = results.filter((r) => r.latencyMs > 30_000);
  if (slow.length > 0) {
    console.log(`\n  [i] SLOW >30s (${slow.length}):`);
    for (const r of slow) {
      console.log(`      #${r.prompt.id} "${r.prompt.prompt}" → ${r.latencyMs}ms ${inferSource(r.result)}`);
    }
  }

  // 7. Low feature count (data found but possibly wrong)
  const lowFc = results.filter(
    (r) => r.result.ready && r.result.dataProfile?.featureCount !== undefined && r.result.dataProfile.featureCount < 5,
  );
  if (lowFc.length > 0) {
    console.log(`\n  [!] LOW FEATURE COUNT <5 (${lowFc.length}):`);
    for (const r of lowFc) {
      console.log(`      #${r.prompt.id} "${r.prompt.prompt}" → fc=${r.result.dataProfile!.featureCount} ${inferSource(r.result)}`);
    }
  }

  // 8. Scope-sensitive prompts — check if featureCount looks plausible
  const scopeResults = results.filter((r) => r.prompt.category === "scope-sensitive" && r.result.ready);
  if (scopeResults.length > 0) {
    console.log(`\n  [?] SCOPE-SENSITIVE results (review featureCount):`);
    for (const r of scopeResults) {
      const fc = r.result.dataProfile?.featureCount ?? "?";
      const scope = r.result.scopeHint ? `scope=${r.result.scopeHint.region}` : "no-scopeHint";
      console.log(`      #${r.prompt.id} "${r.prompt.prompt}" → fc=${fc} ${scope} ${inferSource(r.result)}`);
    }
  }

  // 9. Errors and timeouts
  const errorResults = results.filter((r) => !!r.error);
  if (errorResults.length > 0) {
    console.log(`\n  [X] ERRORS (${errorResults.length}):`);
    for (const r of errorResults) {
      console.log(`      #${r.prompt.id} "${r.prompt.prompt}" → ${r.error!.slice(0, 80)}`);
    }
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Done. Review ${outPath} for full details.`);
  console.log("=".repeat(70));
}

runBatch().catch((e) => {
  console.error("Batch eval failed:", e);
  process.exit(1);
});
