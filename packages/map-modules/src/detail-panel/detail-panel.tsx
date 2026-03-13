"use client";

import type { GeoEntity } from "@atlas/data-models";
import { Badge, ScrollArea, cn } from "@atlas/ui";
import { X } from "lucide-react";

interface DetailPanelProps {
  entity: GeoEntity | null;
  onClose: () => void;
  children?: React.ReactNode;
  className?: string;
}

const SEVERITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

/**
 * Inspector-style detail panel for a selected entity.
 * Floating card aesthetic — clean data hierarchy, severity accent border.
 */
export function DetailPanel({ entity, onClose, children, className }: DetailPanelProps) {
  if (!entity) return null;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Title block */}
      <div className="px-4 py-3 flex-shrink-0">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-heading leading-snug">{entity.title}</h2>
            <div className="flex items-center gap-2 mt-1.5">
              {entity.severity && (
                <Badge variant={SEVERITY_VARIANT[entity.severity] ?? "outline"}>
                  {entity.severity}
                </Badge>
              )}
              <span className="text-label font-mono uppercase text-muted-foreground">
                {entity.category}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md p-1.5 transition-colors duration-fast flex-shrink-0 mt-0.5"
            aria-label="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {entity.description && (
          <div className="px-4 pb-3">
            <p className="text-body text-muted-foreground">
              {entity.description}
            </p>
          </div>
        )}

        {/* Properties — key-value with severity accent bar */}
        <div className="mx-4 rounded-md border border-border overflow-hidden">
          {entity.occurredAt && (
            <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 border-b border-border">
              <span className="text-caption text-muted-foreground flex-shrink-0">
                Time
              </span>
              <span className="text-data font-mono text-right">
                {new Date(entity.occurredAt).toLocaleString()}
              </span>
            </div>
          )}
          <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 border-b border-border">
            <span className="text-caption text-muted-foreground flex-shrink-0">
              Location
            </span>
            <span className="text-data font-mono tabular-nums text-right">
              {entity.coordinates[0].toFixed(3)}, {entity.coordinates[1].toFixed(3)}
            </span>
          </div>
          {entity.sourceCount != null && entity.sourceCount > 0 && (
            <div className="flex items-baseline justify-between gap-3 px-4 py-2.5 border-b border-border">
              <span className="text-caption text-muted-foreground flex-shrink-0">
                Sources
              </span>
              <span className="text-data font-mono">
                {entity.sourceCount}
              </span>
            </div>
          )}
        </div>

        {/* Extra content from parent (e.g. depth, tsunami) */}
        {children && (
          <div className="mx-4 mt-3 rounded-md border border-border overflow-hidden">
            <div className="px-4 py-2.5">
              {children}
            </div>
          </div>
        )}

        {/* Bottom spacer */}
        <div className="h-4" />
      </ScrollArea>
    </div>
  );
}
