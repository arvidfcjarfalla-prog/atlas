/**
 * Atlas AI Evaluation Runner
 *
 * Two modes:
 *   --offline   Validate + compile + score pre-built fixture manifests (deterministic, no API key)
 *   --online    Generate manifests from prompts via the AI API, then validate + compile + score
 *
 * Usage:
 *   npx tsx scripts/eval-runner.ts --offline
 *   npx tsx scripts/eval-runner.ts --online --base-url http://localhost:3000
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// Resolve paths relative to this script
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webRoot = resolve(__dirname, "..");

// Direct imports of pure functions (no Next.js dependency)
import { validateManifest } from "../lib/ai/validators/index.js";
import { scoreManifest } from "../lib/ai/quality-scorer.js";
// Import directly from source to avoid MapLibre CSS import through barrel
import { compileLayer } from "../../../packages/map-core/src/manifest-compiler.js";
import { profileDataset } from "../lib/ai/profiler.js";
import type { MapManifest, MapFamily, ManifestValidation } from "@atlas/data-models";
import type { DatasetProfile } from "../lib/ai/types.js";
import type { QualityScore } from "../lib/ai/quality-scorer.js";

// ─── Types ───────────────────────────────────────────────────

interface EvalFixture {
  id: string;
  label: string;
  expectedScore: number;
  manifest: MapManifest;
  geojson: GeoJSON.FeatureCollection;
}

interface EvalPrompt {
  id: string;
  prompt: string;
  expectedFamily?: MapFamily;
}

interface EvalResult {
  id: string;
  label: string;
  pass: boolean;
  manifest?: MapManifest;
  validation: ManifestValidation;
  qualityScore?: QualityScore;
  compileSuccess: boolean;
  compileError?: string;
  error?: string;
}

interface EvalReport {
  mode: "offline" | "online";
  timestamp: string;
  total: number;
  passed: number;
  failed: number;
  avgQualityScore: number;
  results: EvalResult[];
}

// ─── Offline mode ────────────────────────────────────────────

function runOffline(): EvalReport {
  const fixturesPath = resolve(webRoot, "test-data/eval-fixtures.json");
  const raw = readFileSync(fixturesPath, "utf-8");
  const fixtures: EvalFixture[] = JSON.parse(raw);

  const results: EvalResult[] = [];

  for (const fixture of fixtures) {
    const result = evaluateManifest(
      fixture.id,
      fixture.label,
      fixture.manifest,
      fixture.geojson,
    );
    results.push(result);
  }

  return buildReport("offline", results);
}

// ─── Online mode ─────────────────────────────────────────────

async function runOnline(baseUrl: string): Promise<EvalReport> {
  const promptsPath = resolve(webRoot, "test-data/eval-prompts.json");
  const raw = readFileSync(promptsPath, "utf-8");
  const prompts: EvalPrompt[] = JSON.parse(raw);

  const results: EvalResult[] = [];

  for (const prompt of prompts) {
    console.log(`  Generating: ${prompt.id}...`);
    try {
      const res = await fetch(`${baseUrl}/api/ai/generate-map`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.prompt }),
      });

      if (!res.ok) {
        results.push({
          id: prompt.id,
          label: prompt.prompt.slice(0, 60),
          pass: false,
          validation: { valid: false, errors: [`API returned ${res.status}`], warnings: [] },
          compileSuccess: false,
          error: `HTTP ${res.status}: ${await res.text().catch(() => "unknown")}`,
        });
        continue;
      }

      const data = await res.json();
      const manifest = data.manifest as MapManifest;

      if (!manifest) {
        results.push({
          id: prompt.id,
          label: prompt.prompt.slice(0, 60),
          pass: false,
          validation: { valid: false, errors: ["No manifest in response"], warnings: [] },
          compileSuccess: false,
          error: "No manifest returned from API",
        });
        continue;
      }

      // Check expected family
      const family = manifest.layers?.[0]?.style?.mapFamily;
      let familyMatch = true;
      if (prompt.expectedFamily && family !== prompt.expectedFamily) {
        familyMatch = false;
      }

      const result = evaluateManifest(
        prompt.id,
        prompt.prompt.slice(0, 60),
        manifest,
        undefined,
      );

      if (!familyMatch) {
        result.pass = false;
        result.validation.warnings.push(
          `Expected family "${prompt.expectedFamily}" but got "${family}"`,
        );
      }

      results.push(result);
    } catch (err) {
      results.push({
        id: prompt.id,
        label: prompt.prompt.slice(0, 60),
        pass: false,
        validation: { valid: false, errors: [String(err)], warnings: [] },
        compileSuccess: false,
        error: String(err),
      });
    }
  }

  return buildReport("online", results);
}

// ─── Shared evaluation logic ─────────────────────────────────

function evaluateManifest(
  id: string,
  label: string,
  manifest: MapManifest,
  geojson?: GeoJSON.FeatureCollection,
): EvalResult {
  // 1. Profile (if data available)
  let profile: DatasetProfile | undefined;
  if (geojson) {
    profile = profileDataset(geojson);
  }

  // 2. Validate (with profile for field-reference checks)
  const validation = validateManifest(manifest, profile);

  // 3. Score
  const qualityScore = scoreManifest(manifest, profile);

  // 4. Compile (if validation passed and data available)
  let compileSuccess = false;
  let compileError: string | undefined;

  if (validation.valid && manifest.layers?.[0] && geojson) {
    try {
      compileLayer(manifest.layers[0], geojson);
      compileSuccess = true;
    } catch (err) {
      compileError = String(err);
    }
  } else if (validation.valid && !geojson) {
    // No data to compile against — skip compilation, count as success
    compileSuccess = true;
  }

  const pass = validation.valid && compileSuccess;

  return {
    id,
    label,
    pass,
    manifest,
    validation,
    qualityScore,
    compileSuccess,
    compileError,
  };
}

function buildReport(mode: "offline" | "online", results: EvalResult[]): EvalReport {
  const passed = results.filter((r) => r.pass).length;
  const scores = results
    .filter((r) => r.qualityScore)
    .map((r) => r.qualityScore!.total);
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    : 0;

  return {
    mode,
    timestamp: new Date().toISOString(),
    total: results.length,
    passed,
    failed: results.length - passed,
    avgQualityScore: avgScore,
    results,
  };
}

// ─── Console output ──────────────────────────────────────────

function printReport(report: EvalReport): void {
  console.log("\n" + "═".repeat(70));
  console.log(`  Atlas Eval Report — ${report.mode} mode`);
  console.log(`  ${report.timestamp}`);
  console.log("═".repeat(70));
  console.log(`  Total: ${report.total}  Passed: ${report.passed}  Failed: ${report.failed}`);
  console.log(`  Avg Quality Score: ${report.avgQualityScore}/100`);
  console.log("─".repeat(70));

  for (const r of report.results) {
    const icon = r.pass ? "PASS" : "FAIL";
    const score = r.qualityScore ? ` [${r.qualityScore.total}/100]` : "";
    console.log(`  ${icon}  ${r.id}${score}`);
    if (!r.pass) {
      for (const e of r.validation.errors) {
        console.log(`       ERROR: ${e}`);
      }
      if (r.compileError) {
        console.log(`       COMPILE: ${r.compileError}`);
      }
      if (r.error) {
        console.log(`       ${r.error}`);
      }
    }
    if (r.validation.warnings.length > 0) {
      for (const w of r.validation.warnings) {
        console.log(`       WARN: ${w}`);
      }
    }
    if (r.qualityScore && r.qualityScore.deductions.length > 0) {
      for (const d of r.qualityScore.deductions) {
        console.log(`       -${d}`);
      }
    }
  }

  console.log("═".repeat(70) + "\n");
}

// ─── CLI entry point ─────────────────────────────────────────

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const isOnline = args.includes("--online");
  const baseUrlIdx = args.indexOf("--base-url");
  const baseUrl = baseUrlIdx >= 0 ? args[baseUrlIdx + 1] : "http://localhost:3000";

  console.log(`\nAtlas Eval Runner — ${isOnline ? "online" : "offline"} mode\n`);

  let report: EvalReport;

  if (isOnline) {
    console.log(`  Base URL: ${baseUrl}`);
    report = await runOnline(baseUrl);
  } else {
    report = runOffline();
  }

  printReport(report);

  // Write JSON report
  const reportPath = resolve(webRoot, "test-data/eval-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`  Report saved to: ${reportPath}\n`);

  // Exit code
  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
