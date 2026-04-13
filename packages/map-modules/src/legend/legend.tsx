"use client";

import { cn } from "@atlas/ui";
import { glass } from "./legend-styles";

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
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {items.map((item) => {
          const isActive = !activeItems || activeItems.includes(item.label);
          return (
            <button
              key={item.label}
              type="button"
              onClick={() => onToggle?.(item.label)}
              disabled={!onToggle}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                opacity: isActive ? 1 : 0.35,
                cursor: onToggle ? "pointer" : "default",
                background: "none",
                border: "none",
                padding: 0,
                transition: "opacity 150ms",
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  backgroundColor: item.color,
                  borderRadius: item.shape === "line" ? 2 : "50%",
                  width: item.shape === "line" ? 16 : 8,
                  height: item.shape === "line" ? 2 : 8,
                }}
              />
              <span style={{
                fontFamily: "'Courier New', monospace",
                fontSize: 11,
                color: "rgba(228,224,216,0.7)",
              }}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
