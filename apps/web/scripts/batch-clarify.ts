/**
 * Batch clarify test runner.
 *
 * Sends prompts to the /api/ai/clarify endpoint and reports
 * resolution success/failure. Tests the full data pipeline
 * (intent extraction, PxWeb, Eurostat, Data Commons, World Bank,
 * catalog matching, Overpass) WITHOUT hitting the expensive
 * Sonnet generation step.
 *
 * Usage: npx tsx scripts/batch-clarify.ts
 * Requires: dev server running on localhost:3000
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3000";

interface ClarifyResult {
  ready?: boolean;
  resolvedPrompt?: string;
  dataUrl?: string;
  dataProfile?: { featureCount?: number; geometryType?: string };
  resolutionStatus?: string;
  questions?: unknown[];
  dataWarning?: string;
  error?: string;
}

interface TestResult {
  prompt: string;
  status: "pass" | "fail" | "partial" | "error";
  detail: string;
  ms: number;
}

// ─── Test prompts ────────────────────────────────────────────
// Diverse set: multiple languages, data sources, map types

const PROMPTS: string[] = [
  // === Swedish prompts ===
  "befolkning per kommun i Sverige",
  "medelinkomst per län i Sverige",
  "arbetslöshet i norska kommuner",
  "BNP per capita i Europa",
  "minimilön i EU-länder",
  "förväntad livslängd per land",
  "CO2-utsläpp per land",
  "kaféer i Stockholm",
  "restauranger i Göteborg",
  "parker i Malmö",
  "romarrikets utbredning",
  "mongoliska rikets gränser",
  "världen under andra världskriget",
  "brittiska imperiet 1920",
  "napoleonkrigen i Europa",
  "vikingatidens gränser",
  "jordbävningar senaste veckan",
  "aktiva vulkaner i världen",
  "världens länder efter befolkning",
  "fattigdom i europeiska länder",

  // === English prompts ===
  "GDP per capita by country",
  "unemployment rate in Europe",
  "life expectancy world map",
  "population density by country",
  "CO2 emissions per capita",
  "renewable energy share in EU",
  "internet usage by country",
  "fertility rate by country",
  "median income in European countries",
  "Gini coefficient Europe",
  "healthcare spending as % of GDP",
  "education spending by country in EU",
  "house price index Europe",
  "inflation rate EU countries",
  "greenhouse gas emissions Europe",
  "tourism nights spent EU",
  "poverty rate in EU",
  "world countries map",
  "earthquakes last week",
  "active wildfires",
  "volcanoes worldwide",
  "restaurants in Paris",
  "cafes in Berlin",
  "parks in London",
  "museums in Rome",
  "hospitals in Tokyo",
  "schools in Barcelona",
  "Roman Empire at its peak",
  "Ottoman Empire 1700",
  "Cold War era world map",
  "World War 2 borders",
  "British Empire extent",
  "Mongol Empire 1279",
  "Medieval Europe borders",

  // === Norwegian prompts ===
  "arbeidsledighet per kommune i Norge",
  "befolkning per fylke i Norge",
  "inntekt per kommune i Norge",

  // === German prompts ===
  "Arbeitslosenquote in Europa",
  "BIP pro Kopf weltweit",
  "Lebenserwartung nach Land",

  // === French prompts ===
  "taux de chômage en Europe",
  "PIB par habitant mondial",
  "espérance de vie par pays",

  // === Spanish prompts ===
  "tasa de desempleo en Europa",
  "PIB per cápita mundial",
  "esperanza de vida por país",

  // === Mixed/edge cases ===
  "show me a map of Sweden",
  "countries by area",
  "world population 2024",
  "African countries GDP",
  "Asian countries by population",
  "Nordic countries comparison",
  "capitals of the world",
  "EU member states",
  "bicycle parking in Copenhagen",
  "pharmacies in Amsterdam",
  "ancient world 200 AD",
  "Persian Empire",
  "Aztec Empire territory",
  "Byzantine Empire borders",
  "deforestation worldwide",
  "forest area by country",
  "urban population percentage",
  "infant mortality rate by country",
  "literacy rate by country",
  "homicide rate in Europe",
  "Swedish municipalities by income",
  "Norwegian counties unemployment",
  "befolkningstäthet per kommun",
  "svenska kommuner efter ålder",
  "median income USA states",
  "crime rate by US state",
  "hospitals in New York",
  "bars in San Francisco",
];

// ─── Runner ─────────────────────────────────────────────────

async function testPrompt(prompt: string): Promise<TestResult> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/ai/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(30_000),
    });

    const ms = Date.now() - start;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { prompt, status: "error", detail: `HTTP ${res.status}: ${text.slice(0, 100)}`, ms };
    }

    const data = (await res.json()) as ClarifyResult;

    if (data.error) {
      return { prompt, status: "error", detail: data.error, ms };
    }

    if (data.ready && data.dataUrl) {
      const geo = data.dataProfile?.geometryType ?? "?";
      const count = data.dataProfile?.featureCount ?? "?";
      return {
        prompt,
        status: "pass",
        detail: `${geo} × ${count} → ${data.dataUrl.slice(0, 60)}`,
        ms,
      };
    }

    if (data.resolutionStatus === "tabular_only") {
      return {
        prompt,
        status: "partial",
        detail: `tabular_only: ${data.resolvedPrompt?.slice(0, 50) ?? "?"}`,
        ms,
      };
    }

    if (data.questions && data.questions.length > 0) {
      return {
        prompt,
        status: "fail",
        detail: `asked questions (not resolved)`,
        ms,
      };
    }

    return {
      prompt,
      status: "fail",
      detail: data.dataWarning ?? "no data resolved",
      ms,
    };
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : "unknown";
    return { prompt, status: "error", detail: msg, ms };
  }
}

async function main() {
  console.log(`\n🗺️  Batch clarify test — ${PROMPTS.length} prompts\n`);
  console.log(`   Server: ${BASE_URL}`);
  console.log(`   Model:  ${process.env.AI_UTILITY_MODEL ?? "anthropic (default)"}\n`);

  // Check server is up (use a catalog-matching prompt for fast response)
  try {
    const check = await fetch(`${BASE_URL}/api/ai/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "earthquakes" }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!check.ok) throw new Error(`HTTP ${check.status}`);
  } catch (e) {
    console.error("❌ Dev server not reachable at", BASE_URL);
    console.error("  ", e instanceof Error ? e.message : "unknown error");
    console.error("   Run: pnpm dev");
    process.exit(1);
  }

  const results: TestResult[] = [];
  const CONCURRENCY = 3;

  // Process in batches to avoid overwhelming the server
  for (let i = 0; i < PROMPTS.length; i += CONCURRENCY) {
    const batch = PROMPTS.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(batch.map(testPrompt));

    for (const r of batchResults) {
      results.push(r);
      const icon = r.status === "pass" ? "✅" : r.status === "partial" ? "🟡" : r.status === "fail" ? "❌" : "💥";
      const idx = String(results.length).padStart(3);
      const ms = String(r.ms).padStart(5);
      console.log(`${idx}. ${icon} [${ms}ms] ${r.prompt}`);
      if (r.status !== "pass") {
        console.log(`         → ${r.detail}`);
      }
    }
  }

  // Summary
  const pass = results.filter((r) => r.status === "pass").length;
  const partial = results.filter((r) => r.status === "partial").length;
  const fail = results.filter((r) => r.status === "fail").length;
  const error = results.filter((r) => r.status === "error").length;
  const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);

  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results: ${pass}/${PROMPTS.length} pass, ${partial} partial, ${fail} fail, ${error} error`);
  console.log(`Average latency: ${avgMs}ms`);
  console.log(`Pass rate: ${((pass / PROMPTS.length) * 100).toFixed(1)}%`);
  console.log(`Pass+partial rate: ${(((pass + partial) / PROMPTS.length) * 100).toFixed(1)}%`);

  if (fail + error > 0) {
    console.log(`\nFailed prompts:`);
    for (const r of results.filter((r) => r.status === "fail" || r.status === "error")) {
      console.log(`  - "${r.prompt}" → ${r.detail}`);
    }
  }

  // Write JSON report
  const report = {
    timestamp: new Date().toISOString(),
    model: process.env.AI_UTILITY_MODEL ?? "anthropic",
    total: PROMPTS.length,
    pass,
    partial,
    fail,
    error,
    avgMs,
    results,
  };
  const fs = await import("fs/promises");
  await fs.writeFile(
    "test-data/batch-clarify-report.json",
    JSON.stringify(report, null, 2),
  );
  console.log(`\nReport saved to test-data/batch-clarify-report.json`);
}

main().catch(console.error);
