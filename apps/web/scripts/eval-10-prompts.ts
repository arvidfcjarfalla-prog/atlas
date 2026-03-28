/**
 * Quick eval: 10 diverse prompts through the full pipeline.
 * Tests clarify → generate-map → validates manifest.
 *
 * Run: export $(grep -v '^#' .env.local | xargs) && npx tsx scripts/eval-10-prompts.ts
 */

const BASE = "http://localhost:3000";

interface EvalResult {
  prompt: string;
  clarifyOk: boolean;
  clarifySource: string;
  clarifyMs: number;
  generateOk: boolean;
  generateMs: number;
  mapFamily: string;
  featureCount: number;
  colorField: string;
  filterApplied: boolean;
  qualityScore: number;
  errors: string[];
  title: string;
}

const PROMPTS = [
  "GDP per capita in Europe",
  "Population density in Africa",
  "Unemployment rate in Sweden by municipality",
  "CO2 emissions per capita worldwide",
  "Restaurants in Stockholm",
  "Life expectancy in Asia",
  "Crime rate in the United States by state",
  "Renewable energy share in EU countries",
  "Average temperature by country",
  "Median income in Norway by county",
];

async function evalPrompt(prompt: string): Promise<EvalResult> {
  const result: EvalResult = {
    prompt,
    clarifyOk: false,
    clarifySource: "",
    clarifyMs: 0,
    generateOk: false,
    generateMs: 0,
    mapFamily: "",
    featureCount: 0,
    colorField: "",
    filterApplied: false,
    qualityScore: 0,
    errors: [],
    title: "",
  };

  // Step 1: Clarify
  const t0 = Date.now();
  try {
    const clarifyRes = await fetch(`${BASE}/api/ai/clarify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(120_000),
    });
    result.clarifyMs = Date.now() - t0;

    if (!clarifyRes.ok) {
      result.errors.push(`clarify HTTP ${clarifyRes.status}`);
      return result;
    }

    const clarifyData = await clarifyRes.json();

    if (!clarifyData.ready) {
      result.errors.push("clarify not ready");
      if (clarifyData.questions) {
        result.errors.push(`questions: ${clarifyData.questions.map((q: { question: string }) => q.question).join("; ")}`);
      }
      return result;
    }

    result.clarifyOk = true;
    result.clarifySource = clarifyData.dataUrl?.includes("cached/")
      ? "cached"
      : clarifyData.dataUrl ?? "none";

    // Check feature count from profile
    if (clarifyData.dataProfile) {
      result.featureCount = clarifyData.dataProfile.featureCount ?? 0;
    }

    // Step 2: Generate map
    const t1 = Date.now();
    const genRes = await fetch(`${BASE}/api/ai/generate-map`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        ...(clarifyData.dataUrl ? { sourceUrl: clarifyData.dataUrl, dataUrl: clarifyData.dataUrl } : {}),
        ...(clarifyData.dataProfile ? { dataProfile: clarifyData.dataProfile } : {}),
        ...(clarifyData.scopeHint ? { scopeHint: clarifyData.scopeHint } : {}),
      }),
      signal: AbortSignal.timeout(60_000),
    });
    result.generateMs = Date.now() - t1;

    if (!genRes.ok) {
      result.errors.push(`generate HTTP ${genRes.status}`);
      return result;
    }

    const genData = await genRes.json();
    const manifest = genData.manifest;

    if (!manifest) {
      result.errors.push("no manifest returned");
      return result;
    }

    result.generateOk = true;
    result.title = manifest.title ?? "";
    result.qualityScore = genData.quality?.total ?? 0;

    const layer = manifest.layers?.[0];
    if (layer) {
      result.mapFamily = layer.style?.mapFamily ?? "";
      result.colorField = layer.style?.colorField ?? "";
      result.filterApplied = !!layer.filter;
    }

    // Check for validation errors
    if (genData.validation?.errors?.length > 0) {
      result.errors.push(...genData.validation.errors);
    }

  } catch (err) {
    result.errors.push(`exception: ${(err as Error).message}`);
  }

  return result;
}

async function main() {
  console.log("Running 10-prompt eval against localhost:3000...\n");

  const results: EvalResult[] = [];

  for (let i = 0; i < PROMPTS.length; i++) {
    const prompt = PROMPTS[i];
    process.stdout.write(`[${i + 1}/10] "${prompt.slice(0, 50)}" ... `);
    const result = await evalPrompt(prompt);
    results.push(result);

    const status = result.generateOk ? "✓" : result.clarifyOk ? "⚠ gen fail" : "✗ clarify fail";
    console.log(`${status} (${result.clarifyMs + result.generateMs}ms)`);
  }

  // Summary table
  console.log("\n" + "═".repeat(120));
  console.log("RESULTS");
  console.log("═".repeat(120));

  const header = [
    "Prompt".padEnd(40),
    "Clarify".padEnd(8),
    "Gen".padEnd(5),
    "Family".padEnd(18),
    "Features".padEnd(10),
    "Color Field".padEnd(20),
    "Filter".padEnd(7),
    "Score".padEnd(6),
    "Time".padEnd(8),
    "Errors",
  ].join(" │ ");
  console.log(header);
  console.log("─".repeat(120));

  let passed = 0;
  let totalMs = 0;

  for (const r of results) {
    const time = r.clarifyMs + r.generateMs;
    totalMs += time;
    if (r.generateOk && r.errors.length === 0) passed++;

    const row = [
      r.prompt.slice(0, 40).padEnd(40),
      (r.clarifyOk ? "✓" : "✗").padEnd(8),
      (r.generateOk ? "✓" : "✗").padEnd(5),
      r.mapFamily.padEnd(18),
      String(r.featureCount).padEnd(10),
      (r.colorField || "—").slice(0, 20).padEnd(20),
      (r.filterApplied ? "YES" : "—").padEnd(7),
      String(r.qualityScore).padEnd(6),
      `${(time / 1000).toFixed(1)}s`.padEnd(8),
      r.errors.length > 0 ? r.errors[0].slice(0, 30) : "—",
    ].join(" │ ");
    console.log(row);
  }

  console.log("─".repeat(120));
  console.log(`\nPassed: ${passed}/10 | Avg time: ${(totalMs / results.length / 1000).toFixed(1)}s`);

  // Detailed errors
  const withErrors = results.filter((r) => r.errors.length > 0);
  if (withErrors.length > 0) {
    console.log("\n" + "═".repeat(60));
    console.log("ERRORS");
    console.log("═".repeat(60));
    for (const r of withErrors) {
      console.log(`\n"${r.prompt}":`);
      for (const e of r.errors) {
        console.log(`  - ${e}`);
      }
    }
  }
}

main().catch(console.error);
