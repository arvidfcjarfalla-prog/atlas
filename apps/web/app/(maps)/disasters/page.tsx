"use client";

import { useState, useCallback } from "react";
import { MapShell, useMapLayers } from "@atlas/map-core";
import { Timeline, TimeWindowProvider, DetailPanel, Legend, type LegendItem } from "@atlas/map-modules";
import type { GeoEntity } from "@atlas/data-models";
import { ScrollArea, Badge } from "@atlas/ui";
import { disastersManifest } from "../../../lib/disasters-manifest";
import { useEarthquakes } from "../../../lib/use-earthquakes";

const LEGEND_ITEMS: LegendItem[] = [
  { label: "Critical (M7+)", color: "#dc2626" },
  { label: "High (M5-7)", color: "#ef4444" },
  { label: "Medium (M3.5-5)", color: "#eab308" },
  { label: "Low (M<3.5)", color: "#6b7280" },
];

function DisastersMapContent({ earthquakes }: { earthquakes: GeoEntity[] }) {
  useMapLayers({
    layerId: "earthquakes",
    entities: earthquakes,
    clusterEnabled: true,
    clusterRadius: 50,
  });

  return null;
}

export default function DisastersPage() {
  const { data: earthquakes = [], isLoading } = useEarthquakes();
  const [selected, setSelected] = useState<GeoEntity | null>(null);

  const handleClose = useCallback(() => setSelected(null), []);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <h1 className="text-sm font-semibold">Disasters</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isLoading ? "Loading..." : `${earthquakes.length} earthquakes (24h)`}
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {earthquakes
            .sort((a, b) => {
              const ta = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
              const tb = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
              return tb - ta;
            })
            .map((eq) => (
              <button
                key={eq.id}
                onClick={() => setSelected(eq)}
                className={`w-full text-left rounded-md px-3 py-2 transition-colors hover:bg-accent/50 ${
                  selected?.id === eq.id ? "bg-accent" : ""
                }`}
              >
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge
                    variant={
                      eq.severity === "critical" || eq.severity === "high"
                        ? "destructive"
                        : eq.severity === "medium"
                          ? "secondary"
                          : "outline"
                    }
                    className="text-[9px] px-1.5 py-0"
                  >
                    {(eq.properties?.magnitude as number)?.toFixed(1) ?? eq.severity}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {eq.occurredAt
                      ? new Date(eq.occurredAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
                <p className="text-xs leading-snug truncate">{eq.title}</p>
              </button>
            ))}
        </div>
      </ScrollArea>
    </div>
  );

  return (
    <TimeWindowProvider initial="24h">
      <MapShell
        manifest={disastersManifest}
        sidebar={sidebar}
        detailPanel={
          selected ? (
            <DetailPanel entity={selected} onClose={handleClose}>
              {selected.properties?.depth != null && (
                <div className="text-xs">
                  <span className="text-muted-foreground">Depth</span>
                  <p className="font-mono">{String(selected.properties.depth)} km</p>
                </div>
              )}
              {selected.properties?.tsunami === 1 && (
                <Badge variant="destructive" className="mt-2">
                  Tsunami warning
                </Badge>
              )}
            </DetailPanel>
          ) : undefined
        }
        sidebarOpen
        panelOpen={!!selected}
        overlay={
          <>
            <Legend items={LEGEND_ITEMS} title="Earthquake Magnitude" />
            <Timeline entities={earthquakes} />
          </>
        }
      >
        <DisastersMapContent earthquakes={earthquakes} />
      </MapShell>
    </TimeWindowProvider>
  );
}
