import { getServiceClient } from "../supabase/service";
import type { ClarifyResponse } from "./types";
import type { Json } from "../supabase/types";

/** Normalize a prompt for cache keying — lowercase, trim, collapse whitespace. */
export function normalizePrompt(prompt: string): string {
  return prompt.toLowerCase().trim().replace(/\s+/g, " ");
}

/** Classify if a resolved response is time-sensitive. Returns TTL in hours (0 = no expiry). */
export function classifyTTL(response: ClarifyResponse): number {
  if (!response.dataUrl) return 0;
  const url = response.dataUrl.toLowerCase();
  // Real-time feeds — short TTL
  if (url.includes("eonet") || url.includes("earthquake") || url.includes("/flights") || url.includes("/iss")) return 1;
  // Near-real-time — moderate TTL
  if (url.includes("overpass") || url.includes("citybikes") || url.includes("firms")) return 6;
  // Web-research and web-search results may be stale or suboptimal
  if (url.includes("/cached/web-")) return 48;
  // Semi-static APIs (heritage, volcanoes) — long TTL
  if (url.includes("/heritage") || url.includes("/volcanoes")) return 168; // 1 week
  return 0;
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
    if (data.expires_at && new Date(data.expires_at) < new Date()) return null;
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
  const expiresAt = ttlHours > 0
    ? new Date(Date.now() + ttlHours * 3600_000).toISOString()
    : null;
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
