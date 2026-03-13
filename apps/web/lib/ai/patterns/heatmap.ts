import type { MapPattern } from "../types";

export const heatmap: MapPattern = {
  id: "heatmap",
  family: "heatmap",
  name: "Heatmap",
  description:
    "Continuous density surface showing spatial concentration of point data. Best for revealing hotspots and patterns.",
  validGeometry: ["point"],
  validTasks: [
    "show-density",
    "find-hotspots",
    "show-concentration",
    "spatial-overview",
  ],
  antiPatterns: [
    "Heatmap with < 20 features produces meaningless blobs",
    "Heatmap at very high zoom (> 12) becomes noise",
    "Do not use heatmap for data that should be counted precisely — use choropleth",
    "Heatmap on polygon data is invalid",
  ],
  template: {
    layers: [
      {
        id: "",
        kind: "event",
        label: "",
        sourceType: "geojson-url",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "heatmap",
          maxZoom: 9,
          color: { scheme: "inferno", colorblindSafe: true },
        },
        legend: { title: "", type: "gradient" },
        interaction: { clickBehavior: "none", hoverEffect: "none" },
      },
    ],
  },
  validationRules: [
    {
      id: "heatmap-needs-points",
      severity: "error",
      message: "Heatmap requires point geometry",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "heatmap" ||
            !l.geometryType ||
            l.geometryType === "point",
        ),
    },
    {
      id: "heatmap-max-zoom",
      severity: "warning",
      message: "Heatmap maxZoom > 12 may produce noisy results",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "heatmap" ||
            !l.style.maxZoom ||
            l.style.maxZoom <= 12,
        ),
    },
  ],
};
