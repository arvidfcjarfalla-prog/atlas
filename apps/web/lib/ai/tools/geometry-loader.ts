/**
 * Geometry loading layer.
 *
 * Fetches GeoJSON FeatureCollections referenced by the geometry registry.
 * Supports api_route, cdn_url, and local_file loader types.
 *
 * Design rules:
 *   - Fail gracefully: return null when geometry cannot be loaded.
 *   - Validate: only accept valid GeoJSON FeatureCollections.
 *   - Cache in memory: avoid repeated downloads within a session.
 *   - No pipeline integration: this is a standalone utility for the
 *     join execution layer to consume.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { GeometryEntry } from "./geometry-registry";

// ═══════════════════════════════════════════════════════════════
// Load error types
// ═══════════════════════════════════════════════════════════════

/** Why a geometry load failed — for user-facing diagnostics. */
export type GeometryLoadErrorType =
  | "network"          // fetch failed (timeout, ECONNREFUSED, etc.)
  | "not_found"        // HTTP 404
  | "server_error"     // HTTP 5xx
  | "invalid_geojson"  // response parsed but isn't valid GeoJSON
  | "unsupported"      // loader type not supported (e.g. "generated")
  | "file_not_found"   // local file missing
  | "parse_error";     // JSON parse failed

export interface GeometryLoadError {
  type: GeometryLoadErrorType;
  message: string;
}

export interface GeometryLoadResult {
  geometry: GeoJSON.FeatureCollection | null;
  error: GeometryLoadError | null;
}

// ═══════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════

/** Timeout for all HTTP fetches (api_route and cdn_url). */
const FETCH_TIMEOUT_MS = 60_000;

/** In-memory cache TTL. */
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

// ═══════════════════════════════════════════════════════════════
// Cache
// ═══════════════════════════════════════════════════════════════

interface CacheEntry {
  fc: GeoJSON.FeatureCollection;
  loadedAt: number;
}

const cache = new Map<string, CacheEntry>();

/**
 * Clear the in-memory geometry cache.
 * Intended for testing.
 */
export function clearGeometryCache(): void {
  cache.clear();
}

/**
 * Get the current cache size. For diagnostics.
 */
export function geometryCacheSize(): number {
  return cache.size;
}

// ═══════════════════════════════════════════════════════════════
// Validation
// ═══════════════════════════════════════════════════════════════

/**
 * Check if a parsed value is a valid GeoJSON FeatureCollection.
 *
 * Validates:
 *   - type === "FeatureCollection"
 *   - features is a non-empty array
 *   - first feature has type === "Feature" and a geometry object
 */
export function isValidFeatureCollection(
  data: unknown,
): data is GeoJSON.FeatureCollection {
  if (data == null || typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;
  if (obj.type !== "FeatureCollection") return false;
  if (!Array.isArray(obj.features)) return false;
  if (obj.features.length === 0) return false;

  // Spot-check the first feature
  const first = obj.features[0];
  if (first == null || typeof first !== "object") return false;
  const feat = first as Record<string, unknown>;
  if (feat.type !== "Feature") return false;
  if (feat.geometry == null || typeof feat.geometry !== "object") return false;

  return true;
}

// ═══════════════════════════════════════════════════════════════
// URL resolution
// ═══════════════════════════════════════════════════════════════

/**
 * Resolve an api_route relative path to a full URL.
 *
 * Uses ATLAS_BASE_URL env var, falling back to http://localhost:3000.
 * api_route targets are relative paths like "/api/geo/world-countries".
 */
function resolveApiUrl(target: string): string {
  const base =
    process.env.ATLAS_BASE_URL ??
    process.env.NEXT_PUBLIC_BASE_URL ??
    "http://localhost:3000";
  // Strip trailing slash from base, ensure target starts with /
  const cleanBase = base.replace(/\/+$/, "");
  const cleanTarget = target.startsWith("/") ? target : `/${target}`;
  return `${cleanBase}${cleanTarget}`;
}

// ═══════════════════════════════════════════════════════════════
// Loaders
// ═══════════════════════════════════════════════════════════════

/** Tagged error so loadGeometry can classify the failure. */
class LoadError extends Error {
  constructor(
    message: string,
    public readonly errorType: GeometryLoadErrorType,
  ) {
    super(message);
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    const errorType: GeometryLoadErrorType =
      res.status === 404 ? "not_found" : res.status >= 500 ? "server_error" : "network";
    throw new LoadError(
      `HTTP ${res.status} ${res.statusText} from ${url}`,
      errorType,
    );
  }
  return res.json();
}

async function loadApiRoute(target: string): Promise<unknown> {
  const url = resolveApiUrl(target);
  return fetchJson(url);
}

async function loadCdnUrl(target: string): Promise<unknown> {
  return fetchJson(target);
}

async function loadLocalFile(target: string): Promise<unknown> {
  // Resolve relative to project root's public/ directory
  const filePath = resolve(process.cwd(), "public", target);
  let raw: string;
  try {
    raw = await readFile(filePath, "utf-8");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new LoadError(`File read failed: ${msg}`, "file_not_found");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new LoadError(`Invalid JSON in ${filePath}`, "parse_error");
  }
}

// ═══════════════════════════════════════════════════════════════
// Main loader
// ═══════════════════════════════════════════════════════════════

/**
 * Load geometry for a registry entry.
 *
 * Returns `{ geometry, error }`:
 *   - On success: `geometry` is a valid FeatureCollection, `error` is null.
 *   - On failure: `geometry` is null, `error` describes what went wrong.
 *
 * Results are cached in memory by entry ID for CACHE_TTL_MS.
 */
export async function loadGeometry(
  entry: GeometryEntry,
): Promise<GeometryLoadResult> {
  // ── Check cache ──────────────────────────────────────────
  const cached = cache.get(entry.id);
  if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) {
    return { geometry: cached.fc, error: null };
  }
  // Stale entry: remove it
  if (cached) {
    cache.delete(entry.id);
  }

  // ── Dispatch by loader type ──────────────────────────────
  let data: unknown;
  try {
    switch (entry.loaderType) {
      case "api_route":
        data = await loadApiRoute(entry.loaderTarget);
        break;
      case "cdn_url":
        data = await loadCdnUrl(entry.loaderTarget);
        break;
      case "local_file":
        data = await loadLocalFile(entry.loaderTarget);
        break;
      case "generated":
        return {
          geometry: null,
          error: { type: "unsupported", message: `Loader type "generated" is not yet supported` },
        };
      default:
        return {
          geometry: null,
          error: { type: "unsupported", message: `Unknown loader type: ${entry.loaderType}` },
        };
    }
  } catch (err) {
    const errorType: GeometryLoadErrorType =
      err instanceof LoadError ? err.errorType : "network";
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[geometry-loader] Failed to load "${entry.id}": ${msg}`);
    return {
      geometry: null,
      error: { type: errorType, message: msg },
    };
  }

  // ── Validate ─────────────────────────────────────────────
  if (!isValidFeatureCollection(data)) {
    const obj = data as Record<string, unknown> | null;
    const feats = obj?.features;
    const detail =
      `type=${obj?.type}, ` +
      `features=${Array.isArray(feats) ? (feats as unknown[]).length : "not array"}`;
    console.warn(`[geometry-loader] Invalid GeoJSON from "${entry.id}": ${detail}`);
    return {
      geometry: null,
      error: { type: "invalid_geojson", message: `Invalid GeoJSON from "${entry.id}": ${detail}` },
    };
  }

  // ── Cache and return ─────────────────────────────────────
  const fc = data as GeoJSON.FeatureCollection;
  cache.set(entry.id, { fc, loadedAt: Date.now() });
  return { geometry: fc, error: null };
}
