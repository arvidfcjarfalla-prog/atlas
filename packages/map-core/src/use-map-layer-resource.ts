"use client";

import { useEffect, useRef } from "react";
import type { MaplibreMap } from "./types";
import { useMap } from "./use-map";

export interface MapResourceSignal {
  cancelled: boolean;
}

export interface MapResourceSetupContext {
  /** beforeLayerId already resolved — undefined if the layer isn't on the map yet. */
  insertBefore: string | undefined;
  signal: MapResourceSignal;
}

export interface MapLayerResourceSpec {
  /** Source ID added by setup. Used for shared-source refcount and orphan cleanup. */
  sourceId: string;
  /** Layer IDs added by setup, in add order. Removed in reverse on unmount. */
  layerIds: readonly string[];
  /** Gate — all of map/isReady/enabled must be truthy. Default true. */
  enabled?: boolean;
  /** beforeLayerId pass-through. Helper resolves it to undefined if the layer is missing. */
  beforeLayerId?: string;
  /** If true, source is NOT removed on unmount (for resources like 3D terrain that share a source). */
  keepSourceOnUnmount?: boolean;
  /**
   * If true, setup failures are swallowed silently instead of logged via console.warn.
   * Use for genuinely optional decorative layers (e.g. tectonic boundaries fetched from
   * /data/plates.geojson, contour lines behind a dynamic import) where a network or
   * asset hiccup should not surface as console noise. Orphan cleanup still runs.
   */
  silentOnFailure?: boolean;
  /** Extra deps appended to the setup effect's dep array. */
  deps?: readonly unknown[];
  /**
   * Add source + layers. Idempotent via map.getSource / map.getLayer.
   * May return a Promise; check signal.cancelled between awaits before mutating the map.
   */
  setup: (map: MaplibreMap, ctx: MapResourceSetupContext) => void | Promise<void>;
  /** Called before layer removal on unmount (e.g. map.setTerrain(null)). */
  teardown?: (map: MaplibreMap) => void;
}

export interface MapResourceState {
  added: boolean;
  acquired: boolean;
}

// Module-scoped refcount keyed by sourceId. Exported via __internal for tests.
const sourceRefCounts = new Map<string, number>();

export const __internal = {
  sourceRefCounts,
  resolveInsertBefore(
    map: Pick<MaplibreMap, "getLayer">,
    beforeLayerId: string | undefined,
  ): string | undefined {
    if (!beforeLayerId) return undefined;
    return map.getLayer(beforeLayerId) ? beforeLayerId : undefined;
  },
  acquire(sourceId: string): void {
    sourceRefCounts.set(sourceId, (sourceRefCounts.get(sourceId) ?? 0) + 1);
  },
  release(sourceId: string): { shouldRemoveSource: boolean } {
    const current = sourceRefCounts.get(sourceId) ?? 0;
    const next = Math.max(0, current - 1);
    if (next === 0) {
      sourceRefCounts.delete(sourceId);
    } else {
      sourceRefCounts.set(sourceId, next);
    }
    return { shouldRemoveSource: next === 0 };
  },
  resetRefCounts(): void {
    sourceRefCounts.clear();
  },
};

function warnSetupFailed(sourceId: string, err: unknown) {
  // eslint-disable-next-line no-console
  console.warn(`[useMapLayerResource] setup failed for ${sourceId}`, err);
}

/**
 * Pure lifecycle functions — exported so tests can exercise observable map mutations
 * (addSource / addLayer / removeSource) without a React renderer.
 */
export function runResourceSetup(
  map: MaplibreMap,
  spec: MapLayerResourceSpec,
  state: MapResourceState,
  signal: MapResourceSignal,
): void | Promise<void> {
  if (state.added) return;

  const insertBefore = __internal.resolveInsertBefore(map, spec.beforeLayerId);

  const onError = (err: unknown) => {
    if (signal.cancelled) return;
    try {
      const anyLayerStuck = spec.layerIds.some((id) => map.getLayer(id));
      if (!anyLayerStuck && map.getSource(spec.sourceId)) {
        map.removeSource(spec.sourceId);
      }
    } catch {
      // Map may already be removed.
    }
    if (state.acquired) {
      __internal.release(spec.sourceId);
      state.acquired = false;
    }
    if (!spec.silentOnFailure) warnSetupFailed(spec.sourceId, err);
  };

  __internal.acquire(spec.sourceId);
  state.acquired = true;

  try {
    const result = spec.setup(map, { insertBefore, signal });
    if (result && typeof (result as Promise<void>).then === "function") {
      return (result as Promise<void>).then(
        () => {
          if (!signal.cancelled) state.added = true;
        },
        onError,
      );
    }
    state.added = true;
  } catch (err) {
    onError(err);
  }
  return;
}

export function runResourceCleanup(
  map: MaplibreMap,
  spec: MapLayerResourceSpec,
  state: MapResourceState,
): void {
  if (!state.acquired) return;

  try {
    if (state.added) {
      spec.teardown?.(map);
      for (let i = spec.layerIds.length - 1; i >= 0; i--) {
        const id = spec.layerIds[i];
        if (map.getLayer(id)) map.removeLayer(id);
      }
    }
  } catch {
    // Map may already be removed.
  }

  const { shouldRemoveSource } = __internal.release(spec.sourceId);
  if (shouldRemoveSource && !spec.keepSourceOnUnmount) {
    try {
      if (map.getSource(spec.sourceId)) map.removeSource(spec.sourceId);
    } catch {
      // Map may already be removed.
    }
  }

  state.acquired = false;
  state.added = false;
}

/**
 * Shared lifecycle for MapLibre decorator layers (hillshade, land-mask, contour, etc.).
 *
 * Handles the pattern duplicated across terrain hooks: idempotent add gated by a ref,
 * beforeLayerId resolution, orphan-source cleanup on setup failure, and refcounted
 * removal on unmount so hooks that declare the same sourceId don't uproot each other.
 */
export function useMapLayerResource(spec: MapLayerResourceSpec): void {
  const { map, isReady } = useMap();
  const stateRef = useRef<MapResourceState>({ added: false, acquired: false });
  const signalRef = useRef<MapResourceSignal>({ cancelled: false });

  const enabled = spec.enabled ?? true;
  const deps = spec.deps ?? [];

  useEffect(() => {
    if (!map || !isReady || !enabled) return;

    const signal: MapResourceSignal = { cancelled: false };
    signalRef.current = signal;
    void runResourceSetup(map, spec, stateRef.current, signal);

    return () => {
      // Runs on deps change, `enabled` flipping true→false, or unmount.
      // Tear down so the next setup sees a clean slate and so toggle-off
      // actually removes the layers from the map.
      signal.cancelled = true;
      if (stateRef.current.added) {
        runResourceCleanup(map, spec, stateRef.current);
      }
    };
    // spec is intentionally not in deps — its identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, isReady, enabled, spec.beforeLayerId, spec.sourceId, ...deps]);

  // Safety net for the `map → null` transition and any edge case where the
  // main effect's cleanup does not fire. `state.acquired` guards against
  // double-release if both effects clean up.
  useEffect(() => {
    return () => {
      if (!map) return;
      signalRef.current.cancelled = true;
      if (stateRef.current.added) {
        runResourceCleanup(map, spec, stateRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
}
