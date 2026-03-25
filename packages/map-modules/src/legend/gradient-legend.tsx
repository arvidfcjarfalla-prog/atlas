"use client";

import { cn } from "@atlas/ui";

export interface GradientLegendItem {
  label: string;
  color: string;
}

interface GradientLegendProps {
  items: GradientLegendItem[];
  title?: string;
  className?: string;
}

const glass = {
  background: "rgba(12,16,20,0.8)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  border: "1px solid rgba(255,255,255,0.05)",
  borderRadius: 8,
} as const;

function extractRangeEnd(label: string, end: "low" | "high"): string {
  const parts = label.split(/\s*–\s*/);
  if (parts.length === 2) return end === "low" ? parts[0] : parts[1];
  return label;
}

/**
 * Gradient legend for choropleth and heatmap maps.
 * Renders a continuous color bar with class break labels.
 */
export function GradientLegend({
  items,
  title,
  className,
}: GradientLegendProps) {
  if (items.length === 0) return null;

  const gradientStops = items
    .map((item, i) => {
      const pct = (i / (items.length - 1)) * 100;
      return `${item.color} ${pct}%`;
    })
    .join(", ");

  return (
    <div
      className={cn("absolute top-4 left-4 z-overlay", className)}
      style={{ ...glass, padding: "10px 12px" }}
    >
      {title && (
        <h3 style={{
          fontFamily: "'Courier New', monospace",
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: "#5a5752",
          margin: "0 0 8px",
        }}>
          {title}
        </h3>
      )}

      {/* Gradient bar */}
      <div
        style={{
          height: 10,
          width: "100%",
          borderRadius: 2,
          background: `linear-gradient(to right, ${gradientStops})`,
        }}
      />

      {/* Labels: show min of first range, max of last range */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, gap: 8 }}>
        <span style={{
          fontFamily: "'Courier New', monospace",
          fontSize: 10,
          color: "rgba(228,224,216,0.6)",
        }}>
          {extractRangeEnd(items[0].label, "low")}
        </span>
        <span style={{
          fontFamily: "'Courier New', monospace",
          fontSize: 10,
          color: "rgba(228,224,216,0.6)",
        }}>
          {extractRangeEnd(items[items.length - 1].label, "high")}
        </span>
      </div>
    </div>
  );
}
