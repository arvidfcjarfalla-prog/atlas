"use client";

import { useQuery } from "@tanstack/react-query";
import { getAgeBracket, type EventEntity, type Severity } from "@atlas/data-models";

interface USGSFeature {
  id: string;
  properties: {
    mag: number;
    place: string;
    time: number;
    updated: number;
    tsunami: number;
    alert: string | null;
    type: string;
  };
  geometry: {
    type: "Point";
    coordinates: [number, number, number]; // [lng, lat, depth]
  };
}

interface USGSResponse {
  type: "FeatureCollection";
  metadata: { generated: number; count: number; title: string };
  features: USGSFeature[];
}

function magToSeverity(mag: number): Severity {
  if (mag >= 7.0) return "critical";
  if (mag >= 5.0) return "high";
  if (mag >= 3.5) return "medium";
  return "low";
}

function usgsToEvent(feature: USGSFeature): EventEntity {
  const updatedAt = new Date(feature.properties.updated).toISOString();
  return {
    id: feature.id,
    kind: "event",
    title: `M${feature.properties.mag.toFixed(1)} — ${feature.properties.place}`,
    coordinates: [
      feature.geometry.coordinates[1], // lat
      feature.geometry.coordinates[0], // lng
    ],
    category: "earthquake",
    severity: magToSeverity(feature.properties.mag),
    occurredAt: new Date(feature.properties.time).toISOString(),
    updatedAt,
    ageBracket: getAgeBracket(updatedAt),
    sourceCount: 1,
    source: "USGS",
    properties: {
      magnitude: feature.properties.mag,
      depth: feature.geometry.coordinates[2],
      tsunami: feature.properties.tsunami,
      alert: feature.properties.alert,
    },
  };
}

export function useEarthquakes() {
  return useQuery<EventEntity[]>({
    queryKey: ["earthquakes"],
    queryFn: async () => {
      const res = await fetch("/api/earthquakes");
      if (!res.ok) throw new Error("Failed to fetch earthquakes");
      const data: USGSResponse = await res.json();
      return data.features.map(usgsToEvent);
    },
    refetchInterval: 5 * 60 * 1000,
  });
}
