import { getServiceClient } from "../supabase/service";
import type { ClarifyResponse } from "./types";
import type { Json } from "../supabase/types";

/** Normalize a prompt for cache keying — lowercase, trim, collapse whitespace. */
export function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, " ");
}

/**
 * Classify TTL in hours for a clarify cache entry.
 *
 * IMPORTANT: clarify_cache entries that reference /api/geo/cached/* must expire
 * before or together with the underlying data_cache entries (24h). Otherwise the
 * clarify cache returns a dataUrl that points to expired/missing geo data → 404.
 *
 * Max TTL is 24h to stay in sync with data_cache DB_TTL_MS.
 */
const MAX_CLARIFY_TTL_HOURS = 24;

export function classifyTTL(response: ClarifyResponse): number {
  if (!response.dataUrl) return MAX_CLARIFY_TTL_HOURS;
  const url = response.dataUrl.toLowerCase();
  // Real-time feeds — short TTL
  if (url.includes("eonet") || url.includes("earthquake") || url.includes("/flights") || url.includes("/iss")) return 1;
  // Near-real-time — moderate TTL
  if (url.includes("overpass") || url.includes("citybikes") || url.includes("firms")) return 6;
  // Static local files (public/geo/) — these never expire from data_cache
  if (url.startsWith("/geo/") || url.startsWith("/api/geo/overpass")) return MAX_CLARIFY_TTL_HOURS;
  // Everything else (cached World Bank, Eurostat, Data Commons, web search, etc.)
  return MAX_CLARIFY_TTL_HOURS;
}

export interface CacheHit {
  response: ClarifyResponse;
  hitCount: number;
}

/** Look up a cached clarify result. Returns null on miss, error, or expired. */
export async function getCachedClarify(promptKey: string): Promise<CacheHit | null> {
  const client = getServiceClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from("clarify_cache")
      .select("response, hit_count, expires_at")
      .eq("prompt_key", promptKey)
      .maybeSingle();
    if (error || !data) return null;
    // Reject expired entries. Legacy rows without expires_at are treated as expired
    // to avoid serving stale dataUrls that point to purged data_cache entries.
    if (!data.expires_at || new Date(data.expires_at) < new Date()) return null;
    return { response: data.response as unknown as ClarifyResponse, hitCount: data.hit_count };
  } catch {
    return null;
  }
}

/** Store a successful clarify result. Fire-and-forget. */
export async function storeClarifyResult(
  promptKey: string,
  response: ClarifyResponse,
): Promise<void> {
  const client = getServiceClient();
  if (!client) return;
  const ttlHours = classifyTTL(response);
  const expiresAt = new Date(Date.now() + ttlHours * 3600_000).toISOString();
  try {
    await client.from("clarify_cache").upsert(
      {
        prompt_key: promptKey,
        response: response as unknown as Json,
        ttl_hours: ttlHours,
        expires_at: expiresAt,
        hit_count: 0,
      },
      { onConflict: "prompt_key", ignoreDuplicates: true },
    );
  } catch {
    // Non-critical — cache write failure doesn't affect the pipeline
  }
}

/** Increment the hit counter. Fire-and-forget. */
export async function incrementCacheHit(promptKey: string): Promise<void> {
  const client = getServiceClient();
  if (!client) return;
  try {
    await client.rpc("increment_clarify_hit", { p_prompt_key: promptKey });
  } catch {
    // Non-critical
  }
}
