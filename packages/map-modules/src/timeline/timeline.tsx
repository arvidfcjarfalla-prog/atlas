"use client";

import { useMemo, useCallback } from "react";
import type { GeoEntity } from "@atlas/data-models";
import { SEVERITY_COLOR } from "@atlas/data-models";
import { cn } from "@atlas/ui";
import { useTimeWindow, type TimeWindowValue } from "./use-time-window";
import { computeBuckets } from "./buckets";

interface TimelineProps {
  entities: GeoEntity[];
  /** When true, renders inline (no absolute positioning). */
  embedded?: boolean;
  className?: string;
}

/**
 * Density bar showing entity distribution over time.
 */
export function Timeline({ entities, embedded, className }: TimelineProps) {
  const { timeWindow, setTimeWindow, windowMs } = useTimeWindow();

  // Coarse minute-granularity tick so the timeline advances as wall-clock
  // moves forward, without invalidating the memo on every render (which was
  // the original bug). 60_000 ms is low enough that users never notice the
  // quantization in a 48-bucket window.
  const nowBucket = Math.floor(Date.now() / 60_000);

  const buckets = useMemo(
    () => computeBuckets(entities, windowMs, nowBucket * 60_000),
    [entities, windowMs, nowBucket],
  );

  const maxCount = useMemo(
    () => Math.max(1, ...buckets.map((b) => b.count)),
    [buckets],
  );

  const totalInWindow = useMemo(
    () => buckets.reduce((sum, b) => sum + b.count, 0),
    [buckets],
  );

  const handleWindowClick = useCallback(
    (w: TimeWindowValue) => setTimeWindow(w),
    [setTimeWindow],
  );

  return (
    <div
      className={cn(
        embedded
          ? "flex items-end gap-3 px-3 py-2 w-full"
          : "absolute bottom-4 left-1/2 -translate-x-1/2 z-overlay hidden sm:flex items-end gap-3 bg-card border border-border rounded-lg px-3 py-2 shadow-sm max-w-[520px]",
        className,
      )}
    >
      {/* Time window pills */}
      <div className="flex flex-col items-center gap-1 flex-shrink-0">
        <div className="flex items-center gap-0.5">
          {(["1h", "6h", "24h", "all"] as TimeWindowValue[]).map((w) => (
            <button
              key={w}
              onClick={() => handleWindowClick(w)}
              className={cn(
                "text-label font-mono uppercase px-2 py-0.5 rounded transition-colors duration-fast",
                timeWindow === w
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {w}
            </button>
          ))}
        </div>
        <span className="text-caption font-mono text-muted-foreground">
          {totalInWindow} events
        </span>
      </div>

      {/* Density bars */}
      <div className="flex items-end gap-px h-9 flex-1 min-w-0">
        {buckets.map((bucket, i) => {
          const height =
            bucket.count > 0
              ? Math.max(3, (bucket.count / maxCount) * 36)
              : 1;
          const color =
            bucket.count > 0
              ? SEVERITY_COLOR[bucket.maxSeverity]
              : "hsl(var(--border))";
          return (
            <div
              key={i}
              className="flex-1 min-w-0 relative group"
              title={`${bucket.count} event${bucket.count !== 1 ? "s" : ""}`}
            >
              <div
                className="w-full rounded-sm transition-all duration-fast group-hover:brightness-125"
                style={{
                  height: `${height}px`,
                  backgroundColor: color,
                  opacity: bucket.count > 0 ? 0.85 : 0.3,
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Now indicator */}
      <span className="text-label font-mono text-muted-foreground flex-shrink-0 self-end">
        now
      </span>
    </div>
  );
}
