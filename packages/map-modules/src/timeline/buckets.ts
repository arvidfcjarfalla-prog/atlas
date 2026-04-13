import type { GeoEntity, Severity } from "@atlas/data-models";
import { maxSeverity } from "@atlas/data-models";

export const BUCKET_COUNT = 48;

export interface Bucket {
  count: number;
  maxSeverity: Severity;
  startMs: number;
  endMs: number;
}

/**
 * Bucket entities into `bucketCount` time buckets spanning [now - windowMs, now].
 *
 * Entities whose timestamp falls outside the window are dropped.
 * Each bucket accumulates count + max severity across contained entities.
 * Timestamp is read from `updatedAt` first, then `occurredAt`.
 */
export function computeBuckets(
  entities: GeoEntity[],
  windowMs: number,
  now: number,
  bucketCount: number = BUCKET_COUNT,
): Bucket[] {
  const windowStart = now - windowMs;
  const bucketSize = windowMs / bucketCount;
  const result: Bucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    count: 0,
    maxSeverity: "low" as Severity,
    startMs: windowStart + i * bucketSize,
    endMs: windowStart + (i + 1) * bucketSize,
  }));

  for (const entity of entities) {
    const timeField = entity.updatedAt ?? entity.occurredAt;
    if (!timeField) continue;
    const t = new Date(timeField).getTime();
    if (t < windowStart || t > now) continue;
    const idx = Math.min(
      bucketCount - 1,
      Math.floor((t - windowStart) / bucketSize),
    );
    result[idx].count++;
    const entitySeverity = entity.severity ?? "low";
    result[idx].maxSeverity = maxSeverity(result[idx].maxSeverity, entitySeverity);
  }

  return result;
}
