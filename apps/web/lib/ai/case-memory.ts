/**
 * Lightweight case memory: saves map generation records to disk.
 *
 * Each case captures prompt → clarifications → data source → manifest → quality → outcome.
 * Stored as individual JSON files in `.next/cache/atlas-cases/`.
 * No TTL — cases are kept indefinitely for future retrieval/learning.
 */

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CaseRecord, RefinementEvent } from "./types";

export type { CaseRecord };

const MAX_REFINEMENTS = 20;

const CASES_DIR = join(process.cwd(), ".next", "cache", "atlas-cases");
let dirReady = false;

async function ensureDir(): Promise<void> {
  if (dirReady) return;
  await mkdir(CASES_DIR, { recursive: true });
  dirReady = true;
}

/** Save a case record to disk. */
export async function saveCase(record: CaseRecord): Promise<void> {
  await ensureDir();
  const filePath = join(CASES_DIR, `${record.id}.json`);
  await writeFile(filePath, JSON.stringify(record, null, 2), "utf-8");
}

/** Load a single case by ID. Returns null if not found. */
export async function loadCase(id: string): Promise<CaseRecord | null> {
  try {
    const filePath = join(CASES_DIR, `${id}.json`);
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as CaseRecord;
  } catch {
    return null;
  }
}

/** Update a case record's outcome. Returns false if case not found. */
export async function updateCaseOutcome(
  id: string,
  outcome: CaseRecord["outcome"],
): Promise<boolean> {
  const record = await loadCase(id);
  if (!record) return false;
  record.outcome = outcome;
  await saveCase(record);
  return true;
}

/** Append a refinement event to a case record. Returns false if not found. */
export async function appendRefinement(
  id: string,
  event: RefinementEvent,
): Promise<boolean> {
  const record = await loadCase(id);
  if (!record) return false;
  if (!record.refinements) record.refinements = [];
  if (record.refinements.length >= MAX_REFINEMENTS) return true; // silently cap
  record.refinements.push(event);
  await saveCase(record);
  return true;
}

// ─── Case retrieval for learning ─────────────────────────────

/** Condensed lesson from a past case, injected into the system prompt. */
export interface CaseLesson {
  /** Original user prompt (truncated). */
  prompt: string;
  /** Map family that was generated. */
  family: string;
  /** Quality score achieved. */
  score: number;
  /** Deductions the AI should avoid repeating. */
  deductions: string[];
  /** Key manifest fields that worked well. */
  keyFields: Record<string, unknown>;
  /** Number of retry attempts needed. */
  attempts: number;
}

/**
 * Score how relevant a past case is to a new prompt.
 * Uses simple keyword overlap — fast, no external dependencies.
 */
function relevanceScore(
  caseRecord: CaseRecord,
  promptWords: Set<string>,
  geometryType?: string,
): number {
  let score = 0;

  // Word overlap between prompts
  const caseWords = caseRecord.prompt.toLowerCase().split(/\s+/);
  for (const word of caseWords) {
    if (word.length > 2 && promptWords.has(word)) score += 1;
  }

  // Geometry type match
  if (geometryType) {
    const caseGeo = caseRecord.manifest.layers?.[0]?.geometryType;
    if (caseGeo === geometryType) score += 3;
  }

  // Prefer high-quality cases (the AI got it right)
  if (caseRecord.quality.total >= 80) score += 2;

  // Prefer cases that needed retries (lessons learned)
  if (caseRecord.attempts > 1) score += 1;

  // Prefer cases with refinements (user corrected something)
  if (caseRecord.refinements.length > 0) score += 2;

  return score;
}

/**
 * Extract a compact lesson from a case record.
 * Keeps only the fields that matter for future generation.
 */
function extractLesson(record: CaseRecord): CaseLesson {
  const layer = record.manifest.layers?.[0];
  const style = layer?.style;

  const keyFields: Record<string, unknown> = {};
  if (style?.mapFamily) keyFields.mapFamily = style.mapFamily;
  if (style?.colorField) keyFields.colorField = style.colorField;
  if (style?.sizeField) keyFields.sizeField = style.sizeField;
  if (style?.classification) keyFields.classification = style.classification;
  if (style?.color?.scheme) keyFields.colorScheme = style.color.scheme;
  if (style?.normalization) keyFields.normalization = style.normalization;
  if (layer?.legend) keyFields.legend = layer.legend;

  return {
    prompt: record.prompt.slice(0, 120),
    family: style?.mapFamily ?? "unknown",
    score: record.quality.total,
    deductions: record.quality.deductions,
    keyFields,
    attempts: record.attempts,
  };
}

/**
 * Find past cases relevant to a new prompt and extract lessons.
 * Returns up to `limit` lessons, sorted by relevance.
 *
 * Reads at most 100 recent cases to keep latency low.
 */
export async function findRelevantLessons(
  prompt: string,
  geometryType?: string,
  limit = 2,
): Promise<CaseLesson[]> {
  const cases = await listCases(100);
  if (cases.length === 0) return [];

  const promptWords = new Set(
    prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 2),
  );

  const scored = cases
    .map((c) => ({ case: c, score: relevanceScore(c, promptWords, geometryType) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  return scored.map((s) => extractLesson(s.case));
}

/**
 * Format case lessons as an XML block for injection into the system prompt.
 * Returns empty string if no lessons available.
 */
export function formatLessons(lessons: CaseLesson[]): string {
  if (lessons.length === 0) return "";

  const blocks = lessons.map((l) => {
    const parts = [`  <lesson>`, `    <prompt>${l.prompt}</prompt>`];
    parts.push(`    <family>${l.family}</family>`);
    parts.push(`    <score>${l.score}/100</score>`);
    parts.push(`    <attempts>${l.attempts}</attempts>`);
    if (l.deductions.length > 0) {
      parts.push(`    <deductions-to-avoid>`);
      for (const d of l.deductions) {
        parts.push(`      - ${d}`);
      }
      parts.push(`    </deductions-to-avoid>`);
    }
    parts.push(`    <key-fields>${JSON.stringify(l.keyFields)}</key-fields>`);
    parts.push(`  </lesson>`);
    return parts.join("\n");
  });

  return `<past-cases>
These are lessons from previous map generations. Use them to avoid repeating
mistakes and to follow patterns that scored well.

${blocks.join("\n\n")}
</past-cases>`;
}

/** List recent cases, sorted newest first. */
export async function listCases(limit = 50): Promise<CaseRecord[]> {
  await ensureDir();
  try {
    const files = await readdir(CASES_DIR);
    const jsonFiles = files.filter((f) => f.endsWith(".json"));

    const cases: CaseRecord[] = [];
    for (const file of jsonFiles) {
      try {
        const raw = await readFile(join(CASES_DIR, file), "utf-8");
        cases.push(JSON.parse(raw) as CaseRecord);
      } catch {
        // Skip corrupt files
      }
    }

    cases.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return cases.slice(0, limit);
  } catch {
    return [];
  }
}
