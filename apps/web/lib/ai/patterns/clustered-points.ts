import type { MapPattern } from "../types";

export const clusteredPoints: MapPattern = {
  id: "clustered-points",
  family: "cluster",
  name: "Clustered Point Map",
  description:
    "Aggregates dense point data at low zoom, expanding to individual markers on zoom. Best for large event or observation datasets.",
  validGeometry: ["point"],
  validTasks: [
    "show-locations",
    "show-distribution",
    "monitor-events",
    "temporal-overview",
  ],
  antiPatterns: [
    "Clustering < 50 features adds visual noise without benefit",
    "Clustering polygon data is not possible",
    "Avoid cluster + heatmap on same layer — pick one aggregation",
  ],
  template: {
    layers: [
      {
        id: "",
        kind: "event",
        label: "",
        sourceType: "geojson-url",
        style: {
          markerShape: "circle",
          mapFamily: "cluster",
          clusterEnabled: true,
          clusterRadius: 50,
          color: { scheme: "reds", colorblindSafe: true },
        },
        interaction: {
          clickBehavior: "detail-panel",
          hoverEffect: "highlight",
        },
      },
    ],
  },
  validationRules: [
    {
      id: "cluster-needs-points",
      severity: "error",
      message: "Cluster maps require point geometry",
      check: (m) =>
        m.layers.every(
          (l) =>
            l.style?.mapFamily !== "cluster" ||
            !l.geometryType ||
            l.geometryType === "point",
        ),
    },
  ],
};
