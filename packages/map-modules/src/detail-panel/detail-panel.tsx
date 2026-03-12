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
 * Expandable detail panel for a selected entity.
 * Renders entity metadata + optional custom content via children.
 */
export function DetailPanel({ entity, onClose, children, className }: DetailPanelProps) {
  if (!entity) return null;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          {entity.severity && (
            <Badge variant={SEVERITY_VARIANT[entity.severity] ?? "outline"}>
              {entity.severity}
            </Badge>
          )}
          <span className="text-xs text-muted-foreground font-mono uppercase">
            {entity.category}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          <h2 className="text-sm font-semibold leading-snug">{entity.title}</h2>

          {entity.description && (
            <p className="text-xs text-muted-foreground leading-relaxed">
              {entity.description}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            {entity.occurredAt && (
              <div>
                <span className="text-muted-foreground">Time</span>
                <p className="font-mono">
                  {new Date(entity.occurredAt).toLocaleString()}
                </p>
              </div>
            )}
            <div>
              <span className="text-muted-foreground">Location</span>
              <p className="font-mono">
                {entity.coordinates[0].toFixed(3)}, {entity.coordinates[1].toFixed(3)}
              </p>
            </div>
            {entity.sourceCount != null && entity.sourceCount > 0 && (
              <div>
                <span className="text-muted-foreground">Sources</span>
                <p className="font-mono">{entity.sourceCount}</p>
              </div>
            )}
          </div>

          {/* Map-specific extra content */}
          {children}
        </div>
      </ScrollArea>
    </div>
  );
}
