import { RetryableError } from "./pipeline-stages";

/**
 * Fetch a GeoJSON FeatureCollection from a URL. Returns null if the URL
 * does not yield a valid FeatureCollection.
 *
 * When `throwOnExpired` is true, a 404 response is treated as a cache-expired
 * signal and throws RetryableError so the caller can re-resolve upstream data.
 * Otherwise all failure modes silently return null.
 */
export async function fetchGeoJSON(
  url: string,
  opts?: { throwOnExpired?: boolean },
): Promise<GeoJSON.FeatureCollection | null> {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const geo = await res.json();
      if (geo?.type === "FeatureCollection") return geo as GeoJSON.FeatureCollection;
      return null;
    }
    if (opts?.throwOnExpired && res.status === 404) {
      throw new RetryableError("Cached data expired, retrying");
    }
    return null;
  } catch (e) {
    if (e instanceof RetryableError) throw e;
    return null;
  }
}
