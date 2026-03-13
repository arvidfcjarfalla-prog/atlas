import type { MapPattern } from "../types";

export const simplePoint: MapPattern = {
  id: "simple-point",
  family: "point",
  name: "Simple Point Map",
  description:
    "Individual markers without aggregation. Best for small datasets where each location matters.",
  validGeometry: ["point"],
  validTasks: [
    "show-locations",
    "browse-places",
    "inspect-individual",
  ],
  antiPatterns: [
    "> 500 features without clustering causes visual clutter",
    "If all points are in one city, default zoom should be city-level (11–13), not global",
  ],
  template: {
    layers: [
      {
        id: "",
        kind: "asset",
        label: "",
        sourceType: "geojson-url",
        geometryType: "point",
        style: {
          markerShape: "circle",
          mapFamily: "point",
          clusterEnabled: false,
          color: { scheme: "blues", colorblindSafe: true },
        },
        interaction: {
          clickBehavior: "popup",
          hoverEffect: "highlight",
        },
      },
    ],
  },
  validationRules: [
    {
      id: "point-feature-count",
      severity: "warning",
      message: "> 500 features without clustering — consider enabling clusters or heatmap",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "point" ||
            l.style.clusterEnabled !== false ||
            !l.performance?.featureThreshold ||
            l.performance.featureThreshold <= 500,
        ),
    },
  ],
};
