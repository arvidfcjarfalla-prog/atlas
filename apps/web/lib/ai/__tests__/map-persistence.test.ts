/**
 * Persistence baseline tests — save / reopen / publish / duplicate / by-slug.
 *
 * Verify behavioral contracts of the map persistence layer so the main track
 * can change cache/artifact/storage internals without silent regressions.
 *
 * Strategy: import route handlers directly, mock Supabase, drive with Request.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Supabase mock builder ──────────────────────────────────

function mockBuilder(terminalValue: {
  data: unknown;
  error: unknown;
  count?: number | null;
}) {
  const self = (): unknown =>
    new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "single" || prop === "maybeSingle")
            return () => Promise.resolve(terminalValue);
          if (prop === "then")
            return (resolve: (v: unknown) => void) => resolve(terminalValue);
          return (..._args: unknown[]) => self();
        },
      },
    );
  return self();
}

function makeSupabaseMock(overrides: {
  user?: { id: string } | null;
  selectResult?: { data: unknown; error: unknown; count?: number | null };
  insertResult?: { data: unknown; error: unknown };
  updateResult?: { data: unknown; error: unknown };
}) {
  const {
    user = { id: "user-1" },
    selectResult = { data: null, error: null },
    insertResult = { data: null, error: null },
    updateResult = { data: null, error: null },
  } = overrides;

  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: user ? null : { message: "not authenticated" },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue(mockBuilder(selectResult)),
      insert: vi.fn().mockReturnValue(mockBuilder(insertResult)),
      update: vi.fn().mockReturnValue(mockBuilder(updateResult)),
      delete: vi.fn().mockReturnValue(mockBuilder({ data: null, error: null })),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(selectResult),
    })),
  };
}

// ─── Module mocks ───────────────────────────────────────────

let currentSupabaseMock: ReturnType<typeof makeSupabaseMock>;
let currentServiceMock: ReturnType<typeof makeSupabaseMock> | null = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => Promise.resolve(currentSupabaseMock)),
}));

vi.mock("@/lib/supabase/service", () => ({
  getServiceClient: vi.fn(() => currentServiceMock),
}));

vi.mock("@/lib/ai/tools/data-search", () => ({
  getCachedData: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/ai/tools/dataset-storage", () => ({
  ensureDurableDataset: vi.fn().mockResolvedValue("artifact-123"),
  promoteArtifactToPublic: vi.fn().mockResolvedValue("artifact-123-public"),
}));

vi.mock("@/lib/logger", () => ({
  log: vi.fn(),
}));

// ─── Route imports ──────────────────────────────────────────

// @ts-ignore — path resolved at runtime via Vitest
import { GET as listMaps, POST as createMap } from "../../../app/api/maps/route";
// @ts-ignore
import {
  GET as getMap,
  PATCH as patchMap,
} from "../../../app/api/maps/[id]/route";
// @ts-ignore
import { POST as duplicateMap } from "../../../app/api/maps/[id]/duplicate/route";
// @ts-ignore
import { GET as getBySlug } from "../../../app/api/maps/by-slug/[slug]/route";
import { getCachedData } from "../tools/data-search";
import {
  ensureDurableDataset,
  promoteArtifactToPublic,
} from "../tools/dataset-storage";

// ─── Helpers ────────────────────────────────────────────────

function makeIdParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function makeSlugParams(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

const VALID_MANIFEST = {
  version: 1,
  title: "Test Map",
  layers: [{ id: "l1", label: "Layer", sourceType: "geojson-url" }],
};

function makePostBody(overrides: Record<string, unknown> = {}) {
  return {
    prompt: "Show population in Sweden",
    manifest: VALID_MANIFEST,
    geojson_url: "/api/geo/cached/test-key",
    ...overrides,
  };
}

function makeMapRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "map-1",
    user_id: "user-1",
    title: "Test Map",
    description: null,
    prompt: "population",
    manifest: VALID_MANIFEST,
    geojson_url: "/api/geo/cached/test-key",
    thumbnail_url: null,
    is_public: false,
    slug: null,
    chat_history: [],
    artifact_id: "artifact-123",
    data_status: "ok",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────

describe("POST /api/maps — save new map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    currentSupabaseMock = makeSupabaseMock({ user: null });
    const req = new Request("http://localhost/api/maps", {
      method: "POST",
      body: JSON.stringify(makePostBody()),
    });
    const res = await createMap(req);
    expect(res.status).toBe(401);
  });

  it("returns 400 when prompt is missing", async () => {
    currentSupabaseMock = makeSupabaseMock({});
    const req = new Request("http://localhost/api/maps", {
      method: "POST",
      body: JSON.stringify({ manifest: VALID_MANIFEST }),
    });
    const res = await createMap(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/prompt/i);
  });

  it("returns 400 when manifest is not an object", async () => {
    currentSupabaseMock = makeSupabaseMock({});
    const req = new Request("http://localhost/api/maps", {
      method: "POST",
      body: JSON.stringify({ prompt: "test", manifest: "not-an-object" }),
    });
    const res = await createMap(req);
    expect(res.status).toBe(400);
  });

  it("returns 400 when manifest lacks required fields", async () => {
    currentSupabaseMock = makeSupabaseMock({});
    const req = new Request("http://localhost/api/maps", {
      method: "POST",
      body: JSON.stringify({ prompt: "test", manifest: { foo: "bar" } }),
    });
    const res = await createMap(req);
    expect(res.status).toBe(400);
  });

  it("saves with artifact_id when cache hit + ensureDurableDataset succeeds", async () => {
    const mockInsertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "new-map",
            title: "Test Map",
            artifact_id: "artifact-123",
            created_at: "2026-01-01",
          },
          error: null,
        }),
      }),
    };
    currentSupabaseMock = makeSupabaseMock({});
    currentSupabaseMock.from = vi.fn(
      () =>
        ({
          insert: vi.fn().mockReturnValue(mockInsertChain),
          select: vi
            .fn()
            .mockReturnValue(mockBuilder({ data: null, error: null })),
        }) as unknown,
    ) as ReturnType<typeof makeSupabaseMock>["from"];

    vi.mocked(getCachedData).mockResolvedValue({
      features: [],
      source: "test",
      profile: {},
      description: "test data",
    } as never);

    const req = new Request("http://localhost/api/maps", {
      method: "POST",
      body: JSON.stringify(makePostBody()),
    });
    const res = await createMap(req);
    expect(res.status).toBe(201);
    expect(vi.mocked(ensureDurableDataset)).toHaveBeenCalledWith(
      expect.objectContaining({ cacheKey: "test-key", userId: "user-1" }),
    );
  });

  it("sets data_status=legacy when artifact creation fails", async () => {
    vi.mocked(getCachedData).mockResolvedValue({
      features: [],
      source: "test",
      profile: {},
      description: "test",
    } as never);
    vi.mocked(ensureDurableDataset).mockResolvedValue(null);

    let insertedRow: Record<string, unknown> = {};
    const mockInsertChain = {
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "new-map",
            title: "Test",
            artifact_id: null,
            created_at: "2026-01-01",
          },
          error: null,
        }),
      }),
    };
    currentSupabaseMock = makeSupabaseMock({});
    currentSupabaseMock.from = vi.fn(
      () =>
        ({
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRow = row;
            return mockInsertChain;
          }),
        }) as unknown,
    ) as ReturnType<typeof makeSupabaseMock>["from"];

    const req = new Request("http://localhost/api/maps", {
      method: "POST",
      body: JSON.stringify(makePostBody()),
    });
    await createMap(req);
    expect(insertedRow.data_status).toBe("legacy");
    expect(insertedRow.artifact_id).toBeNull();
  });
});

describe("GET /api/maps/:id — reopen map", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 for nonexistent map", async () => {
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: null, error: { message: "not found" } },
    });
    const req = new Request("http://localhost/api/maps/nonexistent");
    const res = await getMap(req, makeIdParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("returns map for owner", async () => {
    const row = makeMapRow();
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: row, error: null },
    });
    const req = new Request("http://localhost/api/maps/map-1");
    const res = await getMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.map.id).toBe("map-1");
    expect(body.map.artifact_id).toBe("artifact-123");
  });

  it("blocks non-owner from private map", async () => {
    const row = makeMapRow({ user_id: "other-user", is_public: false });
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: row, error: null },
    });
    const req = new Request("http://localhost/api/maps/map-1");
    const res = await getMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(404);
  });

  it("allows anyone to read a public map", async () => {
    const row = makeMapRow({ user_id: "other-user", is_public: true });
    currentSupabaseMock = makeSupabaseMock({
      user: null,
      selectResult: { data: row, error: null },
    });
    const req = new Request("http://localhost/api/maps/map-1");
    const res = await getMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(200);
  });

  it("returns artifact_id and data_status in response", async () => {
    const row = makeMapRow({ artifact_id: "art-abc", data_status: "ok" });
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: row, error: null },
    });
    const req = new Request("http://localhost/api/maps/map-1");
    const res = await getMap(req, makeIdParams("map-1"));
    const body = await res.json();
    expect(body.map.artifact_id).toBe("art-abc");
    expect(body.map.data_status).toBe("ok");
  });

  it("returns legacy map without artifact", async () => {
    const row = makeMapRow({ artifact_id: null, data_status: "legacy" });
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: row, error: null },
    });
    const req = new Request("http://localhost/api/maps/map-1");
    const res = await getMap(req, makeIdParams("map-1"));
    const body = await res.json();
    expect(body.map.artifact_id).toBeNull();
    expect(body.map.data_status).toBe("legacy");
  });
});

describe("PATCH /api/maps/:id — update & publish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    currentSupabaseMock = makeSupabaseMock({ user: null });
    const req = new Request("http://localhost/api/maps/map-1", {
      method: "PATCH",
      body: JSON.stringify({ title: "new title" }),
    });
    const res = await patchMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(401);
  });

  it("returns 400 when no fields provided", async () => {
    currentSupabaseMock = makeSupabaseMock({});
    const req = new Request("http://localhost/api/maps/map-1", {
      method: "PATCH",
      body: JSON.stringify({}),
    });
    const res = await patchMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(400);
  });

  it("calls promoteArtifactToPublic when publishing with artifact", async () => {
    const currentMap = {
      slug: null,
      title: "BNP i Europa",
      artifact_id: "art-1",
    };
    const updatedMap = {
      id: "map-1",
      title: "BNP i Europa",
      is_public: true,
      slug: "bnp-i-europa-x123",
      updated_at: "2026-01-01",
    };

    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: currentMap, error: null }),
    };
    const updateChain = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: updatedMap, error: null }),
      }),
    };

    currentSupabaseMock = makeSupabaseMock({});
    currentSupabaseMock.from = vi.fn(
      () =>
        ({
          select: vi.fn().mockReturnValue(selectChain),
          update: vi.fn().mockReturnValue(updateChain),
        }) as unknown,
    ) as ReturnType<typeof makeSupabaseMock>["from"];

    vi.mocked(promoteArtifactToPublic).mockResolvedValue("art-1");

    const req = new Request("http://localhost/api/maps/map-1", {
      method: "PATCH",
      body: JSON.stringify({ is_public: true }),
    });
    const res = await patchMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(200);
    expect(vi.mocked(promoteArtifactToPublic)).toHaveBeenCalledWith(
      "art-1",
      "user-1",
    );
  });

  it("returns 500 when artifact promotion fails", async () => {
    const currentMap = { slug: null, title: "Test", artifact_id: "art-1" };

    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: currentMap, error: null }),
    };

    currentSupabaseMock = makeSupabaseMock({});
    currentSupabaseMock.from = vi.fn(
      () =>
        ({
          select: vi.fn().mockReturnValue(selectChain),
        }) as unknown,
    ) as ReturnType<typeof makeSupabaseMock>["from"];

    vi.mocked(promoteArtifactToPublic).mockResolvedValue(null);

    const req = new Request("http://localhost/api/maps/map-1", {
      method: "PATCH",
      body: JSON.stringify({ is_public: true }),
    });
    const res = await patchMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toMatch(/dataset/i);
  });

  it("does not promote old artifact when geojson_url changes in same request as is_public", async () => {
    // Scenario: user changes dataset and publishes in the same auto-save.
    // The old artifact_id should be nulled, and promoteArtifactToPublic must
    // NOT be called with the old artifact — otherwise the stale data gets
    // reattached.

    // DB state: map has artifact-old and geojson_url "/api/geo/cached/old-key"
    const geojsonUrlRow = {
      geojson_url: "/api/geo/cached/old-key",
      artifact_id: "artifact-old",
    };
    const publishRow = {
      slug: null,
      title: "Map with changed data",
      artifact_id: "artifact-old",
    };
    const updatedMap = {
      id: "map-1",
      title: "Map with changed data",
      is_public: true,
      slug: "map-with-changed-data-a1b2",
      updated_at: "2026-01-01",
    };

    // The route does two sequential selects from "maps":
    // 1. select("geojson_url, artifact_id") — for the unlink check
    // 2. select("slug, title, artifact_id") — for publish logic
    let selectCallCount = 0;
    const selectResults = [geojsonUrlRow, publishRow];

    const updateChain = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: updatedMap, error: null }),
      }),
    };

    currentSupabaseMock = makeSupabaseMock({});
    currentSupabaseMock.from = vi.fn(
      () =>
        ({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockImplementation(() => {
              const result = selectResults[selectCallCount] ?? null;
              selectCallCount++;
              return Promise.resolve({ data: result, error: null });
            }),
          }),
          update: vi.fn((patchArg: Record<string, unknown>) => {
            // Capture the final patch to verify artifact_id is null
            Object.assign(capturedPatch, patchArg);
            return updateChain;
          }),
        }) as unknown,
    ) as ReturnType<typeof makeSupabaseMock>["from"];

    const capturedPatch: Record<string, unknown> = {};

    const req = new Request("http://localhost/api/maps/map-1", {
      method: "PATCH",
      body: JSON.stringify({
        geojson_url: "/api/geo/cached/new-key",
        is_public: true,
      }),
    });
    const res = await patchMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(200);

    // The old artifact must NOT have been promoted
    expect(vi.mocked(promoteArtifactToPublic)).not.toHaveBeenCalled();

    // The patch must have artifact_id = null (unlinked)
    expect(capturedPatch.artifact_id).toBeNull();
    expect(capturedPatch.data_status).toBe("legacy");
  });

  it("publishes legacy map without artifact (degraded but functional)", async () => {
    const currentMap = { slug: null, title: "Legacy", artifact_id: null };
    const updatedMap = {
      id: "map-1",
      title: "Legacy",
      is_public: true,
      slug: "legacy-a1b2",
      updated_at: "2026-01-01",
    };

    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: currentMap, error: null }),
    };
    const updateChain = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: updatedMap, error: null }),
      }),
    };

    currentSupabaseMock = makeSupabaseMock({});
    currentSupabaseMock.from = vi.fn(
      () =>
        ({
          select: vi.fn().mockReturnValue(selectChain),
          update: vi.fn().mockReturnValue(updateChain),
        }) as unknown,
    ) as ReturnType<typeof makeSupabaseMock>["from"];

    const req = new Request("http://localhost/api/maps/map-1", {
      method: "PATCH",
      body: JSON.stringify({ is_public: true }),
    });
    const res = await patchMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(200);
    expect(vi.mocked(promoteArtifactToPublic)).not.toHaveBeenCalled();
  });
});

describe("POST /api/maps/:id/duplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    currentSupabaseMock = makeSupabaseMock({ user: null });
    const req = new Request("http://localhost/api/maps/map-1/duplicate", {
      method: "POST",
    });
    const res = await duplicateMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(401);
  });

  it("returns 404 when source map not found", async () => {
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: null, error: { message: "not found" } },
    });
    const req = new Request(
      "http://localhost/api/maps/nonexistent/duplicate",
      { method: "POST" },
    );
    const res = await duplicateMap(req, makeIdParams("nonexistent"));
    expect(res.status).toBe(404);
  });

  it("shares artifact_id with the copy (immutable reference)", async () => {
    const source = {
      title: "Original",
      manifest: VALID_MANIFEST,
      geojson_url: "/api/geo/cached/k",
      prompt: "pop",
      artifact_id: "artifact-shared",
    };

    let insertedRow: Record<string, unknown> = {};
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: source, error: null }),
    };
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: { id: "copy-1" }, error: null }),
      }),
    };

    currentSupabaseMock = makeSupabaseMock({});
    currentSupabaseMock.from = vi.fn(
      () =>
        ({
          select: vi.fn().mockReturnValue(selectChain),
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRow = row;
            return insertChain;
          }),
        }) as unknown,
    ) as ReturnType<typeof makeSupabaseMock>["from"];

    const req = new Request("http://localhost/api/maps/map-1/duplicate", {
      method: "POST",
    });
    const res = await duplicateMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(201);
    expect(insertedRow.artifact_id).toBe("artifact-shared");
    expect(insertedRow.is_public).toBe(false);
    expect(insertedRow.title).toBe("Original (kopia)");
  });

  it("sets data_status=legacy for legacy source maps", async () => {
    const source = {
      title: "Old Map",
      manifest: VALID_MANIFEST,
      geojson_url: "/api/geo/cached/k",
      prompt: "pop",
      artifact_id: null,
    };

    let insertedRow: Record<string, unknown> = {};
    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: source, error: null }),
    };
    const insertChain = {
      select: vi.fn().mockReturnValue({
        single: vi
          .fn()
          .mockResolvedValue({ data: { id: "copy-2" }, error: null }),
      }),
    };

    currentSupabaseMock = makeSupabaseMock({});
    currentSupabaseMock.from = vi.fn(
      () =>
        ({
          select: vi.fn().mockReturnValue(selectChain),
          insert: vi.fn((row: Record<string, unknown>) => {
            insertedRow = row;
            return insertChain;
          }),
        }) as unknown,
    ) as ReturnType<typeof makeSupabaseMock>["from"];

    const req = new Request("http://localhost/api/maps/map-1/duplicate", {
      method: "POST",
    });
    await duplicateMap(req, makeIdParams("map-1"));
    expect(insertedRow.data_status).toBe("legacy");
    expect(insertedRow.artifact_id).toBeNull();
  });
});

describe("GET /api/maps/by-slug/:slug — public map access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns status=public for a public map", async () => {
    const row = makeMapRow({ is_public: true, slug: "test-map" });
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: row, error: null },
    });
    const req = new Request("http://localhost/api/maps/by-slug/test-map");
    const res = await getBySlug(req, makeSlugParams("test-map"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("public");
    expect(body.map.id).toBe("map-1");
  });

  it("returns status=owner for own non-public map", async () => {
    const row = makeMapRow({ is_public: false, slug: "my-map" });
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: row, error: null },
    });
    const req = new Request("http://localhost/api/maps/by-slug/my-map");
    const res = await getBySlug(req, makeSlugParams("my-map"));
    const body = await res.json();
    expect(body.status).toBe("owner");
  });

  it("returns status=private (403) for another user's private map", async () => {
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: null, error: null },
    });
    currentServiceMock = makeSupabaseMock({
      selectResult: { data: null, error: null, count: 1 },
    });

    const req = new Request(
      "http://localhost/api/maps/by-slug/private-map",
    );
    const res = await getBySlug(req, makeSlugParams("private-map"));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.status).toBe("private");
  });

  it("returns status=not_found (404) for nonexistent map", async () => {
    currentSupabaseMock = makeSupabaseMock({
      selectResult: { data: null, error: null },
    });
    currentServiceMock = makeSupabaseMock({
      selectResult: { data: null, error: null, count: 0 },
    });

    const req = new Request("http://localhost/api/maps/by-slug/nope");
    const res = await getBySlug(req, makeSlugParams("nope"));
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.status).toBe("not_found");
  });
});

describe("slugify — pure function", () => {
  let slugify: (title: string) => string;

  beforeEach(async () => {
    const mod = await import("../../utils/slugify");
    slugify = mod.slugify;
  });

  it("strips Swedish diacritics", () => {
    const slug = slugify("Årets bästa karta i Malmö");
    expect(slug).not.toMatch(/[åäöÅÄÖ]/);
    expect(slug).toMatch(/^arets-basta-karta-i-malmo-[a-z0-9]{4}$/);
  });

  it("handles empty title", () => {
    const slug = slugify("");
    expect(slug).toMatch(/^[a-z0-9]{4}$/);
  });

  it("caps length at 60 chars + suffix", () => {
    const long = "a".repeat(100);
    const slug = slugify(long);
    expect(slug.length).toBeLessThanOrEqual(65);
  });

  it("collapses multiple spaces/hyphens", () => {
    const slug = slugify("hello   world---test");
    expect(slug).toMatch(/^hello-world-test-[a-z0-9]{4}$/);
  });
});

describe("saved editor data flow contracts", () => {
  /**
   * Behavioral tests for the saved-editor data lifecycle.
   *
   * The editor component (map/[id]/page.tsx) has heavy deps (MapLibre, MapShell)
   * that make full React rendering impractical. Instead, we test:
   * 1. Server-side contracts via PATCH route (behavioral)
   * 2. Client-side invariants via source analysis (structural, where behavioral
   *    is not feasible without a full render)
   *
   * The PATCH tests exercise real route code and prove the artifact-unlink and
   * save-order guarantees. The structural tests guard the remaining client-side
   * invariants (profile freshness, mapRow update, upload removal).
   */

  let source: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    const fs = await import("node:fs/promises");
    source = await fs.readFile(
      new URL("../../../app/app/(editor)/map/[id]/page.tsx", import.meta.url),
      "utf-8",
    );
  });

  // ── Behavioral: PATCH route ────────────────────────────────

  it("sequential PATCHes: manifest-only then data-URL update correctly unlinks artifact", async () => {
    // Simulates the real autoSave sequence after handleManifestUpdate:
    // 1. First autoSave fires with manifest only (no dataUrl)
    // 2. Fetch validates new GeoJSON
    // 3. Second autoSave fires with manifest + new dataUrl
    //
    // The second PATCH must null artifact_id because geojson_url changed.

    const existingMap = {
      geojson_url: "/api/geo/cached/old-key",
      artifact_id: "artifact-old",
      slug: null,
      title: "Test",
    };

    const updatedMap = {
      id: "map-1",
      title: "Test",
      is_public: false,
      slug: null,
      updated_at: "2026-01-02",
    };

    let capturedPatch: Record<string, unknown> = {};

    const selectChain = {
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: existingMap, error: null }),
    };
    const updateChain = {
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: updatedMap, error: null }),
      }),
    };

    currentSupabaseMock = makeSupabaseMock({});
    currentSupabaseMock.from = vi.fn(
      () =>
        ({
          select: vi.fn().mockReturnValue(selectChain),
          update: vi.fn((patch: Record<string, unknown>) => {
            capturedPatch = patch;
            return updateChain;
          }),
        }) as unknown,
    ) as ReturnType<typeof makeSupabaseMock>["from"];

    // Second PATCH: includes the new geojson_url (data validated)
    const req = new Request("http://localhost/api/maps/map-1", {
      method: "PATCH",
      body: JSON.stringify({
        manifest: VALID_MANIFEST,
        geojson_url: "/api/geo/cached/new-key",
      }),
    });
    const res = await patchMap(req, makeIdParams("map-1"));
    expect(res.status).toBe(200);

    // The old artifact must be unlinked
    expect(capturedPatch.artifact_id).toBeNull();
    expect(capturedPatch.data_status).toBe("legacy");
    expect(capturedPatch.geojson_url).toBe("/api/geo/cached/new-key");
  });

  // ── Structural: client-side invariants ─────────────────────

  it("handleManifestUpdate: only persists new dataUrl after fetch validates it", () => {
    // The autoSave with dataUrl must be INSIDE the .then() success handler,
    // not called synchronously before the fetch resolves.
    const updateFn = source.slice(
      source.indexOf("const handleManifestUpdate"),
      source.indexOf("],\n  );", source.indexOf("const handleManifestUpdate")) + 6,
    );

    // First autoSave call should be manifest-only (no dataUrl argument)
    // before the fetch chain
    const beforeFetch = updateFn.slice(0, updateFn.indexOf("fetch(dataUrl)"));
    expect(beforeFetch).toContain("autoSave(newManifest)");

    // Second autoSave call with dataUrl must be inside the .then() chain
    const insideThen = updateFn.slice(
      updateFn.indexOf(".then((geo)"),
      updateFn.indexOf(".catch("),
    );
    expect(insideThen).toContain("autoSave(newManifest, dataUrl)");
  });

  it("handleManifestUpdate: updates mapRow when dataset changes", () => {
    // After a successful data fetch, mapRow must be updated so that
    // handleRegenerate reads the new geojson_url and null artifact_id
    // instead of stale values from the initial load.
    const updateFn = source.slice(
      source.indexOf("const handleManifestUpdate"),
      source.indexOf("],\n  );", source.indexOf("const handleManifestUpdate")) + 6,
    );

    const insideThen = updateFn.slice(
      updateFn.indexOf(".then((geo)"),
      updateFn.indexOf(".catch("),
    );

    // Must update mapRow with new geojson_url and null artifact_id
    expect(insideThen).toContain("setMapRow(");
    expect(insideThen).toContain("geojson_url: dataUrl");
    expect(insideThen).toContain("artifact_id: null");
  });

  it("handleManifestUpdate: profiles new GeoJSON on dataset change", () => {
    const updateFn = source.slice(
      source.indexOf("const handleManifestUpdate"),
      source.indexOf("],\n  );", source.indexOf("const handleManifestUpdate")) + 6,
    );

    const insideThen = updateFn.slice(
      updateFn.indexOf(".then((geo)"),
      updateFn.indexOf(".catch("),
    );

    expect(insideThen).toContain("setDataProfile(profileDataset(geo))");
  });

  it("load effect: profiles GeoJSON on initial load", () => {
    const loadBlock = source.slice(
      source.indexOf("// ── Load map"),
      source.indexOf("// ── Warn on navigation"),
    );
    expect(loadBlock).toContain("setDataProfile(profileDataset(geo))");
  });

  it("saved editor does not expose file upload", () => {
    // Upload in saved editor was removed because it persisted only in
    // React state. Both the ChatPanel prop and drag-drop overlay must be absent.
    const chatPanelUsages = source.match(/<ChatPanel[\s\S]*?\/>/g) ?? [];
    for (const usage of chatPanelUsages) {
      expect(usage).not.toContain("onFileUpload");
    }
    expect(source).not.toContain("onDrop={handleDrop}");
  });
});
