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
      className={cn(
        "absolute top-4 left-4 z-overlay bg-card border border-border rounded-lg px-3 py-2.5 shadow-sm",
        className,
      )}
    >
      {title && (
        <h3 className="text-label font-mono uppercase text-muted-foreground mb-2">
          {title}
        </h3>
      )}

      <div className="flex items-end gap-3">
        {/* Concentric circles */}
        <div
          className="relative flex items-end justify-center"
          style={{ width: maxRadius * 2 + 8, height: totalHeight }}
        >
          {sorted.map((item) => (
            <div
              key={item.label}
              className="absolute bottom-0 rounded-full border"
              style={{
                width: item.radius * 2,
                height: item.radius * 2,
                backgroundColor: `${item.color}33`,
                borderColor: `${item.color}88`,
                left: `calc(50% - ${item.radius}px)`,
              }}
            />
          ))}
        </div>

        {/* Labels */}
        <div className="flex flex-col justify-between gap-0.5" style={{ height: totalHeight }}>
          {items
            .sort((a, b) => b.radius - a.radius)
            .map((item) => (
              <span
                key={item.label}
                className="text-caption text-foreground/60 whitespace-nowrap"
              >
                {item.label}
              </span>
            ))}
        </div>
      </div>
    </div>
  );
}
