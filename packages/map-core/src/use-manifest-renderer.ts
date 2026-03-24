"use client";

import { useEffect, useRef, useMemo } from "react";
import maplibregl from "maplibre-gl";
import type { MapLayerMouseEvent, GeoJSONSource } from "maplibre-gl";
import { useMap } from "./use-map";
import type { LayerManifest } from "@atlas/data-models";
import {
  compileLayer,
  type CompiledLayer,
  type CompiledLegendItem,
} from "./manifest-compiler";

interface UseManifestRendererOptions {
  /** Layer manifest to render. */
  layer: LayerManifest;
  /** GeoJSON data or URL string. */
  data: GeoJSON.FeatureCollection | string;
  /** Insert all layers before this layer ID. */
  beforeLayerId?: string;
  /** Callback when a feature is clicked. */
  onFeatureClick?: (properties: Record<string, unknown>) => void;
  /** Callback when a feature is hovered (null on leave). */
  onFeatureHover?: (properties: Record<string, unknown> | null) => void;
}

interface UseManifestRendererResult {
  legendItems: CompiledLegendItem[];
}

/**
 * Renders a LayerManifest on the map using compiled MapLibre layers.
 *
 * Handles source/layer lifecycle, data updates, click/hover interactions,
 * and cleanup on unmount.
 */
export function useManifestRenderer({
  layer,
  data,
  beforeLayerId,
  onFeatureClick,
  onFeatureHover,
}: UseManifestRendererOptions): UseManifestRendererResult {
  const { map, isReady } = useMap();
  const addedRef = useRef(false);
  const prevCompiledRef = useRef<CompiledLayer | null>(null);
  const onClickRef = useRef(onFeatureClick);
  onClickRef.current = onFeatureClick;
  const onHoverRef = useRef(onFeatureHover);
  onHoverRef.current = onFeatureHover;

  // Compile the layer specification
  const compiled: CompiledLayer | null = useMemo(() => {
    if (typeof data === "string") {
      // URL — create a minimal FeatureCollection for compile, actual data loaded by MapLibre
      return compileLayer(layer, { type: "FeatureCollection", features: [] });
    }
    return compileLayer(layer, data);
  }, [layer, data]);

  // Add source + layers
  useEffect(() => {
    if (!map || !isReady || !compiled) return;

    // compiled identity changed — clean up previous layers/sources before adding new ones
    if (prevCompiledRef.current && prevCompiledRef.current !== compiled && addedRef.current) {
      const prev = prevCompiledRef.current;
      try {
        for (let i = prev.layers.length - 1; i >= 0; i--) {
          const id = prev.layers[i].id;
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(prev.sourceId)) map.removeSource(prev.sourceId);
        for (const extraId of Object.keys(prev.extraSources ?? {})) {
          if (map.getSource(extraId)) map.removeSource(extraId);
        }
      } catch {
        // Map may already be in a bad state
      }
      addedRef.current = false;
    }

    prevCompiledRef.current = compiled;

    if (addedRef.current) return;

    try {
      const sourceConfig =
        typeof data === "string"
          ? { ...compiled.sourceConfig, data }
          : compiled.sourceConfig;

      if (!map.getSource(compiled.sourceId)) {
        map.addSource(compiled.sourceId, sourceConfig);
      }

      for (const [extraId, extraConfig] of Object.entries(compiled.extraSources ?? {})) {
        if (!map.getSource(extraId)) {
          map.addSource(extraId, extraConfig);
        }
      }

      for (const layerSpec of compiled.layers) {
        if (!map.getLayer(layerSpec.id)) {
          const insertBefore =
            beforeLayerId && map.getLayer(beforeLayerId)
              ? beforeLayerId
              : undefined;
          map.addLayer(layerSpec, insertBefore);
        }
      }

      addedRef.current = true;
    } catch {
      // Clean up orphaned source
      if (
        map.getSource(compiled.sourceId) &&
        compiled.layers.every((l) => !map.getLayer(l.id))
      ) {
        try {
          map.removeSource(compiled.sourceId);
        } catch {
          /* noop */
        }
      }
    }
  }, [map, isReady, compiled, data, beforeLayerId]);

  // Update data when it changes (inline GeoJSON only)
  useEffect(() => {
    if (!map || !isReady || !compiled || !addedRef.current) return;
    if (typeof data === "string") return;

    const source = map.getSource(compiled.sourceId) as GeoJSONSource | undefined;
    if (source) {
      source.setData(data);
    }
  }, [map, isReady, compiled, data]);

  // Interaction handlers
  useEffect(() => {
    if (!map || !isReady || !compiled || !addedRef.current) return;

    const clickBehavior = layer.interaction?.clickBehavior ?? "popup";
    const hoverEffect = layer.interaction?.hoverEffect ?? "highlight";

    // Find the main interactive layer (first non-cluster layer)
    const interactiveLayerId = compiled.layers.find(
      (l) => !l.id.endsWith("-highlight") && !l.id.endsWith("-cluster-count"),
    )?.id;

    if (!interactiveLayerId) return;

    const canvas = map.getCanvas();
    const tooltipFields = layer.interaction?.tooltipFields ?? [];
    let hoveredFeatureId: string | number | null = null;
    let activePopup: maplibregl.Popup | null = null;
    let hoverPopup: maplibregl.Popup | null = null;

    /** Format a property value for display. */
    function formatValue(v: unknown): string {
      if (v == null) return "–";
      if (typeof v === "number") {
        if (!isFinite(v)) return "–";
        return v >= 1_000_000
          ? `${(v / 1_000_000).toFixed(1)}M`
          : v >= 1_000
            ? `${(v / 1_000).toFixed(1)}k`
            : v % 1 === 0
              ? v.toLocaleString()
              : v.toFixed(2);
      }
      return String(v);
    }

    /** Build HTML for a popup from feature properties + tooltipFields. */
    function buildPopupHTML(props: Record<string, unknown>, fields: string[]): string {
      const name = props["name"] ?? props["NAME"] ?? props["title"] ?? "";
      const rows = fields
        .filter((f) => f !== "name" && f !== "NAME" && f !== "title" && props[f] != null)
        .map((f) => {
          const label = f.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
          return `<tr><td style="color:rgba(200,210,225,0.55);padding:1px 8px 1px 0;font-size:11px">${label}</td><td style="color:rgba(240,245,250,0.90);font-size:12px;font-weight:500;text-align:right">${formatValue(props[f])}</td></tr>`;
        })
        .join("");
      return `<div style="font-family:'Geist',system-ui,sans-serif;line-height:1.4">
        ${name ? `<div style="font-weight:600;font-size:13px;color:rgba(240,245,250,0.95);margin-bottom:${rows ? "6px" : "0"}">${name}</div>` : ""}
        ${rows ? `<table style="border-collapse:collapse">${rows}</table>` : ""}
      </div>`;
    }

    /** Compute the normalized metric value if the layer has normalization config. */
    function getNormalizedValue(props: Record<string, unknown>): number | null {
      const norm = layer.style?.normalization;
      const colorField = layer.style?.colorField;
      if (!norm || !colorField) return null;
      const raw = props[colorField];
      const divisor = props[norm.field];
      if (typeof raw !== "number" || typeof divisor !== "number" || divisor === 0) return null;
      return (raw * (norm.multiplier ?? 1)) / divisor;
    }

    /** Extract a unit suffix from the legend title, e.g. "(%)" → "%", "(USD)" → "USD". */
    const legendTitle = layer.legend?.title ?? "";
    const unitMatch = legendTitle.match(/\(([^)]+)\)\s*$/);
    const unitSuffix = unitMatch ? ` ${unitMatch[1]}` : (legendTitle.toLowerCase().includes("%") ? "%" : "");

    /** Build a short hover label: name + primary metric value + unit. */
    function buildHoverHTML(props: Record<string, unknown>): string | null {
      const name = props["name"] ?? props["NAME"] ?? props["title"];
      if (!name) return null;

      // Prefer the normalized value (e.g. GDP per capita) over the raw field
      const normalized = getNormalizedValue(props);
      let metric = "";
      if (normalized != null) {
        metric = ` <span style="opacity:0.6;font-weight:400">${formatValue(normalized)}${unitSuffix}</span>`;
      } else {
        const metricField = tooltipFields.find(
          (f) => f !== "name" && f !== "NAME" && f !== "title" && props[f] != null,
        );
        if (metricField) {
          metric = ` <span style="opacity:0.6;font-weight:400">${formatValue(props[metricField])}${unitSuffix}</span>`;
        }
      }
      return `<div style="font-family:'Geist',system-ui,sans-serif;font-size:12px;font-weight:500;color:rgba(240,245,250,0.90)">${name}${metric}</div>`;
    }

    const handleMouseEnter = (e: MapLayerMouseEvent) => {
      canvas.style.cursor = "pointer";
      const feature = e.features?.[0];
      if (!feature) return;

      if (hoverEffect === "highlight" && feature.id != null) {
        hoveredFeatureId = feature.id;
        map.setFeatureState(
          { source: compiled.sourceId, id: feature.id },
          { hover: true },
        );
      }

      // Show hover tooltip (if no click popup is open)
      if (!activePopup && tooltipFields.length > 0) {
        const props = (feature.properties ?? {}) as Record<string, unknown>;
        const html = buildHoverHTML(props);
        if (html) {
          hoverPopup = new maplibregl.Popup({
            closeButton: false,
            closeOnClick: false,
            className: "atlas-hover-popup",
            offset: 12,
          })
            .setLngLat(e.lngLat)
            .setHTML(html)
            .addTo(map);
        }
      }

      if (onHoverRef.current) {
        onHoverRef.current(
          (feature.properties as Record<string, unknown>) ?? {},
        );
      }
    };

    const handleMouseMove = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];

      // Detect feature change (land → land transition) for polygon layers
      const newId = feature?.id ?? null;
      if (newId !== hoveredFeatureId) {
        // Clear old highlight
        if (hoveredFeatureId != null) {
          map.setFeatureState(
            { source: compiled.sourceId, id: hoveredFeatureId },
            { hover: false },
          );
        }
        // Set new highlight
        if (hoverEffect === "highlight" && newId != null) {
          map.setFeatureState(
            { source: compiled.sourceId, id: newId },
            { hover: true },
          );
        }
        hoveredFeatureId = newId;

        // Update hover popup content
        if (!activePopup && tooltipFields.length > 0 && feature) {
          const props = (feature.properties ?? {}) as Record<string, unknown>;
          const html = buildHoverHTML(props);
          if (html) {
            if (hoverPopup) {
              hoverPopup.setHTML(html);
            } else {
              hoverPopup = new maplibregl.Popup({
                closeButton: false,
                closeOnClick: false,
                className: "atlas-hover-popup",
                offset: 12,
              })
                .setLngLat(e.lngLat)
                .setHTML(html)
                .addTo(map);
            }
          }
        }

        if (onHoverRef.current) {
          onHoverRef.current(
            feature ? ((feature.properties as Record<string, unknown>) ?? {}) : null,
          );
        }
      }

      // Always update popup position
      if (hoverPopup) hoverPopup.setLngLat(e.lngLat);
    };

    const handleMouseLeave = () => {
      canvas.style.cursor = "";
      if (hoveredFeatureId != null) {
        map.setFeatureState(
          { source: compiled.sourceId, id: hoveredFeatureId },
          { hover: false },
        );
        hoveredFeatureId = null;
      }
      if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }
      onHoverRef.current?.(null);
    };

    const handleClick = (e: MapLayerMouseEvent) => {
      if (clickBehavior === "none") return;
      const feature = e.features?.[0];
      if (!feature) return;

      if (clickBehavior === "fly-to" && feature.geometry.type === "Point") {
        map.flyTo({
          center: feature.geometry.coordinates as [number, number],
          zoom: Math.max(map.getZoom(), 10),
          duration: 800,
        });
      }

      // Show click popup with full details
      if (clickBehavior === "popup" && tooltipFields.length > 0) {
        if (hoverPopup) { hoverPopup.remove(); hoverPopup = null; }
        if (activePopup) { activePopup.remove(); activePopup = null; }

        const props = (feature.properties ?? {}) as Record<string, unknown>;
        activePopup = new maplibregl.Popup({
          closeButton: true,
          maxWidth: "280px",
          className: "atlas-click-popup",
          offset: 14,
        })
          .setLngLat(e.lngLat)
          .setHTML(buildPopupHTML(props, tooltipFields))
          .addTo(map);
        activePopup.on("close", () => { activePopup = null; });
      }

      onClickRef.current?.(
        (feature.properties as Record<string, unknown>) ?? {},
      );
    };

    map.on("mouseenter", interactiveLayerId, handleMouseEnter);
    map.on("mousemove", interactiveLayerId, handleMouseMove);
    map.on("mouseleave", interactiveLayerId, handleMouseLeave);
    map.on("click", interactiveLayerId, handleClick);

    return () => {
      map.off("mouseenter", interactiveLayerId, handleMouseEnter);
      map.off("mousemove", interactiveLayerId, handleMouseMove);
      map.off("mouseleave", interactiveLayerId, handleMouseLeave);
      map.off("click", interactiveLayerId, handleClick);
      if (activePopup) activePopup.remove();
      if (hoverPopup) hoverPopup.remove();
    };
  }, [map, isReady, compiled, layer.interaction]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (!map || !compiled || !addedRef.current) return;
      try {
        // Remove layers in reverse order
        for (let i = compiled.layers.length - 1; i >= 0; i--) {
          const id = compiled.layers[i].id;
          if (map.getLayer(id)) map.removeLayer(id);
        }
        if (map.getSource(compiled.sourceId)) {
          map.removeSource(compiled.sourceId);
        }
        for (const extraId of Object.keys(compiled.extraSources ?? {})) {
          if (map.getSource(extraId)) map.removeSource(extraId);
        }
      } catch {
        // Map may already be destroyed
      }
      addedRef.current = false;
    };
  }, [map, compiled]);

  return {
    legendItems: compiled?.legendItems ?? [],
  };
}
