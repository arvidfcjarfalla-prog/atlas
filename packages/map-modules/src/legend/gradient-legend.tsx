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

      {/* Gradient bar */}
      <div
        className="h-2.5 w-full rounded-sm"
        style={{
          background: `linear-gradient(to right, ${gradientStops})`,
        }}
      />

      {/* Labels */}
      <div className="flex justify-between mt-1">
        <span className="text-caption text-foreground/60">
          {items[0].label}
        </span>
        <span className="text-caption text-foreground/60">
          {items[items.length - 1].label}
        </span>
      </div>
    </div>
  );
}
