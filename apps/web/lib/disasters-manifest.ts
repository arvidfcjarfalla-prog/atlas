import type { MapManifest } from "@atlas/data-models";

export const disastersManifest: MapManifest = {
  id: "disasters",
  title: "Disasters",
  description: "Real-time earthquakes, wildfires, and natural disasters worldwide.",
  theme: "explore",
  defaultCenter: [20, 0],
  defaultZoom: 2,
  defaultPitch: 22,
  layers: [
    {
      id: "earthquakes",
      kind: "event",
      label: "Earthquakes",
      sourceType: "geojson-url",
      sourceUrl: "/api/earthquakes",
      refreshIntervalMs: 5 * 60 * 1000,
      style: {
        markerShape: "circle",
        colorField: "severity",
        sizeField: "magnitude",
        clusterEnabled: true,
        clusterRadius: 50,
      },
      attribution: "USGS Earthquake Hazards Program",
      license: "Public Domain",
    },
  ],
  timeline: { enabled: true },
  modules: {
    legend: true,
    detailPanel: true,
  },
};
