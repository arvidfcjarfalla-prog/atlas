/**
 * Tests for data_cache L1/L2 semantics after Fas 2 cleanup.
 *
 * Contract under test:
 * - L1 (memory): 1h TTL from write/promotion time
 * - L2 (Supabase): 24h TTL from last write (created_at reset on upsert)
 * - L2→L1 promotion sets fresh timestamp (Date.now()), not stale created_at
 * - No pinned bypass, no expires_at logic
 * - Saved maps live via artifact_id, not cache
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock getServiceClient before importing the module under test
const mockFrom = vi.fn();
const mockStorage = { from: vi.fn() };
const mockClient = { from: mockFrom, storage: mockStorage };

vi.mock("../../../lib/supabase/service", () => ({
  getServiceClient: vi.fn(() => mockClient),
}));

// Mock profiler to avoid heavy imports
vi.mock("../profiler", () => ({
  profileDataset: vi.fn(() => ({
    geometryType: "Polygon",
    featureCount: 1,
    attributes: [],
    numericAttributes: [],
  })),
}));

// Mock ai-client to avoid import side effects
vi.mock("../ai-client", () => ({
  MODELS: {},
}));

// Mock fs/promises
vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import {
  setCache,
  getCachedData,
  getCachedDataSync,
  type CacheEntry,
} from "../tools/data-search";

// ─── Helpers ───────────────────────────────────────────────

const STUB_PROFILE: CacheEntry["profile"] = {
  geometryType: "Polygon",
  featureCount: 1,
  attributes: [],
  bounds: [[0, 0], [1, 1]],
  crs: null,
};

function makeEntry(overrides?: Partial<CacheEntry>): CacheEntry {
  return {
    data: { type: "FeatureCollection", features: [] },
    profile: STUB_PROFILE,
    source: "test",
    description: "test entry",
    timestamp: Date.now(),
    ...overrides,
  };
}

/** Helper: configure mockFrom to simulate a Supabase read returning `row`. */
function mockDbRead(row: Record<string, unknown> | null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({
      data: row,
      error: null,
    }),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

/** Helper: configure mockFrom to simulate a Supabase upsert. */
function mockDbWrite() {
  const chain = {
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ─── Tests ─────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Clear L1 cache between tests by writing then reading with expired timestamp.
  // Since memoryCache is module-private, we use vi.useFakeTimers to control time.
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("L1 cache (in-memory)", () => {
  it("first insert: setCache → getCachedDataSync returns entry", async () => {
    mockDbWrite(); // L2 write is fire-and-forget
    const entry = makeEntry();
    await setCache("test-key", entry);

    const result = getCachedDataSync("test-key");
    expect(result).not.toBeNull();
    expect(result!.source).toBe("test");
  });

  it("L1 TTL: entry expires after 1 hour", async () => {
    mockDbWrite();
    await setCache("ttl-key", makeEntry());

    // Just under 1 hour — still valid
    vi.advanceTimersByTime(59 * 60 * 1000);
    expect(getCachedDataSync("ttl-key")).not.toBeNull();

    // Advance past 1 hour
    vi.advanceTimersByTime(2 * 60 * 1000);
    expect(getCachedDataSync("ttl-key")).toBeNull();
  });
});

describe("L2 cache (Supabase)", () => {
  it("L1 miss + L2 hit: promotes to L1 with fresh timestamp", async () => {
    // Simulate: L1 is empty, L2 has a valid entry written 2h ago
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockDbRead({
      data: { type: "FeatureCollection", features: [] },
      profile: STUB_PROFILE,
      source: "test",
      description: "from db",
      resolution_status: null,
      created_at: twoHoursAgo,
      normalized_meta: null,
    });

    const result = await getCachedData("l2-key");
    expect(result).not.toBeNull();
    expect(result!.description).toBe("from db");

    // The promoted L1 entry should have a fresh timestamp (now), not 2h ago.
    // Verify: getCachedDataSync should return it (within 1h window).
    const l1Result = getCachedDataSync("l2-key");
    expect(l1Result).not.toBeNull();
    // Timestamp should be close to Date.now(), not 2 hours ago
    expect(Date.now() - l1Result!.timestamp).toBeLessThan(1000);
  });

  it("L2 TTL: entry older than 24h returns null", async () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mockDbRead({
      data: { type: "FeatureCollection", features: [] },
      profile: STUB_PROFILE,
      source: "test",
      description: "expired",
      resolution_status: null,
      created_at: twentyFiveHoursAgo,
      normalized_meta: null,
    });

    const result = await getCachedData("expired-key");
    expect(result).toBeNull();
  });

  it("L2 TTL: entry under 24h returns data", async () => {
    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    mockDbRead({
      data: { type: "FeatureCollection", features: [] },
      profile: STUB_PROFILE,
      source: "test",
      description: "still valid",
      resolution_status: null,
      created_at: twentyThreeHoursAgo,
      normalized_meta: null,
    });

    const result = await getCachedData("valid-key");
    expect(result).not.toBeNull();
    expect(result!.description).toBe("still valid");
  });
});

describe("refresh semantics", () => {
  it("writeDbCache sends created_at in upsert payload", async () => {
    const upsertChain = mockDbWrite();
    const entry = makeEntry();
    await setCache("refresh-key", entry);

    expect(upsertChain.upsert).toHaveBeenCalledTimes(1);
    const payload = upsertChain.upsert.mock.calls[0][0];
    expect(payload).toHaveProperty("created_at");
    // created_at should be a recent ISO string
    const writtenAt = new Date(payload.created_at).getTime();
    expect(Date.now() - writtenAt).toBeLessThan(1000);
  });

  it("re-write at T+20h keeps entry valid at T+25h (TTL resets on refresh)", async () => {
    // This is the core regression case: a key written at T=0 and refreshed
    // at T+20h must still be readable at T+25h (5h after refresh, not 25h
    // after first insert).
    //
    // We simulate this by tracking the created_at that writeDbCache sends,
    // then using that value in the L2 read mock.

    let lastCreatedAt: string | null = null;
    // Mock that captures upsert created_at
    mockFrom.mockImplementation(() => ({
      upsert: vi.fn((payload: Record<string, unknown>) => {
        lastCreatedAt = payload.created_at as string;
        return Promise.resolve({ error: null });
      }),
    }));

    // T=0: first write
    await setCache("refresh-e2e", makeEntry());
    expect(lastCreatedAt).not.toBeNull();

    // T+20h: advance time, write again (simulating source adapter refresh)
    vi.advanceTimersByTime(20 * 60 * 60 * 1000);
    await setCache("refresh-e2e", makeEntry({ description: "refreshed" }));
    const refreshedAt = lastCreatedAt!;

    // T+25h: 5h after refresh. L1 is expired (>1h since T+20h write).
    // Simulate L1 miss by advancing past L1 TTL.
    vi.advanceTimersByTime(5 * 60 * 60 * 1000);

    // L2 returns the row with refreshed created_at (simulating what
    // Postgres would return after the upsert reset created_at).
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          data: { type: "FeatureCollection", features: [] },
          profile: STUB_PROFILE,
          source: "test",
          description: "refreshed",
          resolution_status: null,
          created_at: refreshedAt,
          normalized_meta: null,
        },
        error: null,
      }),
    }));

    // getCachedData should succeed: 5h since refresh < 24h TTL
    const result = await getCachedData("refresh-e2e");
    expect(result).not.toBeNull();
    expect(result!.description).toBe("refreshed");
  });

  it("setCache normalizes L1 timestamp to Date.now()", async () => {
    mockDbWrite();
    // Pass a stale timestamp — setCache should override it
    const staleTimestamp = Date.now() - 2 * 60 * 60 * 1000;
    await setCache("norm-key", makeEntry({ timestamp: staleTimestamp }));

    const result = getCachedDataSync("norm-key");
    expect(result).not.toBeNull();
    // L1 timestamp should be ~now, not the stale value
    expect(Date.now() - result!.timestamp).toBeLessThan(1000);
  });
});

describe("pinned is no longer a runtime concern", () => {
  it("pinCacheEntry is not exported", async () => {
    const exports = await import("../tools/data-search");
    expect(exports).not.toHaveProperty("pinCacheEntry");
  });

  it("readDbCache does not select pinned column", async () => {
    const dbChain = mockDbRead({
      data: { type: "FeatureCollection", features: [] },
      profile: STUB_PROFILE,
      source: "test",
      description: "no-pin",
      resolution_status: null,
      created_at: new Date().toISOString(),
      normalized_meta: null,
    });

    await getCachedData("pin-test");

    // Verify the SELECT doesn't include "pinned" or "expires_at"
    const selectArg = dbChain.select.mock.calls[0][0] as string;
    expect(selectArg).not.toContain("pinned");
    expect(selectArg).not.toContain("expires_at");
  });
});

describe("saved maps independence from cache", () => {
  it("readDurableDataset does not depend on data_cache", async () => {
    // The artifact read path (readDurableDataset) reads from dataset_artifacts +
    // Supabase Storage. It never touches the data_cache table. Verify this by
    // checking that the only table it queries is "dataset_artifacts".
    //
    // We use a separate mock import to avoid polluting the data-search mocks.
    const { readDurableDataset } = await vi.importActual<
      typeof import("../tools/dataset-storage")
    >("../tools/dataset-storage");

    // readDurableDataset calls getServiceClient() internally — with our mock
    // it gets mockClient. Track which tables are queried.
    const queriedTables: string[] = [];
    mockFrom.mockImplementation((table: string) => {
      queriedTables.push(table);
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }),
      };
    });

    await readDurableDataset("00000000-0000-0000-0000-000000000000");

    // Should query dataset_artifacts, never data_cache
    expect(queriedTables).toContain("dataset_artifacts");
    expect(queriedTables).not.toContain("data_cache");
  });

  it("artifact-backed map data survives cache expiry", async () => {
    // Simulate: cache entry for a key has expired, but artifact read still works.
    // This proves new maps don't depend on cache for long-term correctness.

    // 1. Cache is expired — L2 returns entry with old created_at
    mockDbRead({
      data: { type: "FeatureCollection", features: [] },
      profile: STUB_PROFILE,
      source: "test",
      description: "expired cache",
      resolution_status: null,
      created_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      normalized_meta: null,
    });
    const cacheResult = await getCachedData("dead-cache-key");
    expect(cacheResult).toBeNull(); // Cache is correctly expired

    // 2. Artifact read works independently (uses different table + storage)
    const geojsonBlob = JSON.stringify({
      type: "FeatureCollection",
      features: [{ type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: {} }],
    });
    mockFrom.mockImplementation((table: string) => {
      if (table === "dataset_artifacts") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: {
              storage_bucket: "datasets",
              storage_path: "abc123.geojson",
              is_public: true,
              owner_user_id: null,
            },
            error: null,
          }),
        };
      }
      // Should not reach data_cache
      throw new Error(`Unexpected table query: ${table}`);
    });
    mockStorage.from.mockReturnValue({
      download: vi.fn().mockResolvedValue({
        data: new Blob([geojsonBlob]),
        error: null,
      }),
    });

    const { readDurableDataset } = await vi.importActual<
      typeof import("../tools/dataset-storage")
    >("../tools/dataset-storage");

    const artifactResult = await readDurableDataset("00000000-0000-0000-0000-000000000001");
    expect(artifactResult).not.toBeNull();
    expect(artifactResult!.type).toBe("FeatureCollection");
    expect(artifactResult!.features).toHaveLength(1);
  });
});
