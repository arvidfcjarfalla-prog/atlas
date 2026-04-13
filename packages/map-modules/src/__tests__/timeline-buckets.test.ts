import { describe, expect, it } from "vitest";
import type { GeoEntity, Severity } from "@atlas/data-models";
import { computeBuckets, BUCKET_COUNT } from "../timeline/buckets";

const HOUR = 60 * 60 * 1000;

function entity(
  id: string,
  at: number | string | undefined,
  severity?: Severity,
  field: "updatedAt" | "occurredAt" = "updatedAt",
): GeoEntity {
  const iso = at === undefined ? undefined : typeof at === "number" ? new Date(at).toISOString() : at;
  return {
    id,
    kind: "event",
    title: id,
    coordinates: [0, 0],
    category: "test",
    severity,
    [field]: iso,
  } as GeoEntity;
}

describe("computeBuckets", () => {
  const NOW = 1_700_000_000_000; // fixed epoch for deterministic tests
  const WINDOW = 24 * HOUR;

  it("returns BUCKET_COUNT (48) buckets by default", () => {
    const buckets = computeBuckets([], WINDOW, NOW);
    expect(buckets).toHaveLength(48);
    expect(BUCKET_COUNT).toBe(48);
  });

  it("buckets span exactly [now - windowMs, now] with uniform width", () => {
    const buckets = computeBuckets([], WINDOW, NOW);
    expect(buckets[0].startMs).toBe(NOW - WINDOW);
    expect(buckets[buckets.length - 1].endMs).toBe(NOW);
    const width = WINDOW / BUCKET_COUNT;
    for (const b of buckets) {
      expect(b.endMs - b.startMs).toBe(width);
    }
  });

  it("empty entities → all zero counts, all low severity", () => {
    const buckets = computeBuckets([], WINDOW, NOW);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
    expect(buckets.every((b) => b.maxSeverity === "low")).toBe(true);
  });

  it("entity older than windowStart is dropped", () => {
    const tooOld = NOW - WINDOW - HOUR;
    const buckets = computeBuckets([entity("e1", tooOld, "high")], WINDOW, NOW);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(0);
  });

  it("entity newer than now is dropped", () => {
    const tooNew = NOW + HOUR;
    const buckets = computeBuckets([entity("e1", tooNew, "high")], WINDOW, NOW);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(0);
  });

  it("entity 2h ago with 24h window lands in bucket index 44", () => {
    // bucketSize = 24h / 48 = 30 min. (now - 2h) is (24 - 2) = 22h past windowStart. 22h / 30min = 44.
    const buckets = computeBuckets([entity("e1", NOW - 2 * HOUR, "medium")], WINDOW, NOW);
    expect(buckets[44].count).toBe(1);
    expect(buckets[44].maxSeverity).toBe("medium");
    const sumElsewhere = buckets.reduce((s, b, i) => (i === 44 ? s : s + b.count), 0);
    expect(sumElsewhere).toBe(0);
  });

  it("severity aggregates to the max across entities in the same bucket", () => {
    const t = NOW - 2 * HOUR;
    const buckets = computeBuckets(
      [
        entity("lo", t, "low"),
        entity("med", t, "medium"),
        entity("crit", t, "critical"),
        entity("hi", t, "high"),
      ],
      WINDOW,
      NOW,
    );
    expect(buckets[44].count).toBe(4);
    expect(buckets[44].maxSeverity).toBe("critical");
  });

  it("entity with missing timeField is ignored", () => {
    const buckets = computeBuckets([entity("e1", undefined, "critical")], WINDOW, NOW);
    expect(buckets.every((b) => b.count === 0)).toBe(true);
  });

  it("updatedAt takes precedence over occurredAt", () => {
    // Craft an entity with both; updatedAt 1h ago, occurredAt outside window.
    const e: GeoEntity = {
      id: "e1",
      kind: "event",
      title: "e",
      coordinates: [0, 0],
      category: "t",
      occurredAt: new Date(NOW - WINDOW - HOUR).toISOString(),
      updatedAt: new Date(NOW - HOUR).toISOString(),
      severity: "high",
    };
    const buckets = computeBuckets([e], WINDOW, NOW);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(1);
    // (24 - 1) = 23h past windowStart. 23h / 30min = 46.
    expect(buckets[46].count).toBe(1);
  });

  it("falls back to occurredAt when updatedAt missing", () => {
    const e = entity("e1", NOW - HOUR, "low", "occurredAt");
    const buckets = computeBuckets([e], WINDOW, NOW);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(1);
  });

  it("entity exactly at `now` lands in the last bucket (idx clamp)", () => {
    const buckets = computeBuckets([entity("e1", NOW, "low")], WINDOW, NOW);
    expect(buckets[BUCKET_COUNT - 1].count).toBe(1);
  });

  it("entity exactly at windowStart lands in bucket 0 (inclusive boundary)", () => {
    const buckets = computeBuckets([entity("e1", NOW - WINDOW, "medium")], WINDOW, NOW);
    expect(buckets[0].count).toBe(1);
    expect(buckets[0].maxSeverity).toBe("medium");
  });

  it("100 entities in the same bucket all count (no saturation bug)", () => {
    const t = NOW - 2 * HOUR; // lands in bucket 44
    const many = Array.from({ length: 100 }, (_, i) => entity(`e${i}`, t, "low"));
    const buckets = computeBuckets(many, WINDOW, NOW);
    expect(buckets[44].count).toBe(100);
  });

  it("respects custom bucketCount parameter", () => {
    const buckets = computeBuckets([entity("e1", NOW - HOUR, "low")], WINDOW, NOW, 24);
    expect(buckets).toHaveLength(24);
    const total = buckets.reduce((s, b) => s + b.count, 0);
    expect(total).toBe(1);
  });

  it("entity with missing severity is treated as low", () => {
    const buckets = computeBuckets([entity("e1", NOW - HOUR, undefined)], WINDOW, NOW);
    // find the bucket with count 1
    const b = buckets.find((b) => b.count > 0);
    expect(b).toBeDefined();
    expect(b!.maxSeverity).toBe("low");
  });
});
