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
  activeItems?: string[];
  onToggle?: (label: string) => void;
}

/** Map legend overlay with optional filter toggling. */
export function Legend({ items, title, className, activeItems, onToggle }: LegendProps) {
  if (items.length === 0) return null;

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
      <div className="flex flex-col gap-1.5">
        {items.map((item) => {
          const isActive = !activeItems || activeItems.includes(item.label);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onToggle?.(item.label)}
              disabled={!onToggle}
              className={cn(
                "flex items-center gap-2 transition-opacity duration-fast",
                !isActive && "opacity-35",
                onToggle && "cursor-pointer hover:opacity-100",
                !onToggle && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex-shrink-0",
                  item.shape === "line"
                    ? "h-0.5 w-4 rounded-full"
                    : "w-2.5 h-2.5 rounded-full",
                )}
                style={{ backgroundColor: item.color }}
              />
              <span className="text-caption text-foreground/70">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
