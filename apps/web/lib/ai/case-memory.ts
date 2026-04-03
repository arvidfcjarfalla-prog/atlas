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

// ─── Case retrieval — STUBBED ───────────────────────────────
// Reads disabled until durable learning storage (Phase C.2) is wired.
// Exports preserved for test mock compatibility.

export interface CaseLesson {
  prompt: string;
  family: string;
  score: number;
  deductions: string[];
  keyFields: Record<string, unknown>;
  attempts: number;
}

/** STUBBED: Returns [] — ephemeral .next/cache store disabled. */
export async function findRelevantLessons(
  _prompt: string,
  _geometryType?: string,
  _limit = 2,
): Promise<CaseLesson[]> {
  return [];
}

/** STUBBED: Returns "" — no lessons to format. */
export function formatLessons(_lessons: CaseLesson[]): string {
  return "";
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
