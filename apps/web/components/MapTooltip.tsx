"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useMap } from "@atlas/map-core";
import type { MapMouseEvent } from "maplibre-gl";

interface TooltipData {
  name: string;
  value: string;
  color: string;
}

/**
 * Hover tooltip for map features — fixed bottom-center bar.
 * Matches prototype EditorView: glassmorphism card, name + divider + value.
 * Uses queryRenderedFeatures on mousemove.
 */
export function MapTooltip({ layerId }: { layerId?: string }) {
  const { map, isReady } = useMap();
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);
  const hoveredRef = useRef<string | number | null>(null);

  const handleMouseMove = useCallback(
    (e: MapMouseEvent) => {
      if (!map) return;

      const features = map.queryRenderedFeatures(e.point);

      // Find the first data-layer feature (not basemap)
      const feat = features.find((f) => {
        if (!f.source || !f.source.endsWith("-source")) return false;
        if (layerId && !f.layer.id.startsWith(layerId)) return false;
        return true;
      });

      if (!feat || !feat.properties) {
        if (hoveredRef.current !== null) {
          hoveredRef.current = null;
          setTooltip(null);
        }
        return;
      }

      const props = feat.properties;
      const name =
        props.name || props.NAME || props.NAME_1 || props.admin ||
        props.ADMIN || props.name_en || props.NAME_EN || props.label || "";

      // Extract primary numeric value
      let value = "";
      if (props.value != null) {
        value = formatValue(props.value);
      } else {
        for (const [k, v] of Object.entries(props)) {
          if (
            typeof v === "number" &&
            !k.toLowerCase().includes("id") &&
            k !== "iso_a2" && k !== "iso_a3" && k !== "iso_n3"
          ) {
            value = formatValue(v);
            break;
          }
        }
      }

      if (!name && !value) {
        setTooltip(null);
        return;
      }

      // Get feature fill color from the layer paint
      const layerObj = feat.layer;
      let color = "#48a8c4";
      if (layerObj?.paint) {
        const paint = layerObj.paint as Record<string, unknown>;
        const fc = paint["fill-color"] ?? paint["circle-color"];
        if (typeof fc === "string") color = fc;
      }

      const fid = feat.id ?? name;
      hoveredRef.current = fid;
      setTooltip({ name: String(name), value, color });
    },
    [map, layerId],
  );

  const handleMouseLeave = useCallback(() => {
    hoveredRef.current = null;
    setTooltip(null);
  }, []);

  useEffect(() => {
    if (!map || !isReady) return;

    map.on("mousemove", handleMouseMove);
    map.on("mouseout", handleMouseLeave);

    return () => {
      map.off("mousemove", handleMouseMove);
      map.off("mouseout", handleMouseLeave);
    };
  }, [map, isReady, handleMouseMove, handleMouseLeave]);

  if (!tooltip) return null;

  return (
    <div
      style={{
        position: "absolute",
        bottom: 52,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 15,
        pointerEvents: "none",
        background: "rgba(12,16,20,0.88)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 10,
        padding: "10px 20px",
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 4,
            background: tooltip.color,
          }}
        />
        <span
          style={{
            fontFamily: "Georgia,'Times New Roman',serif",
            fontSize: 14,
            fontWeight: 600,
            color: "#e4e0d8",
          }}
        >
          {tooltip.name}
        </span>
      </div>
      {tooltip.value && (
        <>
          <div
            style={{
              width: 1,
              height: 22,
              background: "rgba(255,255,255,0.05)",
            }}
          />
          <span
            style={{
              fontFamily: "Georgia,'Times New Roman',serif",
              fontSize: 22,
              fontWeight: 600,
              color: "#e4e0d8",
            }}
          >
            {tooltip.value}
          </span>
        </>
      )}
    </div>
  );
}

function formatValue(v: unknown): string {
  if (typeof v === "number") {
    if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `${(v / 1_000).toFixed(1)}k`;
    if (Number.isInteger(v)) return v.toLocaleString("sv-SE");
    return v.toLocaleString("sv-SE", { maximumFractionDigits: 1 });
  }
  return String(v ?? "");
}
