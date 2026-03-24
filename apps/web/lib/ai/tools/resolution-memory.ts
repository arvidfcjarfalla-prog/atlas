/**
 * Resolution memory — learns from successful map resolutions.
 *
 * After each map_ready PxWeb resolution, stores the "recipe" (source, table,
 * geo level, topic keywords). On future prompts with similar topics, the
 * proven table is prepended to the candidate list — acting as a dynamic,
 * learned version of the plugin knownTables mechanism.
 *
 * Storage: JSON file at .next/cache/atlas-data/resolution-memory.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────

export interface ResolutionRecord {
  /** PxWeb source ID (e.g. "pxweb-se-scb") */
  sourceId: string;
  /** Country code (e.g. "SE") */
  countryCode: string;
  /** Table ID that produced map_ready */
  tableId: string;
  /** Table label for human reference */
  tableLabel: string;
  /** Detected geography level */
  geoLevel: string;
  /** Topic keywords extracted from the prompt */
  keywords: string[];
  /** Join coverage ratio (0–1) */
  coverageRatio: number;
  /** Number of times this recipe has succeeded */
  successCount: number;
  /** Last successful resolution timestamp */
  lastUsed: number;
}

// ─── Storage ────────────────────────────────────────────────

const MEMORY_DIR = join(process.cwd(), ".next", "cache", "atlas-data");
const MEMORY_FILE = join(MEMORY_DIR, "resolution-memory.json");

/** In-memory cache to avoid repeated file reads within the same process. */
let memoryCache: ResolutionRecord[] | null = null;

export async function loadMemory(): Promise<ResolutionRecord[]> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await readFile(MEMORY_FILE, "utf-8");
    const records = JSON.parse(raw);
    if (!Array.isArray(records)) return [];
    memoryCache = records as ResolutionRecord[];
    return memoryCache;
  } catch {
    return [];
  }
}

async function saveMemory(records: ResolutionRecord[]): Promise<void> {
  memoryCache = records;
  try {
    await mkdir(MEMORY_DIR, { recursive: true });
    await writeFile(MEMORY_FILE, JSON.stringify(records, null, 2));
  } catch {
    // Non-critical — next save will retry
  }
}

// ─── Recording ──────────────────────────────────────────────

/**
 * Record a successful map_ready resolution.
 * Deduplicates by sourceId + tableId. Increments successCount on repeat.
 */
export async function recordResolution(record: {
  sourceId: string;
  countryCode: string;
  tableId: string;
  tableLabel: string;
  geoLevel: string;
  keywords: string[];
  coverageRatio: number;
}): Promise<void> {
  const records = await loadMemory();

  const existing = records.findIndex(
    (r) => r.sourceId === record.sourceId && r.tableId === record.tableId,
  );

  if (existing >= 0) {
    records[existing].successCount += 1;
    records[existing].lastUsed = Date.now();
    records[existing].coverageRatio = Math.max(
      records[existing].coverageRatio,
      record.coverageRatio,
    );
    // Merge keywords (union)
    const kwSet = new Set([...records[existing].keywords, ...record.keywords]);
    records[existing].keywords = [...kwSet];
  } else {
    records.push({
      ...record,
      successCount: 1,
      lastUsed: Date.now(),
    });
  }

  await saveMemory(records);
}

// ─── Lookup ─────────────────────────────────────────────────

/**
 * Find proven table IDs for a given source + topic keywords.
 *
 * Returns table IDs sorted by relevance (keyword overlap × successCount).
 * Only returns tables with ≥50% coverage and at least 1 keyword match.
 */
export async function getLearnedTables(
  sourceId: string,
  topicKeywords: string[],
): Promise<string[]> {
  const records = await loadMemory();
  if (records.length === 0) return [];

  const keywordSet = new Set(topicKeywords.map((k) => k.toLowerCase()));

  const scored = records
    .filter((r) => r.sourceId === sourceId && r.coverageRatio >= 0.5)
    .map((r) => {
      // Count keyword overlap
      const overlap = r.keywords.filter((k) => keywordSet.has(k)).length;
      if (overlap === 0) return null;
      // Score: keyword overlap × log(successCount + 1) for diminishing returns
      const score = overlap * Math.log2(r.successCount + 1);
      return { tableId: r.tableId, score };
    })
    .filter((r): r is { tableId: string; score: number } => r !== null)
    .sort((a, b) => b.score - a.score);

  return scored.map((r) => r.tableId);
}
