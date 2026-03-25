"use client";

import { cn } from "@atlas/ui";

export interface ProportionalLegendItem {
  label: string;
  color: string;
  /** Circle radius in px. */
  radius: number;
}

interface ProportionalLegendProps {
  items: ProportionalLegendItem[];
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

/**
 * Proportional symbol legend showing 2-3 circles of increasing size.
 * Used for proportional-symbol map family.
 */
export function ProportionalLegend({
  items,
  title,
  className,
}: ProportionalLegendProps) {
  if (items.length === 0) return null;

  // Sort largest first so circles stack visually (largest behind)
  const sorted = [...items].sort((a, b) => b.radius - a.radius);
  const maxRadius = sorted[0].radius;
  const totalHeight = maxRadius * 2 + 4;

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

      <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
        {/* Concentric circles */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            width: maxRadius * 2 + 8,
            height: totalHeight,
          }}
        >
          {sorted.map((item) => (
            <div
              key={item.label}
              style={{
                position: "absolute",
                bottom: 0,
                borderRadius: "50%",
                width: item.radius * 2,
                height: item.radius * 2,
                backgroundColor: `${item.color}33`,
                border: `1px solid ${item.color}88`,
                left: `calc(50% - ${item.radius}px)`,
              }}
            />
          ))}
        </div>

        {/* Labels */}
        <div style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 2,
          height: totalHeight,
        }}>
          {items
            .sort((a, b) => b.radius - a.radius)
            .map((item) => (
              <span
                key={item.label}
                style={{
                  fontFamily: "'Courier New', monospace",
                  fontSize: 10,
                  color: "rgba(228,224,216,0.6)",
                  whiteSpace: "nowrap",
                }}
              >
                {item.label}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
