"use client";

import { useState, useCallback, useEffect } from "react";
import {
  MapShell,
  useBasemapLayers,
  useManifestRenderer,
  getBasemapLandColor,
} from "@atlas/map-core";
import type { CompiledLegendItem } from "@atlas/map-core";
import { Legend } from "@atlas/map-modules";
import type { MapFamily } from "@atlas/data-models";
import { FAMILIES, FIXTURES } from "./test-fixtures";

// ─── Content component (inside MapContext) ──────────────────

function SmokeTestContent({
  family,
  onLegendItems,
  onFeatureClick,
  onFeatureHover,
}: {
  family: MapFamily;
  onLegendItems: (items: CompiledLegendItem[]) => void;
  onFeatureClick: (props: Record<string, unknown>) => void;
  onFeatureHover: (props: Record<string, unknown> | null) => void;
}) {
  const fixture = FIXTURES[family];

  useBasemapLayers({
    basemap: fixture.manifest.basemap,
    landColor: getBasemapLandColor(fixture.manifest.basemap?.style),
  });

  const { legendItems } = useManifestRenderer({
    layer: fixture.manifest.layers[0],
    data: fixture.data,
    onFeatureClick,
    onFeatureHover,
  });

  useEffect(() => {
    onLegendItems(legendItems);
  }, [legendItems, onLegendItems]);

  return null;
}

// ─── Root page component ────────────────────────────────────

export default function SmokeTestPage() {
  const [family, setFamily] = useState<MapFamily>("point");
  const [legendItems, setLegendItems] = useState<CompiledLegendItem[]>([]);
  const [hoveredProps, setHoveredProps] = useState<Record<string, unknown> | null>(null);
  const [clickLog, setClickLog] = useState<string[]>([]);

  const handleLegendItems = useCallback((items: CompiledLegendItem[]) => {
    setLegendItems(items);
  }, []);

  const handleFeatureClick = useCallback((props: Record<string, unknown>) => {
    setClickLog((prev) => [JSON.stringify(props), ...prev].slice(0, 8));
  }, []);

  const handleFeatureHover = useCallback(
    (props: Record<string, unknown> | null) => {
      setHoveredProps(props);
    },
    [],
  );

  // Reset legend + interaction state on family switch
  useEffect(() => {
    setLegendItems([]);
    setHoveredProps(null);
    setClickLog([]);
  }, [family]);

  const fixture = FIXTURES[family];
  const layer = fixture.manifest.layers[0];

  const sidebar = (
    <div className="flex flex-col h-full p-4 gap-4 overflow-auto">
      <h1 className="text-heading">Smoke Test</h1>

      {/* Family selector */}
      <div>
        <label
          htmlFor="family-select"
          className="text-label font-mono uppercase text-muted-foreground block mb-1"
        >
          Map family
        </label>
        <select
          id="family-select"
          value={family}
          onChange={(e) => setFamily(e.target.value as MapFamily)}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-body text-foreground"
        >
          {FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>

      {/* Manifest info */}
      <div>
        <h3 className="text-label font-mono uppercase text-muted-foreground mb-1">
          Manifest
        </h3>
        <p className="text-body text-foreground">{fixture.manifest.title}</p>
        <p className="text-caption text-muted-foreground">
          {fixture.data.features.length} features · {layer.geometryType} ·{" "}
          {layer.style.color?.scheme ?? "default"}
        </p>
      </div>

      {/* Hover inspector */}
      <div>
        <h3 className="text-label font-mono uppercase text-muted-foreground mb-1">
          Hover
        </h3>
        <pre className="text-caption overflow-auto max-h-32 rounded bg-background/50 p-2">
          {hoveredProps ? JSON.stringify(hoveredProps, null, 2) : "—"}
        </pre>
      </div>

      {/* Click log */}
      <div>
        <h3 className="text-label font-mono uppercase text-muted-foreground mb-1">
          Clicks
        </h3>
        <div className="space-y-1 overflow-auto max-h-48">
          {clickLog.length === 0 ? (
            <p className="text-caption text-muted-foreground">—</p>
          ) : (
            clickLog.map((entry, i) => (
              <pre
                key={i}
                className="text-caption truncate rounded bg-background/50 px-2 py-1"
              >
                {entry}
              </pre>
            ))
          )}
        </div>
      </div>
    </div>
  );

  return (
    <MapShell
      key={family}
      manifest={fixture.manifest}
      sidebar={sidebar}
      sidebarOpen
      overlay={
        <Legend
          items={legendItems}
          title={layer.legend?.title ?? layer.label}
        />
      }
    >
      <SmokeTestContent
        family={family}
        onLegendItems={handleLegendItems}
        onFeatureClick={handleFeatureClick}
        onFeatureHover={handleFeatureHover}
      />
    </MapShell>
  );
}
