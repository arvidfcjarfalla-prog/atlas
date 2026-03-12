"use client";

import { cn } from "@atlas/ui";

export interface LegendItem {
  label: string;
  color: string;
  shape?: "circle" | "line" | "square";
}

interface LegendProps {
  items: LegendItem[];
  title?: string;
  className?: string;
}

/** Auto-generated legend overlay for the map. */
export function Legend({ items, title, className }: LegendProps) {
  if (items.length === 0) return null;

  return (
    <div
      className={cn(
        "absolute top-4 left-4 z-10 bg-card/90 backdrop-blur-sm border border-border rounded-lg px-3 py-2 shadow-lg",
        className,
      )}
    >
      {title && (
        <h3 className="text-[9px] font-mono font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
          {title}
        </h3>
      )}
      <div className="flex flex-col gap-1">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <span
              className={cn(
                "w-2.5 h-2.5 flex-shrink-0",
                item.shape === "line" ? "h-0.5 w-4 rounded-full" : "rounded-full",
              )}
              style={{ backgroundColor: item.color }}
            />
            <span className="text-[10px] text-foreground/80">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
