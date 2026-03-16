/**
 * Persistent dataset registry.
 *
 * When the web dataset search discovers a usable dataset, it's registered
 * here so future prompts with the same topic can reuse it without
 * re-searching the internet.
 *
 * Storage: JSON file at .next/cache/atlas-data/dataset-registry.json
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// ─── Types ──────────────────────────────────────────────────

export interface DatasetIntent {
  topic: string;
  metric?: string;
  geography?: string;
  timeframe?: string;
}

export interface RegistryEntry {
  topic: string;
  keywords: string[];
  datasetUrl: string;
  format: "geojson" | "csv" | "api";
  metricField?: string;
  geographyField?: string;
  /** Geographic scope (e.g. "Brazil", "US", "global"). Prevents cross-country false matches. */
  geography?: string;
  cacheKey: string;
  confidence: number;
  discoveredAt: number;
}

// ─── Storage ────────────────────────────────────────────────

const REGISTRY_DIR = join(process.cwd(), ".next", "cache", "atlas-data");
const REGISTRY_FILE = join(REGISTRY_DIR, "dataset-registry.json");

export async function loadRegistry(): Promise<RegistryEntry[]> {
  try {
    const raw = await readFile(REGISTRY_FILE, "utf-8");
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries)) return [];
    return entries as RegistryEntry[];
  } catch {
    return [];
  }
}

export async function saveRegistry(entries: RegistryEntry[]): Promise<void> {
  try {
    await mkdir(REGISTRY_DIR, { recursive: true });
    await writeFile(REGISTRY_FILE, JSON.stringify(entries, null, 2));
  } catch {
    // Non-critical — next save will retry
  }
}

// ─── Intent extraction ──────────────────────────────────────

const STOP_WORDS = new Set([
  "show", "me", "map", "of", "the", "a", "an", "in", "on", "by",
  "with", "for", "and", "or", "to", "create", "make", "display",
  "visualize", "plot", "draw", "all", "each", "every", "per",
  "visa", "visar", "karta", "över", "skapa", "gör",
]);

const METRIC_WORDS = new Set([
  "rate", "rates", "density", "count", "routes", "route", "paths",
  "path", "flow", "flows", "level", "levels", "index", "score",
  "ratio", "percentage", "per capita", "emissions", "production",
  "consumption", "coverage", "volume", "intensity",
  "income", "salary", "wage", "price", "prices", "cost", "gdp",
  "population", "unemployment", "poverty", "temperature",
]);

const GEOGRAPHY_PATTERNS: [RegExp, string][] = [
  [/\b(global|worldwide|world)\b/i, "global"],
  [/\b(europe|european)\b/i, "europe"],
  [/\b(africa|african)\b/i, "africa"],
  [/\b(asia|asian)\b/i, "asia"],
  [/\b(north america|south america|latin america)\b/i, "$1"],
  [/\b(us|usa|united states|american)\b/i, "US"],
  [/\b(uk|united kingdom|british)\b/i, "UK"],
  [/\b(brazil|brasil)\b/i, "Brazil"],
  [/\b(germany|deutschland|tyskland)\b/i, "Germany"],
  [/\b(france|frankrike)\b/i, "France"],
  [/\b(india|indien)\b/i, "India"],
  [/\b(japan)\b/i, "Japan"],
  [/\b(mexico|méxico)\b/i, "Mexico"],
  [/\b(australia|australien)\b/i, "Australia"],
  [/\b(canada|kanada)\b/i, "Canada"],
  [/\b(china|kina)\b/i, "China"],
  [/\b(spain|españa|spanien)\b/i, "Spain"],
  [/\b(italy|italia|italien)\b/i, "Italy"],
  [/\b(sweden|sverige)\b/i, "Sweden"],
  [/\b(norway|norge)\b/i, "Norway"],
  [/\b(countries|nations|country)\b/i, "countries"],
  [/\b(states|state-level|state)\b/i, "states"],
  [/\b(cities|city|urban)\b/i, "cities"],
];

export function extractIntent(prompt: string): DatasetIntent {
  const lower = prompt.toLowerCase().trim();
  const words = lower.split(/\s+/);

  // Extract geography
  let geography: string | undefined;
  for (const [pattern, value] of GEOGRAPHY_PATTERNS) {
    const m = lower.match(pattern);
    if (m) {
      geography = value.startsWith("$") ? m[1] : value;
      break;
    }
  }

  // Extract timeframe (year patterns)
  const yearMatch = lower.match(/\b(20\d{2}|19\d{2})\b/);
  const timeframe = yearMatch ? yearMatch[1] : undefined;

  // Extract metric words
  let metric: string | undefined;
  for (const word of words) {
    if (METRIC_WORDS.has(word)) {
      metric = word;
      break;
    }
  }

  // Topic: remaining meaningful words joined
  const topicWords = words.filter((w) => !STOP_WORDS.has(w) && w !== metric && w !== geography?.toLowerCase());
  const topic = topicWords.join(" ") || lower;

  return { topic, metric, geography, timeframe };
}

/**
 * Build a search query string from structured intent.
 */
export function buildSearchQuery(intent: DatasetIntent): string {
  const parts = [
    intent.geography,
    intent.topic,
    intent.metric,
    "dataset geojson OR csv",
  ].filter(Boolean);
  return parts.join(" ");
}

// ─── Registry operations ────────────────────────────────────

/**
 * Check registry for a matching dataset.
 * Fuzzy-matches intent topic + metric against stored entries.
 * Returns best match above confidence threshold, or null.
 */
export async function checkRegistry(
  intent: DatasetIntent,
): Promise<RegistryEntry | null> {
  const entries = await loadRegistry();
  if (entries.length === 0) return null;

  const needle = intent.topic.toLowerCase();
  let bestMatch: RegistryEntry | null = null;
  let bestScore = 0;

  for (const entry of entries) {
    let score = 0;

    // Direct topic match (exact or substring containment)
    if (entry.topic === needle) {
      score = 1.0;
    } else if (needle.includes(entry.topic) || entry.topic.includes(needle)) {
      score = 0.8;
    } else {
      // Keyword matching — require ≥2 keyword matches to avoid
      // false positives from single shared words like "sweden".
      let kwMatches = 0;
      for (const kw of entry.keywords) {
        if (kw.length > 2 && needle.includes(kw)) kwMatches++;
      }
      if (kwMatches >= 2) score = Math.max(score, 0.7);
    }

    // Geography mismatch — skip entry if both have geography and they differ.
    // e.g. entry has "US" but user asks for "Brazil" → score 0.
    if (intent.geography && entry.geography) {
      const intentGeo = intent.geography.toLowerCase();
      const entryGeo = entry.geography.toLowerCase();
      if (intentGeo !== entryGeo && !intentGeo.includes(entryGeo) && !entryGeo.includes(intentGeo)) {
        score = 0;
      }
    }

    // Boost for metric match, penalize geometry-only entries when user wants a metric
    if (intent.metric) {
      if (entry.metricField && entry.metricField.toLowerCase().includes(intent.metric)) {
        score = Math.min(score + 0.1, 1.0);
      } else if (!entry.metricField) {
        // Geometry-only dataset can't satisfy a metric query — skip
        score = 0;
      }
    }

    if (score > bestScore && score >= 0.7) {
      bestScore = score;
      bestMatch = entry;
    }
  }

  return bestMatch;
}

/**
 * Register a newly discovered dataset for future reuse.
 * Deduplicates by topic + URL. Stores geography from intent for cross-country filtering.
 */
export async function registerDataset(
  intent: DatasetIntent,
  entry: Omit<RegistryEntry, "topic" | "discoveredAt">,
): Promise<void> {
  const entries = await loadRegistry();
  const topic = intent.topic.toLowerCase();

  // Deduplicate by topic + url
  const existing = entries.findIndex(
    (e) => e.topic === topic && e.datasetUrl === entry.datasetUrl,
  );

  const newEntry: RegistryEntry = {
    ...entry,
    geography: entry.geography ?? intent.geography,
    topic,
    discoveredAt: Date.now(),
  };

  if (existing >= 0) {
    entries[existing] = newEntry;
  } else {
    entries.push(newEntry);
  }

  await saveRegistry(entries);
}
