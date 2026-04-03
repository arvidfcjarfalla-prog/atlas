/**
 * Re-run only the failed prompts from eval-clarify-batch.json and merge results back.
 * Usage: npx tsx apps/web/scripts/eval-clarify-rerun.ts
 */

import * as fs from "fs";
import * as path from "path";

const BASE = "http://127.0.0.1:3000";
const TIMEOUT = 60_000;
const CONCURRENCY = 2;
const RESULTS_PATH = path.resolve("apps/web/test-data/eval-clarify-batch.json");

// Import types and helpers from the batch script
type Category = "global-stats" | "pxweb-nordic" | "eurostat" | "poi" | "entity-search" | "should-ask" | "impossible" | "scope-sensitive" | "time-sensitive" | "historical" | "precedence-test";

interface BatchPrompt {
  id: number;
  prompt: string;
  category: Category;
  expectedSource: string;
  notes: string;
}

interface ClarifyResult {
  ready?: boolean;
  resolvedPrompt?: string;
  dataUrl?: string;
  dataProfile?: {
    featureCount?: number;
    geometryType?: string;
    attributes?: Array<{
      name: string; type: string; uniqueValues: number; nullCount: number;
      min?: number; max?: number; sampleValues?: string[];
    }>;
  };
  resolutionStatus?: string;
  questions?: Array<{ id: string; question: string; options?: string[]; aspect?: string }>;
  dataWarning?: string;
  suggestions?: string[];
  confidence?: number;
  scopeHint?: { region: string; filterField: string };
  coverageRatio?: number;
  agencyHint?: { agencyName: string; portalUrl: string; countryName: string; coverageTags: string[] };
}

function inferSource(r: ClarifyResult): string {
  if (!r.dataUrl) {
    if (r.agencyHint) return "agency-hint";
    if (r.questions) return "asked-questions";
    if (r.dataWarning && r.suggestions && r.suggestions.length > 0) return "ai-fallback-warn";
    if (r.dataWarning) return "warned";
    return "no-result";
  }
  const url = r.dataUrl;
  if (r.resolutionStatus === "tabular_only") return "pxweb-tabular-only";
  if (url.includes("/pxweb-")) return "pxweb";
  if (url.includes("/eurostat-")) return "eurostat";
  if (url.includes("/worldbank-")) return "worldbank";
  if (url.includes("/overpass")) return "overpass";
  if (url.includes("historical-basemaps")) return "historical-basemaps";
  if (url.includes("/world-countries")) return "catalog-countries";
  if (url.includes("/earthquakes")) return "catalog-earthquake";
  if (url.includes("/heritage")) return "unknown";
  if (url.includes("/web-")) return "cached-unknown";
  return "unknown";
}

function classifyOutcome(r: ClarifyResult): string {
  if (!r.ready && r.questions) return "should_ask";
  if (r.resolutionStatus === "tabular_only") return "tabular_only";
  if (r.ready) return "ready";
  if (r.agencyHint) return "agency_hint";
  if (r.dataWarning) return "not_ready_warn";
  return "error";
}

async function runPrompt(p: BatchPrompt): Promise<{ prompt: BatchPrompt; result: ClarifyResult; latencyMs: number; error?: string }> {
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

async function main() {
  const existing: Array<Record<string, unknown>> = JSON.parse(fs.readFileSync(RESULTS_PATH, "utf-8"));

  // Find entries that failed with no-result under 50ms (server crash victims)
  const failedIds = new Set(
    existing
      .filter((r) => r.inferredSource === "no-result" && (r.latencyMs as number) < 50)
      .map((r) => r.id as number),
  );

  console.log(`Re-running ${failedIds.size} failed prompts...\n`);

  // Extract prompt definitions from the existing results
  const prompts: BatchPrompt[] = existing
    .filter((r) => failedIds.has(r.id as number))
    .map((r) => ({
      id: r.id as number,
      prompt: r.prompt as string,
      category: r.category as Category,
      expectedSource: r.expectedSource as string,
      notes: r.notes as string,
    }));

  const results: Array<{ prompt: BatchPrompt; result: ClarifyResult; latencyMs: number; error?: string }> = [];
  const queue = [...prompts];

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

  // Merge back into existing results
  const newById = new Map(
    results.map((r) => {
      const attrs = r.result.dataProfile?.attributes ?? null;
      return [r.prompt.id, {
        id: r.prompt.id,
        prompt: r.prompt.prompt,
        category: r.prompt.category,
        expectedSource: r.prompt.expectedSource,
        notes: r.prompt.notes,
        outcome: classifyOutcome(r.result),
        latencyMs: r.latencyMs,
        error: r.error ?? null,
        ready: r.result.ready ?? false,
        resolutionStatus: r.result.resolutionStatus ?? null,
        resolvedPrompt: r.result.resolvedPrompt ?? null,
        dataUrl: r.result.dataUrl ?? null,
        inferredSource: inferSource(r.result),
        hasQuestions: !!r.result.questions,
        questions: r.result.questions ?? null,
        dataWarning: r.result.dataWarning ?? null,
        suggestions: r.result.suggestions ?? null,
        scopeHint: r.result.scopeHint ?? null,
        confidence: r.result.confidence ?? null,
        coverageRatio: r.result.coverageRatio ?? null,
        agencyHint: r.result.agencyHint ?? null,
        featureCount: r.result.dataProfile?.featureCount ?? null,
        geometryType: r.result.dataProfile?.geometryType ?? null,
        attributes: attrs,
      }];
    }),
  );

  const merged = existing.map((r) => {
    const replacement = newById.get(r.id as number);
    return replacement ?? r;
  });

  fs.writeFileSync(RESULTS_PATH, JSON.stringify(merged, null, 2));

  // Quick summary
  const stillFailed = results.filter((r) => inferSource(r.result) === "no-result").length;
  console.log(`\nDone. ${results.length - stillFailed}/${results.length} re-runs succeeded. Merged into ${RESULTS_PATH}`);
}

main().catch(console.error);
