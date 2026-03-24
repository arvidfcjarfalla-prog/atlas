"use client";

import { Legend, GradientLegend, ProportionalLegend } from "@atlas/map-modules";
import type { CompiledLegendItem } from "@atlas/map-core";
import type { MapManifest } from "@atlas/data-models";

/**
 * Shared legend overlay — picks the right legend type based on manifest config.
 */
export function LegendOverlay({
  layer,
  legendItems,
}: {
  layer: MapManifest["layers"][0] | undefined;
  legendItems: CompiledLegendItem[];
}) {
  if (!layer) return null;

  const title = layer.legend?.title ?? layer.label;
  const attribution = layer.attribution;

  let legend: React.ReactNode;
  if (layer.legend?.type === "gradient") {
    legend = <GradientLegend items={legendItems} title={title} />;
  } else if (layer.legend?.type === "proportional") {
    legend = (
      <ProportionalLegend
        items={legendItems.filter((i) => i.radius != null) as { label: string; color: string; radius: number }[]}
        title={title}
      />
    );
  } else {
    legend = <Legend items={legendItems} title={title} />;
  }

  return (
    <>
      {legend}
      {attribution && (
        <div style={{
          position: "absolute",
          bottom: 8,
          left: 8,
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          color: "rgba(248,249,251,0.30)",
        }}>
          {layer.attributionUrl ? (
            <a
              href={layer.attributionUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "inherit", textDecoration: "none", borderBottom: "1px solid rgba(248,249,251,0.15)" }}
              onMouseEnter={(e) => { (e.target as HTMLAnchorElement).style.color = "rgba(248,249,251,0.55)"; }}
              onMouseLeave={(e) => { (e.target as HTMLAnchorElement).style.color = "inherit"; }}
            >
              {attribution}
            </a>
          ) : attribution}
        </div>
      )}
    </>
  );
}
