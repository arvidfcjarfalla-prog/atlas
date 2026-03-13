"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { MapShell, useMap, useMapLayers, useTectonicLayers, useRippleLayers, useActivityField, useHillshade, useNightlights, useLandMask, useTerrain, MapAtmosphere } from "@atlas/map-core";
import { Timeline, TimeWindowProvider, DetailPanel, Legend, type LegendItem } from "@atlas/map-modules";
import type { GeoEntity } from "@atlas/data-models";
import { SEVERITY_HEX } from "@atlas/data-models";
import { ScrollArea } from "@atlas/ui";
import { disastersManifest } from "../../../lib/disasters-manifest";
import { useEarthquakes } from "../../../lib/use-earthquakes";

const LEGEND_ITEMS: LegendItem[] = [
  { label: "Critical (M7+)", color: SEVERITY_HEX.critical },
  { label: "High (M5-7)", color: SEVERITY_HEX.high },
  { label: "Medium (M3.5-5)", color: SEVERITY_HEX.medium },
  { label: "Low (M<3.5)", color: SEVERITY_HEX.low },
];

function DisastersMapContent({
  earthquakes,
  flyTarget,
  onFlyComplete,
  onFeatureClick,
  onFeatureHover,
}: {
  earthquakes: GeoEntity[];
  flyTarget: [number, number] | null;
  onFlyComplete: () => void;
  onFeatureClick?: (entityId: string) => void;
  onFeatureHover?: (entityId: string | null) => void;
}) {
  const { map, isReady } = useMap();

  useMapLayers({
    layerId: "earthquakes",
    entities: earthquakes,
    clusterEnabled: false,
    onFeatureClick,
    onFeatureHover,
  });

  // Land mask — ensures continents are visible at zoom 0-4
  // where CARTO doesn't render land fills. Fades out by zoom 5.
  useLandMask({ beforeLayerId: "earthquakes-glow" });

  // Hillshade — terrain + ocean floor relief from AWS Terrarium DEM.
  useHillshade({ beforeLayerId: "earthquakes-glow" });

  // Nightlights — city lights from NASA VIIRS Black Marble.
  useNightlights({ beforeLayerId: "earthquakes-glow" });

  useTectonicLayers({ beforeLayerId: "earthquakes-glow" });

  useActivityField({
    layerId: "earthquakes",
    beforeLayerId: "earthquakes-glow",
  });

  useRippleLayers({
    layerId: "earthquakes",
    entities: earthquakes,
    beforeLayerId: "earthquakes-glow",
  });

  useEffect(() => {
    if (!map || !isReady || !flyTarget) return;
    map.flyTo({
      center: flyTarget,
      zoom: Math.max(map.getZoom(), 6),
      duration: 1200,
    });
    onFlyComplete();
  }, [map, isReady, flyTarget, onFlyComplete]);

  return null;
}

function SidebarSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border">
        <div className="h-4 w-24 bg-muted rounded animate-pulse" />
        <div className="h-3 w-36 bg-muted rounded animate-pulse mt-2" />
      </div>
      <div className="py-1">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="px-4 py-2.5 flex items-start gap-3 border-l-2 border-l-transparent">
            <div className="h-5 w-10 bg-muted rounded animate-pulse flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3 w-full bg-muted rounded animate-pulse" />
              <div className="h-2.5 w-20 bg-muted rounded animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DisastersPage() {
  const { data: earthquakes = [], isLoading } = useEarthquakes();
  const [selected, setSelected] = useState<GeoEntity | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);

  const handleClose = useCallback(() => setSelected(null), []);
  const handleFlyComplete = useCallback(() => setFlyTarget(null), []);

  const handleSelect = useCallback((eq: GeoEntity) => {
    setSelected(eq);
    setFlyTarget([eq.coordinates[1], eq.coordinates[0]]);
  }, []);

  const handleFeatureClick = useCallback(
    (entityId: string) => {
      const eq = earthquakes.find((e) => e.id === entityId);
      if (eq) {
        setSelected(eq);
        // Scroll sidebar list to the clicked item
        requestAnimationFrame(() => {
          const el = document.querySelector(`[data-entity-id="${entityId}"]`);
          el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        });
      }
    },
    [earthquakes],
  );

  const handleFeatureHover = useCallback((entityId: string | null) => {
    setHoveredId(entityId);
  }, []);

  const sortedEarthquakes = useMemo(
    () =>
      [...earthquakes].sort((a, b) => {
        const ta = a.occurredAt ? new Date(a.occurredAt).getTime() : 0;
        const tb = b.occurredAt ? new Date(b.occurredAt).getTime() : 0;
        return tb - ta;
      }),
    [earthquakes],
  );

  const sidebar = isLoading ? (
    <SidebarSkeleton />
  ) : (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-baseline justify-between">
          <h1 className="text-heading">Earthquakes</h1>
          <span className="text-data font-mono tabular-nums text-muted-foreground">
            {earthquakes.length}
          </span>
        </div>
        <p className="text-caption text-muted-foreground mt-1">
          Last 24 hours · USGS
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="py-1">
          {sortedEarthquakes.map((eq, i) => {
            const mag = (eq.properties?.magnitude as number) ?? 0;
            const severity = eq.severity ?? "low";
            const isHovered = hoveredId === eq.id;
            const isSelected = selected?.id === eq.id;

            return (
              <button
                key={eq.id}
                data-entity-id={eq.id}
                onClick={() => handleSelect(eq)}
                onMouseEnter={() => setHoveredId(eq.id)}
                onMouseLeave={() => setHoveredId(null)}
                className={`w-full text-left flex items-start gap-3 pl-4 pr-4 py-2.5 border-l-2 transition-all duration-fast animate-fade-in-up ${
                  isSelected
                    ? "bg-accent border-l-primary"
                    : isHovered
                      ? "bg-accent/50 border-l-transparent"
                      : "border-l-transparent hover:bg-accent/50"
                }`}
                style={{ animationDelay: `${Math.min(i * 30, 500)}ms` }}
              >
                {/* Magnitude — primary visual element */}
                <div className="flex-shrink-0 w-10 text-center pt-0.5">
                  <span
                    className="text-heading font-mono tabular-nums"
                    style={{ color: SEVERITY_HEX[severity as keyof typeof SEVERITY_HEX] }}
                  >
                    {mag.toFixed(1)}
                  </span>
                </div>

                {/* Location + time */}
                <div className="flex-1 min-w-0">
                  <p className="text-title truncate">{eq.title}</p>
                  <span className="text-caption text-muted-foreground font-mono tabular-nums">
                    {eq.occurredAt
                      ? new Date(eq.occurredAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </span>
                </div>
              </button>
            );
          })}
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
              <div className="space-y-2.5">
                {selected.properties?.depth != null && (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-caption text-muted-foreground">
                      Depth
                    </span>
                    <span className="text-data font-mono">
                      {String(selected.properties.depth)} km
                    </span>
                  </div>
                )}
                {selected.properties?.tsunami === 1 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-caption text-muted-foreground">
                      Alert
                    </span>
                    <span className="text-caption text-destructive font-medium">
                      Tsunami warning
                    </span>
                  </div>
                )}
              </div>
            </DetailPanel>
          ) : undefined
        }
        sidebarOpen
        panelOpen={!!selected}
        overlay={
          <>
            <Legend items={LEGEND_ITEMS} title="Magnitude" />
            <Timeline entities={earthquakes} />
          </>
        }
      >
        <DisastersMapContent
          earthquakes={earthquakes}
          flyTarget={flyTarget}
          onFlyComplete={handleFlyComplete}
          onFeatureClick={handleFeatureClick}
          onFeatureHover={handleFeatureHover}
        />
        <MapAtmosphere />
      </MapShell>
    </TimeWindowProvider>
  );
}
