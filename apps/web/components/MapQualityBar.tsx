"use client";

import { useMemo } from "react";
import type { CompiledLegendItem } from "@atlas/map-core";

// ── Simplified deuteranopia simulation ──────────────────────
// Brettel 1997 matrix for deuteranopia (most common CVD ~6% of males)
function parseColor(c: string): [number, number, number] | null {
  if (c.startsWith("#")) {
    const hex = c.slice(1);
    if (hex.length === 3) {
      return [parseInt(hex[0]+hex[0],16), parseInt(hex[1]+hex[1],16), parseInt(hex[2]+hex[2],16)];
    }
    if (hex.length >= 6) {
      return [parseInt(hex.slice(0,2),16), parseInt(hex.slice(2,4),16), parseInt(hex.slice(4,6),16)];
    }
  }
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (m) return [+m[1], +m[2], +m[3]];
  return null;
}

function simulateDeutan(r: number, g: number, b: number): [number, number, number] {
  // Simplified Brettel/Vienot deuteranopia matrix
  return [
    0.625 * r + 0.375 * g,
    0.700 * r + 0.300 * g,
    0.300 * g + 0.700 * b,
  ];
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2);
}

// Threshold: delta < 25 means colors are hard to distinguish under deuteranopia
const CVD_THRESHOLD = 25;

function checkColorblindSafety(items: CompiledLegendItem[]): boolean {
  const colors = items.map(i => parseColor(i.color)).filter((c): c is [number, number, number] => c !== null);
  if (colors.length < 2) return true;

  const simulated = colors.map(([r,g,b]) => simulateDeutan(r,g,b));
  for (let i = 0; i < simulated.length; i++) {
    for (let j = i + 1; j < simulated.length; j++) {
      if (colorDistance(simulated[i], simulated[j]) < CVD_THRESHOLD) return false;
    }
  }
  return true;
}

// ── Match rate ──────────────────────────────────────────────
function computeMatchRate(
  data: GeoJSON.FeatureCollection | null,
  colorField: string | undefined,
): { matched: number; total: number } | null {
  if (!data || !colorField || data.features.length === 0) return null;
  const total = data.features.length;
  const matched = data.features.filter(f => {
    const v = f.properties?.[colorField];
    return v != null && v !== "" && v !== 0;
  }).length;
  // Only show if there's a meaningful mismatch (not 100% or 0%)
  if (matched === total) return null;
  return { matched, total };
}

// ── Component ───────────────────────────────────────────────
export function MapQualityBar({
  legendItems,
  data,
  colorField,
}: {
  legendItems: CompiledLegendItem[];
  data: GeoJSON.FeatureCollection | null;
  colorField?: string;
}) {
  const cvdSafe = useMemo(() => checkColorblindSafety(legendItems), [legendItems]);
  const matchRate = useMemo(() => computeMatchRate(data, colorField), [data, colorField]);

  if (cvdSafe && !matchRate) return null;

  return (
    <div style={{
      position: "absolute", bottom: 8, left: "50%", transform: "translateX(-50%)",
      zIndex: 30, display: "flex", gap: 8,
      fontFamily: "'Geist Mono',monospace", fontSize: 11,
    }}>
      {!cvdSafe && (
        <div style={{
          padding: "4px 10px", borderRadius: 6,
          background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.25)",
          color: "rgba(234,179,8,0.9)",
        }}>
          Low colorblind contrast
        </div>
      )}
      {matchRate && (
        <div style={{
          padding: "4px 10px", borderRadius: 6,
          background: matchRate.matched / matchRate.total > 0.9
            ? "rgba(142,203,160,0.12)" : "rgba(239,68,68,0.12)",
          border: `1px solid ${matchRate.matched / matchRate.total > 0.9
            ? "rgba(142,203,160,0.25)" : "rgba(239,68,68,0.25)"}`,
          color: matchRate.matched / matchRate.total > 0.9
            ? "rgba(142,203,160,0.9)" : "rgba(239,68,68,0.9)",
        }}>
          {matchRate.matched}/{matchRate.total} features matched
        </div>
      )}
    </div>
  );
}
