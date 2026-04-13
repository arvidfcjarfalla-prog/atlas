import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __internal,
  runResourceCleanup,
  runResourceSetup,
  type MapLayerResourceSpec,
  type MapResourceSignal,
  type MapResourceState,
} from "../use-map-layer-resource";
import type { MaplibreMap } from "../types";

// Minimal MapLibre stand-in that tracks observable mutations.
function createMockMap() {
  const sources = new Map<string, unknown>();
  const layers: Array<{ id: string; before?: string }> = [];
  const calls: string[] = [];
  let terrain: unknown = null;

  const map = {
    getSource: (id: string) => sources.get(id),
    addSource: (id: string, spec: unknown) => {
      calls.push(`addSource:${id}`);
      sources.set(id, spec);
    },
    removeSource: (id: string) => {
      calls.push(`removeSource:${id}`);
      sources.delete(id);
    },
    getLayer: (id: string) => layers.find((l) => l.id === id),
    addLayer: (spec: { id: string }, before?: string) => {
      calls.push(`addLayer:${spec.id}${before ? `@${before}` : ""}`);
      layers.push({ id: spec.id, before });
    },
    removeLayer: (id: string) => {
      calls.push(`removeLayer:${id}`);
      for (let i = layers.length - 1; i >= 0; i--) {
        if (layers[i].id === id) layers.splice(i, 1);
      }
    },
    setTerrain: (spec: unknown) => {
      calls.push(`setTerrain:${spec ? "on" : "off"}`);
      terrain = spec;
    },
  };

  return {
    map: map as unknown as MaplibreMap,
    sources,
    layers,
    calls,
    getTerrain: () => terrain,
  };
}

function freshState(): MapResourceState {
  return { added: false, acquired: false };
}

function freshSignal(): MapResourceSignal {
  return { cancelled: false };
}

beforeEach(() => {
  __internal.resetRefCounts();
  // Silence the setup-failure warnings that exercise error paths.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

describe("__internal.resolveInsertBefore", () => {
  it("returns undefined when beforeLayerId is not provided", () => {
    const { map } = createMockMap();
    expect(__internal.resolveInsertBefore(map, undefined)).toBeUndefined();
  });

  it("returns undefined when the named layer is not on the map", () => {
    const { map } = createMockMap();
    expect(__internal.resolveInsertBefore(map, "ghost-layer")).toBeUndefined();
  });

  it("returns the id when the named layer exists", () => {
    const { map } = createMockMap();
    map.addLayer({ id: "existing-layer" } as never);
    expect(__internal.resolveInsertBefore(map, "existing-layer")).toBe("existing-layer");
  });
});

describe("__internal refcount", () => {
  it("release returns shouldRemoveSource=true only when last consumer releases", () => {
    __internal.acquire("shared");
    __internal.acquire("shared");
    expect(__internal.release("shared").shouldRemoveSource).toBe(false);
    expect(__internal.release("shared").shouldRemoveSource).toBe(true);
  });

  it("release clamps at zero and does not go negative", () => {
    expect(__internal.release("unknown").shouldRemoveSource).toBe(true);
    expect(__internal.sourceRefCounts.get("unknown")).toBeUndefined();
  });
});

describe("runResourceSetup — synchronous setup", () => {
  it("resolves insertBefore and invokes setup with it", () => {
    const { map, calls } = createMockMap();
    map.addLayer({ id: "anchor" } as never);
    const setup = vi.fn((m: MaplibreMap, ctx: { insertBefore: string | undefined }) => {
      m.addSource("src", { type: "raster", tiles: [] } as never);
      m.addLayer({ id: "layer", type: "raster", source: "src" } as never, ctx.insertBefore);
    });
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["layer"],
      beforeLayerId: "anchor",
      setup,
    };
    const state = freshState();

    runResourceSetup(map, spec, state, freshSignal());

    expect(setup).toHaveBeenCalledWith(
      map,
      expect.objectContaining({ insertBefore: "anchor" }),
    );
    expect(calls).toContain("addSource:src");
    expect(calls).toContain("addLayer:layer@anchor");
    expect(state.added).toBe(true);
    expect(state.acquired).toBe(true);
    expect(__internal.sourceRefCounts.get("src")).toBe(1);
  });

  it("passes undefined insertBefore when the anchor layer is missing", () => {
    const { map } = createMockMap();
    const setup = vi.fn();
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["layer"],
      beforeLayerId: "missing-anchor",
      setup,
    };

    runResourceSetup(map, spec, freshState(), freshSignal());

    expect(setup.mock.calls[0][1]).toMatchObject({ insertBefore: undefined });
  });

  it("is idempotent when state.added is already true", () => {
    const { map } = createMockMap();
    const setup = vi.fn();
    const spec: MapLayerResourceSpec = { sourceId: "src", layerIds: ["l"], setup };
    const state: MapResourceState = { added: true, acquired: true };

    runResourceSetup(map, spec, state, freshSignal());

    expect(setup).not.toHaveBeenCalled();
  });
});

describe("runResourceSetup — error paths (orphan cleanup)", () => {
  it("removes the source when setup throws after addSource but before any layer lands", () => {
    const { map, sources } = createMockMap();
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["layer-a"],
      setup: (m) => {
        m.addSource("src", { type: "raster", tiles: [] } as never);
        throw new Error("boom");
      },
    };
    const state = freshState();

    runResourceSetup(map, spec, state, freshSignal());

    expect(sources.has("src")).toBe(false);
    expect(state.added).toBe(false);
    expect(state.acquired).toBe(false);
    expect(__internal.sourceRefCounts.get("src")).toBeUndefined();
  });

  it("keeps the source if a layer was successfully added before the throw", () => {
    const { map, sources } = createMockMap();
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["layer-a", "layer-b"],
      setup: (m) => {
        m.addSource("src", { type: "raster", tiles: [] } as never);
        m.addLayer({ id: "layer-a", type: "raster", source: "src" } as never);
        throw new Error("partial");
      },
    };

    runResourceSetup(map, spec, freshState(), freshSignal());

    expect(sources.has("src")).toBe(true);
  });
});

describe("runResourceSetup — async setup", () => {
  it("sets state.added when the promise resolves", async () => {
    const { map, sources, layers } = createMockMap();
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["layer"],
      setup: async (m) => {
        await Promise.resolve();
        m.addSource("src", { type: "geojson", data: { type: "FeatureCollection", features: [] } } as never);
        m.addLayer({ id: "layer", type: "fill", source: "src" } as never);
      },
    };
    const state = freshState();

    await runResourceSetup(map, spec, state, freshSignal());

    expect(state.added).toBe(true);
    expect(sources.has("src")).toBe(true);
    expect(layers.find((l) => l.id === "layer")).toBeDefined();
  });

  it("does not flip state.added when the signal is cancelled before the promise resolves", async () => {
    const { map } = createMockMap();
    const signal = freshSignal();
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["layer"],
      setup: async (m, ctx) => {
        await Promise.resolve();
        if (ctx.signal.cancelled) return;
        m.addSource("src", { type: "geojson", data: {} as never } as never);
      },
    };
    const state = freshState();

    const pending = runResourceSetup(map, spec, state, signal);
    signal.cancelled = true;
    await pending;

    expect(state.added).toBe(false);
  });

  it("respects silentOnFailure and suppresses the console.warn", () => {
    const { map } = createMockMap();
    const warnSpy = vi.mocked(console.warn);
    warnSpy.mockClear();
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["layer"],
      silentOnFailure: true,
      setup: () => {
        throw new Error("optional-feature-unavailable");
      },
    };

    runResourceSetup(map, spec, freshState(), freshSignal());

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("invokes orphan cleanup when async setup rejects", async () => {
    const { map, sources } = createMockMap();
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["layer"],
      setup: async (m) => {
        m.addSource("src", { type: "geojson", data: {} as never } as never);
        throw new Error("async-boom");
      },
    };
    const state = freshState();

    await runResourceSetup(map, spec, state, freshSignal());

    expect(sources.has("src")).toBe(false);
    expect(state.acquired).toBe(false);
    expect(__internal.sourceRefCounts.get("src")).toBeUndefined();
  });
});

describe("runResourceCleanup", () => {
  it("removes layers in reverse order, then the source", () => {
    const { map, calls } = createMockMap();
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["a", "b", "c"],
      setup: (m) => {
        m.addSource("src", { type: "raster", tiles: [] } as never);
        m.addLayer({ id: "a" } as never);
        m.addLayer({ id: "b" } as never);
        m.addLayer({ id: "c" } as never);
      },
    };
    const state = freshState();
    runResourceSetup(map, spec, state, freshSignal());
    calls.length = 0;

    runResourceCleanup(map, spec, state);

    const cleanupCalls = calls.filter(
      (c) => c.startsWith("removeLayer") || c.startsWith("removeSource"),
    );
    expect(cleanupCalls).toEqual([
      "removeLayer:c",
      "removeLayer:b",
      "removeLayer:a",
      "removeSource:src",
    ]);
    expect(state.added).toBe(false);
    expect(state.acquired).toBe(false);
  });

  it("calls teardown before removing layers", () => {
    const { map, calls } = createMockMap();
    const teardown = vi.fn((m: MaplibreMap) => m.setTerrain(null));
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["a"],
      setup: (m) => {
        m.addSource("src", { type: "raster-dem", tiles: [] } as never);
        m.addLayer({ id: "a" } as never);
      },
      teardown,
    };
    const state = freshState();
    runResourceSetup(map, spec, state, freshSignal());
    calls.length = 0;

    runResourceCleanup(map, spec, state);

    expect(calls[0]).toBe("setTerrain:off");
    expect(calls.indexOf("setTerrain:off")).toBeLessThan(calls.indexOf("removeLayer:a"));
  });

  it("preserves the source when keepSourceOnUnmount is true", () => {
    const { map, sources } = createMockMap();
    const spec: MapLayerResourceSpec = {
      sourceId: "shared-src",
      layerIds: [],
      keepSourceOnUnmount: true,
      setup: (m) => {
        m.addSource("shared-src", { type: "raster-dem", tiles: [] } as never);
      },
    };
    const state = freshState();
    runResourceSetup(map, spec, state, freshSignal());

    runResourceCleanup(map, spec, state);

    expect(sources.has("shared-src")).toBe(true);
    expect(__internal.sourceRefCounts.get("shared-src")).toBeUndefined();
  });

  it("is a noop when state.acquired is false", () => {
    const { map, calls } = createMockMap();
    const spec: MapLayerResourceSpec = {
      sourceId: "src",
      layerIds: ["a"],
      setup: () => undefined,
    };

    runResourceCleanup(map, spec, freshState());

    expect(calls).toEqual([]);
  });
});

describe("shared source refcount across two consumers", () => {
  it("removes the source only when the last consumer cleans up", () => {
    const { map, sources } = createMockMap();
    const sharedSetup = (layerId: string) => (m: MaplibreMap, _ctx: MapResourceSetupContextArg) => {
      if (!m.getSource("shared")) {
        m.addSource("shared", { type: "raster-dem", tiles: [] } as never);
      }
      m.addLayer({ id: layerId, type: "hillshade", source: "shared" } as never);
    };
    const specA: MapLayerResourceSpec = {
      sourceId: "shared",
      layerIds: ["layer-a"],
      setup: sharedSetup("layer-a"),
    };
    const specB: MapLayerResourceSpec = {
      sourceId: "shared",
      layerIds: ["layer-b"],
      setup: sharedSetup("layer-b"),
    };
    const stateA = freshState();
    const stateB = freshState();

    runResourceSetup(map, specA, stateA, freshSignal());
    runResourceSetup(map, specB, stateB, freshSignal());
    expect(__internal.sourceRefCounts.get("shared")).toBe(2);

    runResourceCleanup(map, specA, stateA);
    expect(sources.has("shared")).toBe(true);
    expect(__internal.sourceRefCounts.get("shared")).toBe(1);

    runResourceCleanup(map, specB, stateB);
    expect(sources.has("shared")).toBe(false);
  });
});

// Type helper to keep the shared-source test compact without pulling the full
// context type into every setup signature.
type MapResourceSetupContextArg = Parameters<MapLayerResourceSpec["setup"]>[1];
