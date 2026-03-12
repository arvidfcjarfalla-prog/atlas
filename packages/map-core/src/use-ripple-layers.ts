"use client";

import { useEffect, useRef } from "react";
import { useMap } from "./use-map";
import { SEVERITY_HEX } from "@atlas/data-models";
import type { GeoEntity } from "@atlas/data-models";

interface UseRippleLayersOptions {
  /** Layer ID prefix — must match the layerId used in useMapLayers. */
  layerId: string;
  /** Entities array — same reference passed to useMapLayers. */
  entities: GeoEntity[];
  /** Insert the ripple layer below this layer ID. */
  beforeLayerId?: string;
}

/** Ripple cycle duration in ms. One full expand-and-fade cycle. */
const CYCLE_MS = 4000;

/** Max age for ripple visibility. Events older than this show no ripple. */
const MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Starting radius of the ripple ring. */
const MIN_RADIUS = 14;

/** Maximum radius the ripple expands to. */
const MAX_RADIUS = 34;

/** Peak stroke opacity at the start of each cycle. */
const MAX_OPACITY = 0.22;

/** Target update interval in ms (~20fps). */
const FRAME_INTERVAL = 50;

/**
 * Adds a per-event ripple animation to fresh high/critical earthquakes.
 *
 * Each event's ripple phase is derived from its occurredAt timestamp,
 * so ripples start when the event appeared and decay naturally over 2 hours.
 * The animation uses MapLibre feature-state for per-feature radius/opacity,
 * updated via a throttled requestAnimationFrame loop.
 *
 * Requires useMapLayers to have already created the source for this layerId,
 * and occurredAt to be included in the GeoJSON feature properties.
 */
export function useRippleLayers({
  layerId,
  entities,
  beforeLayerId,
}: UseRippleLayersOptions) {
  const { map, isReady } = useMap();
  const layerAddedRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Add the ripple circle layer (once, after the source exists)
  useEffect(() => {
    if (!map || !isReady || layerAddedRef.current) return;

    const sourceId = `${layerId}-source`;
    const rippleId = `${layerId}-ripple`;

    // Source must exist (created by useMapLayers)
    if (!map.getSource(sourceId)) return;
    if (map.getLayer(rippleId)) return;

    const colors = SEVERITY_HEX;

    map.addLayer(
      {
        id: rippleId,
        type: "circle",
        source: sourceId,
        filter: [
          "all",
          ["!", ["has", "point_count"]],
          ["in", ["get", "severity"], ["literal", ["critical", "high"]]],
        ],
        paint: {
          "circle-color": "transparent",
          "circle-stroke-color": [
            "match",
            ["get", "severity"],
            "critical", colors.critical,
            colors.high,
          ],
          "circle-stroke-width": 1,
          "circle-radius": [
            "coalesce",
            ["feature-state", "rippleRadius"],
            0,
          ],
          "circle-stroke-opacity": [
            "coalesce",
            ["feature-state", "rippleOpacity"],
            0,
          ],
          "circle-opacity": 0,
        },
      },
      beforeLayerId,
    );

    layerAddedRef.current = true;

    return () => {
      // Don't remove here — cleanup handled by unmount effect below
    };
  }, [map, isReady, layerId, beforeLayerId, entities]);

  // Animation loop — updates feature-state per frame
  useEffect(() => {
    if (!map || !isReady || !layerAddedRef.current) return;

    const sourceId = `${layerId}-source`;

    function getRippleTargets() {
      const targets: Array<{ idx: number; occurredAtMs: number }> = [];
      const now = Date.now();

      for (let i = 0; i < entities.length; i++) {
        const entity = entities[i];
        const severity = entity.severity ?? "low";
        if (severity !== "critical" && severity !== "high") continue;

        const occurredAt = entity.occurredAt;
        if (!occurredAt) continue;

        const occurredAtMs = new Date(occurredAt).getTime();
        const age = now - occurredAtMs;
        if (age > MAX_AGE_MS || age < 0) continue;

        targets.push({ idx: i, occurredAtMs });
      }

      return targets;
    }

    let running = true;

    function tick() {
      if (!running || !map || document.hidden) {
        if (running) {
          timeoutRef.current = setTimeout(() => {
            if (running) animFrameRef.current = requestAnimationFrame(tick);
          }, 500);
        }
        return;
      }

      const now = Date.now();
      const targets = getRippleTargets();

      for (const { idx, occurredAtMs } of targets) {
        const age = now - occurredAtMs;
        const decay = Math.max(0, 1 - age / MAX_AGE_MS);
        if (decay <= 0) continue;

        const phase = ((now - occurredAtMs) % CYCLE_MS) / CYCLE_MS;
        const rippleRadius = MIN_RADIUS + (MAX_RADIUS - MIN_RADIUS) * phase;
        const rippleOpacity = MAX_OPACITY * (1 - phase) * decay;

        try {
          map.setFeatureState(
            { source: sourceId, id: idx },
            { rippleRadius, rippleOpacity },
          );
        } catch {
          // Feature may not exist yet (source data not loaded)
        }
      }

      timeoutRef.current = setTimeout(() => {
        if (running) {
          animFrameRef.current = requestAnimationFrame(tick);
        }
      }, FRAME_INTERVAL);
    }

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      running = false;
      if (animFrameRef.current != null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (timeoutRef.current != null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [map, isReady, layerId, entities]);

  // Cleanup layer on unmount
  useEffect(() => {
    return () => {
      if (!map || !layerAddedRef.current) return;
      const rippleId = `${layerId}-ripple`;
      try {
        if (map.getLayer(rippleId)) map.removeLayer(rippleId);
      } catch {
        // Map may already be removed
      }
      layerAddedRef.current = false;
    };
  }, [map, layerId]);
}
